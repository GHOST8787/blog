// 活動圖（PUML activity，含泳道）。資料就是 PUML 原文：每次改動只改那幾行再重新解析，
// 沒動到的行一個字元都不變，所以匯入後直接匯出跟原檔完全相同。
// 版面、繪圖、鍵盤、滑鼠都在這一支；時序圖那一套（S.parts / S.rows）完全不碰。
//
// 焦點分三層，放在 A.sel.layer：node（預設，步驟／判斷／起訖點）／branch（判斷的分支）／lane（泳道）。

import { S, T, touch } from './state.js';
import {
    sv, el, rgb, cvar, measure, applySize, scrollRectIntoView, isExporting, skipScrollNow, render, ZOOM,
} from './render.js';
import { openFree } from './edit.js';

export const A = {
    text: '', nl: '\n', lines: [], root: [], lanes: [], laneItems: [], firstFlow: -1, flat: [],
    report: null, pos: [], sel: { layer: 'node', i: 0, j: 0, k: 0, lane: 0 }, undo: [], redo: [],
};

const inNL = (s) => String(s).replace(/\\n/g, '\n');
const outNL = (s) => String(s).split('\n').join('\\n');
// 有分支（內容）的區塊：判斷 if、迴圈 while／repeat、平行 fork
const BLOCKS = ['if', 'while', 'repeat', 'fork'];
const isBlock = (it) => it && BLOCKS.includes(it.t);
const isNode = (it) => it && (it.t === 'start' || it.t === 'stop' || it.t === 'action' || isBlock(it));
const endOf = (n) => (isBlock(n) ? n.endLine : n.end);

/* ── 解析 ─────────────────────────────────── */
export function parseAct(text) {
    const src = String(text).replace(/^﻿/, '');
    const nl = src.includes('\r\n') ? '\r\n' : '\n';
    const lines = src.split(/\r?\n/);
    const lanes = [], laneItems = [], unknown = [];
    const root = [], stack = [root], open = [];   // open：還沒收尾的區塊（if／while／repeat／fork）
    let lane = null, firstFlow = -1, kept = 0, partDepth = 0;
    // last：註記要掛在誰身上（剛畫完的步驟，或剛收尾的區塊＝掛在匯合點）；arrowIn：下一步進來那條線的樣式
    let last = null, arrowIn = null, legend = null;
    const notes = [];
    const topIs = (t) => open.length && open[open.length - 1].t === t;
    const close = (i) => { stack.pop(); const o = open.pop(); o.endLine = o.end = i; last = { node: o, after: true }; return o; };
    const until = (from, re) => { let j = from + 1; while (j < lines.length && !re.test(lines[j].trim())) j++; return Math.min(j, lines.length - 1); };

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i], t = raw.trim(), ind = raw.match(/^\s*/)[0];
        const top = stack[stack.length - 1];
        const add = (o) => {
            Object.assign(o, { line: i, ind, lane });
            if (o.end === undefined) o.end = i;
            top.push(o);
            if (o.t !== 'lane') {
                if (firstFlow < 0) firstFlow = i;
                if (arrowIn) { o.arrowIn = arrowIn; arrowIn = null; }
                last = { node: o, after: false };
            }
            return o;
        };
        let m;
        if (!t) continue;
        if (t.startsWith("/'")) { i = t.includes("'/") ? i : until(i, /'\/\s*$/); continue; }
        if (t.startsWith("'") || /^@(start|end)uml/i.test(t)) continue;
        if (/^<style>/i.test(t)) { i = until(i, /<\/style>/i); kept++; continue; }
        if (/^skinparam\b.*\{\s*$/i.test(t)) { i = until(i, /^\}$/); kept++; continue; }
        if (/^(legend|header|footer)(\s+(left|right|center|top|bottom))*$/i.test(t)) {
            const kw = t.match(/(legend|header|footer)/i)[1];
            const j = until(i, new RegExp('^end\\s*' + kw + '$', 'i'));
            if (/^legend$/i.test(kw)) legend = { pos: t.toLowerCase(), line: i, end: j, ind, body: lines.slice(i + 1, j) };
            i = j; kept++; continue;
        }
        if (/^(skinparam|title|caption|scale|hide|show|!|header|footer|left to right|top to bottom)/i.test(t)) { kept++; continue; }
        if ((m = t.match(/^\|(?:(#[^|]*)\|)?([^|]+)\|\s*$/))) {
            const name = m[2].trim();
            if (!lanes.includes(name)) lanes.push(name);
            lane = name;
            laneItems.push(add({ t: 'lane', name, color: m[1] || '' }));
            continue;
        }
        if (/^start$/i.test(t)) { add({ t: 'start' }); continue; }
        if (/^(stop|end|kill|detach)$/i.test(t)) { add({ t: 'stop', kw: t.toLowerCase() }); continue; }
        // 箭頭樣式：-[hidden]->（下一條線不畫）、-[#red]->（上色）、-> 文字;（線上標字）
        if ((m = t.match(/^-(?:\[([^\]]*)\]-)?>\s*(.*?)\s*;?$/))) {
            const st = m[1] || '';
            // PUML 的 #red 是顏色名，#ff0000 才是色碼：名字去掉 # 給 SVG 用
            let color = (st.match(/#[0-9a-z]+/i) || [''])[0];
            if (color && !/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) color = color.slice(1);
            arrowIn = { hidden: /\bhidden\b/i.test(st), color, label: inNL(m[2] || '') };
            continue;
        }
        // 註記：note left|right: 一行，或 note left|right … end note 多行；floating note 不畫指向的尖角
        if ((m = t.match(/^(floating\s+)?note\s+(left|right)\s*(?::(.*))?$/i))) {
            const one = m[3] !== undefined;
            const j = one ? i : until(i, /^end\s*note$/i);
            const body = one ? [] : lines.slice(i + 1, j);
            const nt = {
                side: m[2].toLowerCase(), floating: !!m[1], one, line: i, end: j, ind,
                innerInd: body.length ? body[0].match(/^\s*/)[0] : ind + '  ',
                text: one ? inNL(m[3].trim()) : body.map((s) => s.trim()).join('\n'),
                owner: last ? last.node : null, after: last ? last.after : false,
            };
            if (nt.owner) (nt.owner[nt.after ? 'endNotes' : 'notes'] ||= []).push(nt);
            notes.push(nt);
            i = j;
            continue;
        }
        if (t.startsWith(':')) {
            let j = i, buf = t.slice(1);
            while (!/;\s*$/.test(j === i ? t : lines[j].trim()) && j < lines.length - 1) { j++; buf += '\n' + lines[j].trim(); }
            add({ t: 'action', text: inNL(buf.replace(/;\s*$/, '')), end: j });
            i = j;
            continue;
        }
        if ((m = t.match(/^if\s*\((.*)\)\s*then\s*(?:\((.*)\))?\s*;?$/i))) {
            const o = add({ t: 'if', cond: inNL(m[1]), branches: [], endLine: -1 });
            const b = { kw: 'then', label: m[2] ?? '', line: i, ind, items: [] };
            o.branches.push(b);
            stack.push(b.items); open.push(o);
            continue;
        }
        if ((m = t.match(/^(?:else\s*if|elseif)\s*\((.*)\)\s*then\s*(?:\((.*)\))?\s*$/i)) && topIs('if')) {
            stack.pop();
            const b = { kw: 'elseif', cond: inNL(m[1]), label: m[2] ?? '', line: i, ind, items: [] };
            open[open.length - 1].branches.push(b);
            stack.push(b.items);
            continue;
        }
        if ((m = t.match(/^else\s*(?:\((.*)\))?\s*;?$/i)) && topIs('if')) {
            stack.pop();
            const b = { kw: 'else', label: m[1] ?? '', line: i, ind, items: [] };
            open[open.length - 1].branches.push(b);
            stack.push(b.items);
            continue;
        }
        if (/^end\s*if$/i.test(t) && topIs('if')) { close(i); continue; }
        // 迴圈：while (條件) is (標籤) … endwhile (離開標籤)
        if ((m = t.match(/^while\s*\((.*?)\)\s*(?:is\s*\((.*)\))?\s*;?$/i))) {
            const o = add({ t: 'while', cond: inNL(m[1]), label: m[2] ?? '', endLabel: '', branches: [], endLine: -1 });
            const b = { kw: 'body', label: o.label, line: i, ind, items: [] };
            o.branches.push(b); stack.push(b.items); open.push(o);
            continue;
        }
        if ((m = t.match(/^end\s*while\s*(?:\((.*)\))?\s*;?$/i)) && topIs('while')) { close(i).endLabel = m[1] ?? ''; continue; }
        // 迴圈：repeat … repeat while (條件) is (標籤) not (離開標籤)
        if (/^repeat\s*;?$/i.test(t)) {
            const o = add({ t: 'repeat', cond: '', label: '', endLabel: '', branches: [], endLine: -1 });
            const b = { kw: 'body', label: '', line: i, ind, items: [] };
            o.branches.push(b); stack.push(b.items); open.push(o);
            continue;
        }
        if ((m = t.match(/^repeat\s*while\s*\((.*?)\)\s*(?:is\s*\((.*?)\))?\s*(?:not\s*\((.*?)\))?\s*;?$/i)) && topIs('repeat')) {
            const o = close(i);
            Object.assign(o, { cond: inNL(m[1]), label: m[2] ?? '', endLabel: m[3] ?? '' });
            o.branches[0].label = o.label;
            continue;
        }
        // 平行：fork … fork again … end fork（split 同一套）
        if ((m = t.match(/^(fork|split)\s*;?$/i))) {
            const o = add({ t: 'fork', kw: m[1].toLowerCase(), branches: [], endLine: -1 });
            const b = { kw: 'first', label: '', line: i, ind, items: [] };
            o.branches.push(b); stack.push(b.items); open.push(o);
            continue;
        }
        if (/^(fork|split)\s+again\s*;?$/i.test(t) && topIs('fork')) {
            stack.pop();
            const b = { kw: 'again', label: '', line: i, ind, items: [] };
            open[open.length - 1].branches.push(b); stack.push(b.items);
            continue;
        }
        if (/^end\s*(fork|merge|split)\b.*$/i.test(t) && topIs('fork')) { close(i); continue; }
        // partition 名稱 { … }：外框不畫，裡面的步驟照常
        if (/^partition\b.*\{\s*$/i.test(t)) { partDepth++; kept++; continue; }
        if (/^\}\s*$/.test(t) && partDepth) { partDepth--; kept++; continue; }
        // 活動圖認得、但這一版還不畫的（註記、goto…）：原文留著，匯出照放
        if (/^(floating\s+)?note\b/i.test(t) && !t.includes(':')) { const j = until(i, /^end\s*note$/i); unknown.push({ line: i + 1, text: t }); kept += j - i + 1; i = j; continue; }
        unknown.push({ line: i + 1, text: t });
        kept++;
    }
    while (open.length) { const o = open.pop(); o.endLine = o.end = lines.length - 1; }
    return { nl, lines, lanes, laneItems, root, firstFlow, unknown, kept, notes, legend };
}

function flatten(items, out) {
    items.forEach((it) => {
        if (!isNode(it)) return;
        it.parent = items;
        out.push(it);
        if (isBlock(it)) it.branches.forEach((b) => flatten(b.items, out));
    });
    return out;
}

/* 換一份原文。selLine：重新解析後要選到第幾行那個節點 */
export function setAct(text, selLine) {
    const r = parseAct(text);
    Object.assign(A, r, { text: String(text) });
    A.flat = flatten(A.root, []);
    A.report = {
        kind: 'pumlAct', lanes: A.lanes.length, actions: A.flat.filter((n) => n.t === 'action').length,
        ifs: A.flat.filter((n) => n.t === 'if').length, stops: A.flat.filter((n) => n.t === 'stop').length,
        loops: A.flat.filter((n) => n.t === 'while' || n.t === 'repeat').length, forks: A.flat.filter((n) => n.t === 'fork').length,
        notes: A.notes.length, legend: A.legend ? 1 : 0,
        kept: A.kept, unknown: A.unknown,
    };
    if (selLine != null && A.flat.length) {
        let k = A.flat.findIndex((n) => n.line >= selLine);
        if (k < 0) k = A.flat.length - 1;
        A.sel = { ...A.sel, layer: A.sel.layer === 'lane' ? 'lane' : 'node', i: k, j: k };
    }
    A.sel.i = Math.max(0, Math.min(A.sel.i, A.flat.length - 1));
    A.sel.j = Math.max(0, Math.min(A.sel.j, A.flat.length - 1));
    A.sel.lane = Math.max(0, Math.min(A.sel.lane, A.lanes.length - 1));
}
export const actEmpty = () => !A.flat.length;

/* 改原文：存復原點 → 換成新的行 → 重新解析 → 重畫。
   merge：接在上一個動作後面的編輯（例如新增一步後馬上打字），跟上一步算同一次，Ctrl+Z 一次就回去 */
function apply(lines, selLine, merge) {
    if (!merge) A.undo.push({ text: A.text, line: curLine() });
    if (A.undo.length > 80) A.undo.shift();
    A.redo.length = 0;
    setAct(lines.join(A.nl), selLine);
    touch();
    render();
}
export function setActText(text) {   // 原始碼框打字、開檔都走這裡
    if (text === A.text) return;
    A.undo.push({ text: A.text, line: curLine() });
    A.redo.length = 0;
    setAct(text, curLine());
    touch();
}
const curLine = () => (A.flat[A.sel.i] ? A.flat[A.sel.i].line : 0);
export function actUndo() {
    if (!A.undo.length) return;
    A.redo.push({ text: A.text, line: curLine() });
    const o = A.undo.pop(); setAct(o.text, o.line); touch(); render();
}
export function actRedo() {
    if (!A.redo.length) return;
    A.undo.push({ text: A.text, line: curLine() });
    const o = A.redo.pop(); setAct(o.text, o.line); touch(); render();
}

/* ── 版面與繪圖 ───────────────────────────── */
const GAP = 26, HDR = 34, LEFT = 16, FS = 12.5, LH = 16;
const textLines = (s) => String(s == null ? '' : s).split('\n');

function boxOf(n) {
    const ls = textLines(n.text);
    return { w: Math.max(96, measure(n.text, FS) + 28), h: ls.length * LH + 16 };
}
function hexOf(n) {
    const ls = textLines(n.cond);
    return { hw: Math.max(44, (measure(n.cond, FS) + 52) / 2), hh: ls.length * LH + 16 };
}

const NFS = 11.5, NLH = 15;
function noteSize(nt) {
    return { w: measure(nt.text || ' ', NFS) * 1.04 + 12 + 12, h: textLines(nt.text).length * NLH + 10 };
}
// legend 內文：== 標題 ==、---- 分隔線，其他照原樣一行一行
function legendSize(lg) {
    const rows = lg.body.map((s) => s.trim()).map((s) => (/^(-{2,}|={2,}|\.{2,}|_{2,})$/.test(s) ? { sep: true }
        : /^==.*==$/.test(s) ? { text: s.replace(/^=+\s*|\s*=+$/g, ''), bold: true } : { text: s }));
    let w = 120, h = 10;
    rows.forEach((r) => { if (r.sep) h += 10; else { w = Math.max(w, measure(r.text, NFS, r.bold ? 700 : 400) * 1.06 + 28); h += NLH + 2; } });
    return { rows, w, h: h + 6 };
}
function drawLegend(g0, x, y, lg) {
    const g = el('g', { 'data-legend': '', style: 'cursor:pointer' });
    g.appendChild(el('rect', { x, y, width: lg.w, height: lg.h, rx: 4, fill: rgb('--c-surface'), stroke: A.legendOn ? rgb('--c-purple') : rgb('--c-ink', '.3'), 'stroke-width': A.legendOn ? 1.6 : 1 }));
    let yy = y + 8;
    lg.rows.forEach((r) => {
        if (r.sep) { g.appendChild(el('line', { x1: x + 6, y1: yy + 4, x2: x + lg.w - 6, y2: yy + 4, stroke: rgb('--c-ink', '.25') })); yy += 10; return; }
        const t = el('text', { x: r.bold ? x + lg.w / 2 : x + 12, y: yy + 12, 'text-anchor': r.bold ? 'middle' : 'start', 'font-size': NFS, 'font-weight': r.bold ? 700 : 400, 'font-family': 'inherit', fill: rgb('--c-body') });
        t.textContent = r.text;
        g.appendChild(t);
        yy += NLH + 2;
    });
    g0.appendChild(g);
}

let lastSelKey = '';
export function renderAct() {
    const exporting = isExporting();
    const C_ON = rgb('--c-purple'), C_TXT = rgb('--c-body'), C_LINE = rgb('--c-ink', '.55');
    sv.textContent = '';
    A.pos = [];
    const lanes = A.lanes.length ? A.lanes : [''];
    const li = (n) => Math.max(0, lanes.indexOf(n.lane ?? lanes[0]));

    if (!A.flat.length) {
        const W = 620, H = 220;
        sv.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: rgb('--c-bg') }));
        const t = el('text', { x: W / 2, y: 100, 'text-anchor': 'middle', 'font-size': 13, 'font-family': 'inherit', fill: cvar('--c-dim') });
        t.textContent = T.act.empty;
        const t2 = el('text', { x: W / 2, y: 126, 'text-anchor': 'middle', 'font-size': 12, 'font-family': 'inherit', fill: cvar('--c-dim') });
        t2.textContent = T.act.emptyHint;
        sv.append(t, t2);
        applySize(W, H);
        paintActStatus();
        return;
    }

    /* 1. 欄位：每個節點拿一個「槽」，判斷的分支並排佔用相鄰的槽 */
    let slotW = 190;
    A.flat.forEach((n) => {
        if (n.t === 'action') slotW = Math.max(slotW, boxOf(n).w + 40);
        if (n.t === 'if' || n.t === 'while' || n.t === 'repeat') slotW = Math.max(slotW, hexOf(n).hw * 2 + 40);
    });
    slotW = Math.min(slotW, 360);
    const laneMax = lanes.map(() => 1);
    const assign = (items, slot) => {
        let used = 1;
        items.forEach((it) => {
            if (!isNode(it)) return;
            it.slot = slot;
            laneMax[li(it)] = Math.max(laneMax[li(it)], slot + 1);
            if (it.t === 'if' || it.t === 'fork') {        // 分支並排
                let s = slot;
                it.branches.forEach((b) => { b.slot = s; s += assign(b.items, s); });
                it.used = s - slot;
                used = Math.max(used, it.used);
            } else if (isBlock(it)) {                       // 迴圈：內容在同一欄往下
                const b = it.branches[0];
                b.slot = slot;
                it.used = assign(b.items, slot);
                used = Math.max(used, it.used);
            }
        });
        return used;
    };
    assign(A.root, 0);
    const laneW = lanes.map((nm, k) => Math.max(laneMax[k] * slotW, measure(nm, FS, 600) + 40));
    // 第一條泳道裡掛在左邊的註記會超出畫布左緣：預先把整張圖往右挪出位置
    let padL = LEFT;
    A.notes.forEach((nt) => {
        if (nt.side === 'left' && nt.owner && li(nt.owner) === 0) padL = Math.max(padL, LEFT + noteSize(nt).w + 24 - (slotW - 150) / 2);
    });
    const laneX = [];
    laneW.reduce((x, w, k) => { laneX[k] = x; return x + w; }, padL);
    let W = padL + LEFT + laneW.reduce((a, b) => a + b, 0);
    A.laneGeo = { x: laneX, w: laneW };     // 拖曳時用來判斷滑鼠在哪條泳道
    const nx = (n) => laneX[li(n)] + n.slot * slotW + slotW / 2;

    const gBg = el('g'), gEdge = el('g'), gNode = el('g');
    const defs = el('defs');
    for (const [k, c] of [['n', C_LINE], ['s', C_ON]]) {
        const mk = el('marker', { id: 'ak-' + k, markerWidth: 10, markerHeight: 10, refX: 8, refY: 4, orient: 'auto', markerUnits: 'userSpaceOnUse' });
        mk.appendChild(el('path', { d: 'M0,0 L8,4 L0,8 z', fill: c }));
        defs.appendChild(mk);
    }
    const hasLanes = A.lanes.length > 0;
    let y = hasLanes ? HDR + 30 : 24;
    const leg = A.legend ? legendSize(A.legend) : null;
    const legTop = leg && /\btop\b/.test(A.legend.pos);
    if (legTop) y += leg.h + 18;

    const L = A.sel.layer;
    const [sa, sb] = [Math.min(A.sel.i, A.sel.j), Math.max(A.sel.i, A.sel.j)];
    const isOn = (fi) => L === 'node' && fi >= sa && fi <= sb;

    const arrow = (d, on, color) => {
        let mk = on ? 's' : 'n';
        if (color && !on) {                       // -[#色]-> 上色：箭頭也要同色，一個顏色一個 marker
            mk = 'c' + color.replace(/\W/g, '');
            if (!defs.querySelector('#ak-' + mk)) {
                const m = el('marker', { id: 'ak-' + mk, markerWidth: 10, markerHeight: 10, refX: 8, refY: 4, orient: 'auto', markerUnits: 'userSpaceOnUse' });
                m.appendChild(el('path', { d: 'M0,0 L8,4 L0,8 z', fill: color }));
                defs.appendChild(m);
            }
        }
        gEdge.appendChild(el('path', { d, fill: 'none', stroke: on ? C_ON : color || C_LINE, 'stroke-width': 1.3, 'marker-end': `url(#ak-${mk})` }));
    };
    const label = (x, yy, txt, fi, k) => {
        if (!txt) return;
        const on = L === 'branch' && A.sel.i === fi && A.sel.k === k;
        const t = el('text', { x, y: yy, 'font-size': 11.5, 'font-family': 'inherit', fill: on ? C_ON : cvar('--c-dim'), 'font-weight': on ? 600 : 400, 'data-branch': `${fi}:${k}`, style: 'cursor:pointer' });
        t.textContent = txt;
        gEdge.appendChild(t);
    };
    function link(opens, tx, ty, merge, st) {
        if (st && st.hidden) return;
        if (st && st.label && opens.length) plainLabel(Math.max(...opens.map((o) => o.x), tx) + 8, (Math.max(...opens.map((o) => o.y)) + ty) / 2 + 4, st.label);
        opens.forEach((o) => {
            let d;
            if (merge) {
                if (Math.abs(o.x - tx) < 1) d = `M${o.x},${o.y} V${ty}`;
                else if (o.side) d = `M${o.x},${o.y} H${o.x + 18} V${ty + 10} H${tx + 10}`;
                else d = `M${o.x},${o.y} V${ty + 10} H${o.x < tx ? tx - 10 : tx + 10}`;
            } else if (o.side) {
                d = tx > o.x + 8 ? `M${o.x},${o.y} H${tx} V${ty}` : `M${o.x},${o.y} H${o.x + 18} V${ty - 13} H${tx} V${ty}`;
            } else if (Math.abs(o.x - tx) < 1) d = `M${o.x},${o.y} V${ty}`;
            else d = `M${o.x},${o.y} V${ty - 13} H${tx} V${ty}`;
            arrow(d, false, st && st.color);
            if (o.label) label(o.lab[0], o.lab[1], o.label, o.bk[0], o.bk[1]);
        });
    }
    // 註記：右上角折角的便條（PlantUML 的 Opale 畫法），側邊一個尖角指到掛著的那一步。
    // box：被掛的東西的外框。回傳註記底部比外框底部多出來的高度，讓下一步往下讓位
    let maxX = 0;
    function drawNotes(list, box) {
        let extra = 0;
        (list || []).forEach((nt, k) => {
            const { w, h } = noteSize(nt), cy = box.y + box.h / 2;
            const gap = 18 + k * 0;
            const x = nt.side === 'left' ? box.x - gap - w : box.x + box.w + gap;
            const top = h <= box.h ? box.y + (box.h - h) / 2 : box.y;
            const by = Math.max(top + 14, Math.min(top + h - 6, cy));   // 尖角的位置夾在便條範圍內
            let d;
            if (nt.floating) d = `M${x},${top} H${x + w - 10} L${x + w},${top + 10} V${top + h} H${x} Z`;
            else if (nt.side === 'left') d = `M${x},${top} H${x + w - 10} L${x + w},${top + 10} V${by - 4} L${box.x},${cy} L${x + w},${by + 4} V${top + h} H${x} Z`;
            else d = `M${x},${top} H${x + w - 10} L${x + w},${top + 10} V${top + h} H${x} V${by + 4} L${box.x + box.w},${cy} L${x},${by - 4} Z`;
            const idx = A.notes.indexOf(nt);
            const g = el('g', { 'data-note': idx, style: 'cursor:pointer' });
            const on = A.noteOn === idx;
            g.appendChild(el('path', { d, fill: on ? rgb('--c-purple', '.14') : rgb('--c-warn', '.10'), stroke: on ? C_ON : rgb('--c-warn', '.55'), 'stroke-width': on ? 1.6 : 1 }));
            g.appendChild(el('path', { d: `M${x + w - 10},${top} V${top + 10} H${x + w}`, fill: 'none', stroke: on ? C_ON : rgb('--c-warn', '.55') }));
            putText(g, x + 6, top + 5 + 11.5, nt.text, on ? C_ON : rgb('--c-warn'), 'start', NFS);
            gNode.appendChild(g);
            maxX = Math.max(maxX, x + w);
            extra = Math.max(extra, top + h - (box.y + box.h));
        });
        return extra;
    }
    const nodeG = (fi) => {
        const g = el('g', { 'data-node': fi, style: 'cursor:pointer' });
        gNode.appendChild(g);
        return g;
    };
    const putText = (g, x, yy, str, fill, anchor, fs) => {
        const t = el('text', { x, y: yy, 'text-anchor': anchor || 'middle', 'font-size': fs || FS, 'font-family': 'inherit', fill });
        textLines(str).forEach((s, k) => { const sp = el('tspan', { x, dy: k ? LH : 0 }); sp.textContent = s; t.appendChild(sp); });
        g.appendChild(t);
    };

    // 判斷、迴圈條件用的六角框
    function hexG(fi, x, yy, hw, hh, cond, on, brOn) {
        const g = nodeG(fi);
        g.appendChild(el('path', {
            d: `M${x - hw},${yy + hh / 2} L${x - hw + 12},${yy} H${x + hw - 12} L${x + hw},${yy + hh / 2} L${x + hw - 12},${yy + hh} H${x - hw + 12} Z`,
            fill: on || brOn ? rgb('--c-purple', '.14') : rgb('--c-warn', '.08'),
            stroke: on || brOn ? C_ON : rgb('--c-warn', '.6'), 'stroke-width': on ? 1.6 : 1,
        }));
        putText(g, x, yy + 20, cond, on ? C_ON : rgb('--c-warn'));
        A.pos[fi] = { x: x - hw, y: yy, w: hw * 2, h: hh };
    }
    // 匯合菱形：屬於某個區塊，點它等於選那個區塊
    function mergeG(fi, x, my, lit) {
        const mg = el('g', { 'data-node': fi, 'data-merge': '', style: 'cursor:pointer' });
        mg.appendChild(el('rect', { x: x - 14, y: my - 4, width: 28, height: 28, fill: 'transparent' }));
        mg.appendChild(el('path', { d: `M${x},${my} L${x + 10},${my + 10} L${x},${my + 20} L${x - 10},${my + 10} Z`,
            fill: lit ? rgb('--c-purple', '.14') : rgb('--c-surface'),
            stroke: lit ? C_ON : rgb('--c-ink', '.4'), 'stroke-width': lit ? 1.6 : 1 }));
        gNode.appendChild(mg);
    }
    // fork 的粗橫線：上面那條是區塊本身，下面那條是收合（跟菱形一樣點了選區塊）
    function barG(fi, x0, x1, yy, lit, isJoin) {
        const g = el('g', { 'data-node': fi, style: 'cursor:pointer' });
        if (isJoin) g.setAttribute('data-merge', '');
        g.appendChild(el('rect', { x: x0, y: yy - 6, width: x1 - x0, height: 18, fill: 'transparent' }));
        g.appendChild(el('rect', { x: x0, y: yy, width: x1 - x0, height: 6, rx: 2, fill: lit ? C_ON : rgb('--c-ink', '.8') }));
        gNode.appendChild(g);
        if (!isJoin) A.pos[fi] = { x: x0, y: yy, w: x1 - x0, h: 6 };
    }
    // 不能選的說明字（迴圈離開時的標籤）
    function plainLabel(x, yy, txt) {
        if (!txt) return;
        const t = el('text', { x, y: yy, 'font-size': 11.5, 'font-family': 'inherit', fill: cvar('--c-dim') });
        t.textContent = txt;
        gEdge.appendChild(t);
    }
    function flow(items, opens) {
        items.forEach((it) => {
            if (!isNode(it)) return;
            const fi = A.flat.indexOf(it), x = nx(it), on = isOn(fi);
            const col = on ? C_ON : C_TXT;
            if (it.arrowIn && it.arrowIn.label && !it.arrowIn.hidden && opens.length) y += 16;   // 線上有字：拉長一點放得下
            if (it.t === 'start') {
                link(opens, x, y, false, it.arrowIn);
                const g = nodeG(fi);
                g.appendChild(el('circle', { cx: x, cy: y + 10, r: on ? 10 : 9, fill: on ? C_ON : rgb('--c-ink', '.85') }));
                A.pos[fi] = { x: x - 10, y, w: 20, h: 20 };
                opens = [{ x, y: y + 20 }];
                y += 20 + GAP + drawNotes(it.notes, A.pos[fi]);
            } else if (it.t === 'stop' && it.kw === 'detach') {
                // detach：流程到這裡斷開，不畫終點也不畫進來的線；編輯時留一個虛線小圈讓人點得到
                const g = nodeG(fi);
                if (!exporting) g.appendChild(el('circle', { cx: x, cy: y - GAP / 2 + 6, r: 5, fill: 'none', stroke: on ? C_ON : rgb('--c-ink', '.3'), 'stroke-dasharray': '2 2' }));
                A.pos[fi] = { x: x - 6, y: y - GAP / 2, w: 12, h: 12 };
                opens = [];
                y += drawNotes(it.notes, A.pos[fi]);
            } else if (it.t === 'stop') {
                link(opens, x, y, false, it.arrowIn);
                const g = nodeG(fi), ink = on ? C_ON : rgb('--c-ink', '.85');
                if (it.kw === 'kill') {           // kill：一個 ×
                    g.appendChild(el('path', { d: `M${x - 8},${y + 3} L${x + 8},${y + 19} M${x + 8},${y + 3} L${x - 8},${y + 19}`, stroke: ink, 'stroke-width': 2.2 }));
                } else {
                    g.appendChild(el('circle', { cx: x, cy: y + 11, r: 10.5, fill: 'none', stroke: ink, 'stroke-width': 1.6 }));
                    g.appendChild(el('circle', { cx: x, cy: y + 11, r: 6, fill: ink }));
                }
                A.pos[fi] = { x: x - 11, y, w: 22, h: 22 };
                opens = [];
                y += 22 + GAP + drawNotes(it.notes, A.pos[fi]);
            } else if (it.t === 'action') {
                const { w, h } = boxOf(it);
                link(opens, x, y, false, it.arrowIn);
                const g = nodeG(fi);
                g.appendChild(el('rect', { x: x - w / 2, y, width: w, height: h, rx: 9,
                    fill: on ? rgb('--c-purple', '.14') : rgb('--c-surface'), stroke: on ? C_ON : rgb('--c-ink', '.22'), 'stroke-width': on ? 1.6 : 1 }));
                putText(g, x, y + 21, it.text, col);
                A.pos[fi] = { x: x - w / 2, y, w, h };
                opens = [{ x, y: y + h }];
                y += h + GAP + drawNotes(it.notes, A.pos[fi]);
            } else if (it.t === 'if') {
                const { hw, hh } = hexOf(it), y0 = y;
                link(opens, x, y, false, it.arrowIn);
                const g = nodeG(fi);
                const brOn = L === 'branch' && A.sel.i === fi;
                g.appendChild(el('path', {
                    d: `M${x - hw},${y + hh / 2} L${x - hw + 12},${y} H${x + hw - 12} L${x + hw},${y + hh / 2} L${x + hw - 12},${y + hh} H${x - hw + 12} Z`,
                    fill: on || brOn ? rgb('--c-purple', '.14') : rgb('--c-warn', '.08'),
                    stroke: on || brOn ? C_ON : rgb('--c-warn', '.6'), 'stroke-width': on ? 1.6 : 1,
                }));
                putText(g, x, y + 20, it.cond, on ? C_ON : rgb('--c-warn'));
                A.pos[fi] = { x: x - hw, y, w: hw * 2, h: hh };
                drawNotes(it.notes, A.pos[fi]);
                const top0 = y + hh + 26;
                let maxY = top0;
                const ends = [];
                it.branches.forEach((b, k) => {
                    y = top0;
                    const start = k === 0
                        ? [{ x, y: y0 + hh, label: b.label, lab: [x + 6, y0 + hh + 14], bk: [fi, k] }]
                        : [{ x: x + hw, y: y0 + hh / 2, side: true, label: b.label, lab: [x + hw + 6, y0 + hh / 2 - 6], bk: [fi, k] }];
                    ends.push(...flow(b.items, start));
                    maxY = Math.max(maxY, y);
                });
                if (it.branches.length === 1) {   // 只有 then 沒有 else：沒走進去的那條直接繞到匯合點
                    ends.push({ x: x + hw, y: y0 + hh / 2, side: true });
                }
                y = maxY;
                if (ends.length) {
                    const my = y;
                    link(ends, x, my, true);
                    // 匯合菱形＝這個判斷的 endif：點它就選到這個判斷，選到判斷時跟著亮
                    mergeG(fi, x, my, on || brOn);
                    opens = [{ x, y: my + 20 }];
                    y = my + 20 + GAP + drawNotes(it.endNotes, { x: x - 10, y: my, w: 20, h: 20 });
                } else opens = [];
            } else if (it.t === 'while') {
                /* while：條件在上，內容往下，做完從左邊繞回條件；不成立從右邊出去 */
                const { hw, hh } = hexOf(it), y0 = y, brOn = L === 'branch' && A.sel.i === fi;
                const left = nx(it) - slotW / 2, xl = left + 8, xr = left + (it.used || 1) * slotW - 8;
                link(opens, x, y, false, it.arrowIn);
                hexG(fi, x, y, hw, hh, it.cond, on, brOn);
                drawNotes(it.notes, A.pos[fi]);
                y = y0 + hh + 26;
                const ends = flow(it.branches[0].items, [{ x, y: y0 + hh, label: it.label, lab: [x + 6, y0 + hh + 14], bk: [fi, 0] }]);
                const yt = y - GAP + 10;
                ends.forEach((o) => {
                    arrow(`M${o.x},${o.y} V${yt} H${xl} V${y0 + hh / 2} H${x - hw}`, false);
                    if (o.label && o.bk) label(o.lab[0], o.lab[1], o.label, o.bk[0], o.bk[1]);
                });
                const ye = yt + 14;
                gEdge.appendChild(el('path', { d: `M${x + hw},${y0 + hh / 2} H${xr} V${ye} H${x}`, fill: 'none', stroke: C_LINE, 'stroke-width': 1.3 }));
                plainLabel(x + hw + 6, y0 + hh / 2 - 6, it.endLabel);
                opens = [{ x, y: ye }];
                y = ye + 16 + drawNotes(it.endNotes, { x: x - 4, y: ye - 4, w: 8, h: 8 });
            } else if (it.t === 'repeat') {
                /* repeat：上面一個菱形當起點，內容做完到條件，成立從左邊繞回菱形，不成立往下 */
                const { hw, hh } = hexOf(it), brOn = L === 'branch' && A.sel.i === fi;
                const xl = nx(it) - slotW / 2 + 8;
                link(opens, x, y, false, it.arrowIn);
                const yd = y;
                mergeG(fi, x, yd, on || brOn);
                y = yd + 20 + GAP;
                const ends = flow(it.branches[0].items, [{ x, y: yd + 20 }]);
                const yh = y;
                link(ends, x, yh);
                hexG(fi, x, yh, hw, hh, it.cond, on, brOn);
                arrow(`M${x - hw},${yh + hh / 2} H${xl} V${yd + 10} H${x - 10}`, false);
                label(xl + 6, yd + 6, it.label, fi, 0);
                plainLabel(x + 6, yh + hh + 14, it.endLabel);
                opens = [{ x, y: yh + hh }];
                y = yh + hh + GAP + drawNotes(it.endNotes, A.pos[fi]);
            } else if (it.t === 'fork') {
                /* fork：一條粗橫線分出去，各分支並排往下，最後再收進一條粗橫線 */
                const brOn = L === 'branch' && A.sel.i === fi;
                const xs = it.branches.map((b, k) => {
                    const f = b.items.find(isNode);
                    return f ? nx(f) : laneX[li(it)] + b.slot * slotW + slotW / 2 + (k ? 0 : 0);
                });
                const bx0 = Math.min(x, ...xs) - 30, bx1 = Math.max(x, ...xs) + 30;
                link(opens, x, y, false, it.arrowIn);
                const yb = y;
                barG(fi, bx0, bx1, yb, on || brOn, false);
                let maxY = yb + 6 + 26;
                const ends = [];
                it.branches.forEach((b, k) => {
                    y = yb + 6 + 26;
                    if (brOn && A.sel.k === k) gEdge.appendChild(el('line', { x1: xs[k], y1: yb + 6, x2: xs[k], y2: yb + 6 + 22, stroke: C_ON, 'stroke-width': 3 }));
                    gEdge.appendChild(el('rect', { x: xs[k] - 12, y: yb + 6, width: 24, height: 22, fill: 'transparent', 'data-branch': `${fi}:${k}`, style: 'cursor:pointer' }));
                    const e = flow(b.items, [{ x: xs[k], y: yb + 6 }]);
                    ends.push(...e);
                    maxY = Math.max(maxY, y);
                });
                const jy = maxY - GAP + 16;
                ends.forEach((o) => arrow(o.side ? `M${o.x},${o.y} H${o.x + 18} V${jy}` : `M${o.x},${o.y} V${jy}`, false));
                barG(fi, bx0, bx1, jy, on || brOn, true);
                opens = [{ x, y: jy + 6 }];
                y = jy + 6 + GAP + drawNotes(it.endNotes, { x: bx0, y: jy, w: bx1 - bx0, h: 6 });
            }
        });
        return opens;
    }
    flow(A.root, []);
    W = Math.max(W, maxX + LEFT);
    if (leg) {
        // legend left|center|right × top|bottom（預設置中、放在最下面）
        const lx = /\bleft\b/.test(A.legend.pos) ? padL : /\bright\b/.test(A.legend.pos) ? Math.max(padL, W - LEFT - leg.w) : Math.max(padL, (W - leg.w) / 2);
        const ly = legTop ? (hasLanes ? HDR + 22 : 14) : y;
        drawLegend(gNode, lx, ly, leg);
        W = Math.max(W, lx + leg.w + LEFT);
        if (!legTop) y += leg.h + 16;
    }
    const H = y + 10;

    /* 泳道：標頭與分隔線 */
    if (hasLanes) {
        lanes.forEach((nm, k) => {
            const on = L === 'lane' && A.sel.lane === k;
            if (on) gBg.appendChild(el('rect', { x: laneX[k], y: 8, width: laneW[k], height: H - 8, fill: rgb('--c-purple', '.06') }));
            const g = el('g', { 'data-lane': k, style: 'cursor:pointer' });
            g.appendChild(el('rect', { x: laneX[k] + 3, y: 8, width: laneW[k] - 6, height: HDR, rx: 6,
                fill: on ? rgb('--c-purple', '.16') : rgb('--c-surface'), stroke: on ? C_ON : rgb('--c-ink', '.12') }));
            const t = el('text', { x: laneX[k] + laneW[k] / 2, y: 8 + HDR / 2 + 4.5, 'text-anchor': 'middle', 'font-size': FS, 'font-weight': 600, 'font-family': 'inherit', fill: on ? C_ON : C_TXT });
            t.textContent = nm;
            g.appendChild(t);
            gBg.appendChild(g);
            if (k) gBg.appendChild(el('line', { x1: laneX[k], y1: 8, x2: laneX[k], y2: H, stroke: rgb('--c-ink', '.12') }));
        });
    }
    sv.append(defs, el('rect', { x: 0, y: 0, width: W, height: H, fill: rgb('--c-bg') }), gBg, gEdge, gNode);
    // 點擊用的透明底，放在每個節點最下層
    if (!exporting) {
        gNode.querySelectorAll('[data-node]:not([data-merge])').forEach((g) => {
            const p = A.pos[+g.dataset.node];
            if (p) g.insertBefore(el('rect', { x: p.x - 6, y: p.y - 4, width: p.w + 12, height: p.h + 8, fill: 'transparent' }), g.firstChild);
        });
    }
    applySize(W, H);
    if (exporting) return;
    paintActStatus();
    const key = JSON.stringify(A.sel);
    if (key !== lastSelKey) { lastSelKey = key; if (!skipScrollNow()) actKeepInView(); }
}

function actKeepInView() {
    let target = null;
    if (A.sel.layer === 'lane') target = sv.querySelector(`[data-lane="${A.sel.lane}"]`);
    else if (A.sel.layer === 'branch') target = sv.querySelector(`[data-branch="${A.sel.i}:${A.sel.k}"]`) || sv.querySelector(`[data-node="${A.sel.i}"]`);
    else target = sv.querySelector(`[data-node="${A.sel.j}"]`);
    if (!target) return;
    const r = target.getBoundingClientRect();
    scrollRectIntoView(r.left - 30, r.top - 20, r.right + 30, r.bottom + 20);
}

/* 狀態列與頁首統計 */
function paintActStatus() {
    const w = document.getElementById('stWhat'), k = document.getElementById('stKeys');
    const foot = document.getElementById('foot');
    const R = A.report || {};
    foot.textContent = T.msg.footAct(A.lanes.length, R.actions || 0, R.ifs || 0, R.stops || 0);
    if (!A.flat.length) { w.textContent = T.act.emptyWhat; k.innerHTML = T.act.emptyKeys; return; }
    const n = A.flat[A.sel.i];
    const flat1 = (s) => textLines(s).join(' ');
    if (A.sel.layer === 'lane') {
        w.textContent = T.act.laneWhat(A.lanes[A.sel.lane] || '');
        k.innerHTML = T.act.laneKeys;
        return;
    }
    if (A.sel.layer === 'branch' && n && isBlock(n)) {
        const b = n.branches[A.sel.k];
        if (n.t === 'if') { w.textContent = T.act.branchWhat(flat1(n.cond), b ? b.label : ''); k.innerHTML = T.act.branchKeys; }
        else if (n.t === 'fork') { w.textContent = T.act.forkBranchWhat(A.sel.k + 1, n.branches.length); k.innerHTML = T.act.forkBranchKeys; }
        else { w.textContent = T.act.loopBodyWhat(flat1(n.cond)); k.innerHTML = T.act.loopBodyKeys; }
        return;
    }
    const a = Math.min(A.sel.i, A.sel.j) + 1, b = Math.max(A.sel.i, A.sel.j) + 1;
    const what = n.t === 'action' ? T.act.kAction(flat1(n.text)) : n.t === 'if' ? T.act.kIf(flat1(n.cond))
        : n.t === 'while' ? T.act.kWhile(flat1(n.cond)) : n.t === 'repeat' ? T.act.kRepeat(flat1(n.cond))
            : n.t === 'fork' ? T.act.kFork(n.branches.length) : n.t === 'start' ? T.act.kStart : T.act.kStop;
    w.textContent = `${T.act.stepSpan(a, b)} · ${what}${n.lane ? ' · ' + n.lane : ''}`;
    const keys = n.t === 'if' ? T.act.ifKeys : n.t === 'fork' ? T.act.forkKeys : isBlock(n) ? T.act.loopKeys : T.act.nodeKeys;
    k.innerHTML = keys + ` <span class="more">· ${T.layer.more}</span>`;
}

/* ── 改原文的動作 ─────────────────────────── */
const lns = () => A.lines.slice();
function group() {
    const a = Math.min(A.sel.i, A.sel.j), b = Math.max(A.sel.i, A.sel.j);
    const first = A.flat[a], last = A.flat[b];
    if (!first) return null;
    // 只認同一層的連續兄弟；選到跨層的就退回單一個
    if (!last || last.parent !== first.parent) return { first, last: first, s: first.line, e: tailOf(first) };
    return { first, last, s: first.line, e: tailOf(last) };
}
const laneAtLine = (line) => {
    let name = null;
    A.laneItems.forEach((x) => { if (x.line <= line) name = x.name; });
    return name;
};
const nextNonBlank = (ls, from, d) => { let k = from; while (k >= 0 && k < ls.length && !ls[k].trim()) k += d; return k; };
const laneLineRe = /^\s*\|(?:#[^|]*\|)?([^|]+)\|\s*$/;

function editNode(fi, merge) {
    const n = A.flat[fi], p = A.pos[fi];
    if (!n || !p) return;
    if (n.t === 'fork') { flash(T.act.forkNoText); return; }
    if (n.t === 'start' || n.t === 'stop') return;
    const val = n.t === 'action' ? n.text : n.cond;
    openFree(p.x, p.y + p.h / 2 - 22, val, Math.max(240, p.w + 20), (v) => {
        if (!v || v === val) { render(); return; }
        const ls = lns();
        if (n.t === 'action') ls.splice(n.line, n.end - n.line + 1, `${n.ind}:${outNL(v)};`);
        else if (n.t === 'while') ls[n.line] = whileLine(n, v, n.label);
        else if (n.t === 'repeat') ls[n.endLine] = repeatEnd(n, ls, v, n.label);
        else {
            const b0 = n.branches[0];
            ls[n.line] = `${n.ind}if (${outNL(v)}) then${b0 && b0.label !== '' ? ` (${b0.label})` : ''}`;
        }
        apply(ls, n.line, merge);
    });
}
/* 註記：雙擊或 Alt+N 改字；改成空的＝刪掉。原本是一行的寫回一行，多行的寫回 note … end note */
function noteLines(nt, v) {
    const head = `${nt.ind}${nt.floating ? 'floating ' : ''}note ${nt.side}`;
    if (nt.one) return [`${head}: ${outNL(v)}`];
    return [head, ...v.split('\n').map((s) => nt.innerInd + s), `${nt.ind}end note`];
}
function editNote(idx, merge) {
    const nt = A.notes[idx], g = sv.querySelector(`[data-note="${idx}"]`);
    if (!nt || !g) return;
    const bb = g.getBBox(), sel = nt.owner ? nt.owner.line : nt.line;
    A.noteOn = idx; render();
    openFree(bb.x, bb.y + bb.height / 2 - 22, nt.text, Math.max(220, bb.width + 20), (v) => {
        A.noteOn = null;
        if (v === nt.text) { render(); return; }
        const ls = lns();
        if (!v) ls.splice(nt.line, nt.end - nt.line + 1);
        else ls.splice(nt.line, nt.end - nt.line + 1, ...noteLines(nt, v));
        apply(ls, sel, merge);
    });
}
// Alt+N：選到的步驟已經有註記就改它，沒有就在右邊加一張（區塊加在匯合點旁邊）
function noteForSel() {
    const n = A.flat[A.sel.i];
    if (!n) return;
    const has = (isBlock(n) ? n.endNotes : n.notes) || [];
    if (has.length) { editNote(A.notes.indexOf(has[0])); return; }
    const at = endOf(n) + 1, ls = lns();
    ls.splice(at, 0, `${n.ind}note right: ${T.act.newNote}`);
    apply(ls, n.line);
    const k = A.notes.findIndex((x) => x.line === at);
    if (k >= 0) editNote(k, true);
}
function editLegend() {
    const lg = A.legend, g = sv.querySelector('[data-legend]');
    if (!lg || !g) return;
    const bb = g.getBBox(), val = lg.body.map((s) => s.trim()).join('\n');
    A.legendOn = true; render();
    openFree(bb.x, bb.y, val, Math.max(260, bb.width + 20), (v) => {
        A.legendOn = false;
        if (v === val) { render(); return; }
        const ls = lns(), inner = lg.body.length ? lg.body[0].match(/^\s*/)[0] : lg.ind + '  ';
        if (!v) ls.splice(lg.line, lg.end - lg.line + 1);
        else ls.splice(lg.line + 1, lg.end - lg.line - 1, ...v.split('\n').map((s) => inner + s));
        apply(ls, curLine());
    });
}
// 步驟連同掛在它身上的註記算一整塊（搬、刪、在後面加都以這塊為單位）
const tailOf = (n) => Math.max(endOf(n), ...[...(n.notes || []), ...(n.endNotes || [])].map((x) => x.end));
const whileLine = (n, cond, label) => `${n.ind}while (${outNL(cond)})${label ? ` is (${label})` : ''}`;
const repeatEnd = (n, ls, cond, label) => `${ls[n.endLine].match(/^\s*/)[0]}repeat while (${outNL(cond)})${label ? ` is (${label})` : ''}${n.endLabel ? ` not (${n.endLabel})` : ''}`;
function editBranch(fi, k) {
    const n = A.flat[fi];
    if (n && n.t === 'fork') { flash(T.act.forkNoText); return; }
    if (n && (n.t === 'while' || n.t === 'repeat')) {   // 迴圈只有一個標籤：繼續繞的那條（is）
        const lab = sv.querySelector(`[data-branch="${fi}:0"]`), p = A.pos[fi];
        const bb = lab ? lab.getBBox() : { x: p.x + p.w / 2 + 6, y: p.y + p.h + 2 };
        openFree(bb.x, bb.y - 6, n.label, 160, (v) => {
            if (v === n.label) { render(); return; }
            const ls = lns();
            if (n.t === 'while') ls[n.line] = whileLine(n, n.cond, v);
            else ls[n.endLine] = repeatEnd(n, ls, n.cond, v);
            apply(ls, n.line);
            branchSel(A.flat.findIndex((x) => x.line === n.line), 0);
        });
        return;
    }
    if (!n || n.t !== 'if' || !n.branches[k]) return;
    const b = n.branches[k];
    const lab = sv.querySelector(`[data-branch="${fi}:${k}"]`);
    const p = A.pos[fi];
    let x = p.x + p.w / 2 + 6, yy = p.y + p.h + 2;
    if (lab) { const bb = lab.getBBox(); x = bb.x; yy = bb.y - 6; }
    else if (k > 0) { x = p.x + p.w + 6; yy = p.y - 8; }
    openFree(x, yy, b.label, 160, (v) => {
        if (v === b.label) { render(); return; }
        const ls = lns();
        if (b.kw === 'then') ls[n.line] = `${n.ind}if (${outNL(n.cond)}) then${v ? ` (${v})` : ''}`;
        else if (b.kw === 'elseif') ls[b.line] = `${b.ind}elseif (${outNL(b.cond)}) then${v ? ` (${v})` : ''}`;
        else ls[b.line] = `${b.ind}else${v ? ` (${v})` : ''}`;
        apply(ls, n.line);
        A.sel = { ...A.sel, layer: 'branch', k };
        render();
    });
}
function addAfter(fi) {
    const n = A.flat[fi];
    if (!n) return;
    const at = tailOf(n) + 1, ls = lns();
    ls.splice(at, 0, `${n.ind}:${T.act.newStep};`);
    apply(ls, at);
    editNode(A.sel.i, true);
}
function cycleKind(fi) {
    const n = A.flat[fi];
    if (!n || n.t === 'start') return;
    if (isBlock(n) && n.t !== 'if') { flash(T.act.cantKind); return; }
    const ls = lns();
    if (n.t === 'action') {
        ls.splice(n.line, n.end - n.line + 1, `${n.ind}if (${outNL(n.text)}) then (${T.act.yes})`, `${n.ind}else (${T.act.no})`, `${n.ind}endif`);
    } else if (n.t === 'if') {
        if (n.branches.some((b) => b.items.some(isNode))) { flash(T.act.cantStop); return; }
        ls.splice(n.line, n.endLine - n.line + 1, `${n.ind}stop`);
    } else ls.splice(n.line, 1, `${n.ind}:${T.act.newStep};`);
    apply(ls, n.line);
}
function delGroup() {
    const g = group();
    if (!g) return;
    const ls = lns();
    ls.splice(g.s, g.e - g.s + 1);
    apply(ls, g.s);
}
function wrapIf() {
    const g = group();
    if (!g) return;
    const ls = lns(), ind = g.first.ind;
    const inner = ls.slice(g.s, g.e + 1).map((s) => (s.trim() ? '  ' + s : s));
    ls.splice(g.s, g.e - g.s + 1, `${ind}if (${T.act.cond}) then (${T.act.yes})`, ...inner, `${ind}else (${T.act.no})`, `${ind}endif`);
    apply(ls, g.s);
    editNode(A.sel.i, true);
}
function moveSib(d) {
    const g = group();
    if (!g) return;
    const sibs = g.first.parent.filter(isNode);
    const nb = sibs[sibs.indexOf(d < 0 ? g.first : g.last) + d];
    // 碰到分支或菱形的界線：穿過去（等於把菱形往上下挪一格），不是跟整個判斷交換
    if (!nb || isBlock(nb)) { crossMove(g, d, nb); return; }
    const ls = lns(), G = ls.slice(g.s, g.e + 1), ns = nb.line, ne = endOf(nb), N = ls.slice(ns, ne + 1);
    let out, sel;
    if (d < 0) { out = [...ls.slice(0, ns), ...G, ...ls.slice(ne + 1, g.s), ...N, ...ls.slice(g.e + 1)]; sel = ns; }
    else { out = [...ls.slice(0, g.s), ...N, ...ls.slice(g.e + 1, ns), ...G, ...ls.slice(ne + 1)]; sel = g.s + N.length + (ns - g.e - 1); }
    const span = A.sel.j - A.sel.i;
    apply(out, sel);
    A.sel.j = Math.max(0, Math.min(A.flat.length - 1, A.sel.i + span));
    render();
}
/* Alt+↑↓ 穿過判斷的界線：
   菱形下面第一步 ↑ → 進最後一條分支的最底下；判斷上面那一步 ↓ → 進第一條分支的最上面；
   分支第一步 ↑ → 上一條分支的最底下（已是第一條就出到判斷上方）；
   分支最後一步 ↓ → 下一條分支的最上面（已是最後一條就出到菱形下方）。
   搬過去的地方泳道不同時，前面補一行切泳道、後面再切回去，其他步驟的泳道不變。 */
function crossMove(g, d, nb) {
    const ownerOf = (items) => A.flat.find((x) => isBlock(x) && x.branches.some((b) => b.items === items));
    const firstInd = (b, fb) => { const n = b.items.find(isNode); return n ? n.ind : (b.ind ?? fb.ind) + '  '; };
    let at, ind;
    if (nb && d < 0) {                      // 菱形正下方往上：進最後一條分支
        const b = nb.branches[nb.branches.length - 1];
        at = nb.endLine; ind = firstInd(b, nb);
    } else if (nb && d > 0) {               // 判斷正上方往下：進第一條分支
        const b = nb.branches[0];
        at = b.line + 1; ind = firstInd(b, nb);
    } else {
        const o = ownerOf(g.first.parent);
        if (!o) return;                     // 最外層的頭尾，沒有地方可去
        const k = o.branches.findIndex((b) => b.items === g.first.parent);
        if (d < 0 && k > 0) { at = o.branches[k].line; ind = firstInd(o.branches[k - 1], o); }
        else if (d < 0) { at = o.line; ind = o.ind; }
        else if (k < o.branches.length - 1) { at = o.branches[k + 1].line + 1; ind = firstInd(o.branches[k + 1], o); }
        else { at = o.endLine + 1; ind = o.ind; }
    }
    placeGroup(g, at, ind, g.first.lane);
}

/* 把選取的步驟（g.s～g.e 行）搬到第 at 行之前，縮排換成 ind，放在 myLane 泳道。
   Alt+↑↓ 穿界線與滑鼠拖曳共用。 */
function placeGroup(g, at, ind, myLane) {
    if (at > g.s && at <= g.e) return;      // 放回自己身上：不動
    const ls = lns();
    const base = g.first.ind;
    const G = ls.slice(g.s, g.e + 1).map((s) => (s.startsWith(base) ? ind + s.slice(base.length) : s));
    const mark = new String(G[0]);          // 用物件記住搬過去的第一行，算新位置用
    G[0] = mark;
    // 泳道：插入點當下的泳道跟這幾步不同就補切換
    // 插入點下一行剛好就是切到同一條泳道：接在它後面，不重複補一行
    const n0 = nextNonBlank(ls, at, 1), m0 = n0 < ls.length && ls[n0].match(laneLineRe);
    if (m0 && m0[1].trim() === myLane && !(n0 >= g.s && n0 <= g.e)) at = n0 + 1;
    const there = laneAtLine(at - 1);
    const block = [];
    if (myLane && there !== myLane) block.push(`${ind}|${myLane}|`);
    block.push(...G);
    const nxt = nextNonBlank(ls, at, 1);
    if (myLane && there && there !== myLane && nxt < ls.length && !laneLineRe.test(ls[nxt])) block.push(`${ind}|${there}|`);
    // 原位置：搬走後前面那行泳道切換若變成緊接另一行切換，就是多餘的，拿掉
    const p = nextNonBlank(ls, g.s - 1, -1), q = nextNonBlank(ls, g.e + 1, 1);
    const drop = new Set();
    if (p >= 0 && p >= A.firstFlow && laneLineRe.test(ls[p]) && q < ls.length && laneLineRe.test(ls[q]) && !(at > p && at <= q)) drop.add(p);
    // 插入點：前面那行泳道切換緊接著我們補的切換，前一行就沒作用了
    const pp = nextNonBlank(ls, at - 1, -1);
    if (laneLineRe.test(block[0]) && pp >= 0 && pp >= A.firstFlow && laneLineRe.test(ls[pp]) && !(pp >= g.s && pp <= g.e)) drop.add(pp);
    const keep = (from, to) => ls.slice(from, to).filter((_, k) => !drop.has(from + k));
    const out = at > g.e
        ? [...keep(0, g.s), ...keep(g.e + 1, at), ...block, ...keep(at, ls.length)]
        : [...keep(0, at), ...block, ...keep(at, g.s), ...keep(g.e + 1, ls.length)];
    const sel = out.indexOf(mark);
    const span = A.sel.j - A.sel.i;
    apply(out.map(String), sel);
    A.sel.j = Math.max(0, Math.min(A.flat.length - 1, A.sel.i + span));
    render();
}

/* 把選到的步驟搬到隔壁泳道：前面插一行切換，後面再切回原本的泳道 */
function laneShift(d) {
    const g = group();
    if (!g || !A.lanes.length) return;
    const cur = g.first.lane ?? A.lanes[0];
    const target = A.lanes[A.lanes.indexOf(cur) + d];
    if (!target) return;
    const ls = lns(), ind = g.first.ind;
    const after = laneAtLine(g.e) ?? cur;
    const moreAfter = A.flat.some((n) => n.line > g.e);
    const nxt = nextNonBlank(ls, g.e + 1, 1);
    if (moreAfter && !(nxt < ls.length && laneLineRe.test(ls[nxt]))) ls.splice(g.e + 1, 0, `${ind}|${after}|`);
    ls.splice(g.s, 0, `${ind}|${target}|`);
    let sel = g.s + 1;
    const prev = nextNonBlank(ls, g.s - 1, -1);
    if (prev >= 0 && prev >= A.firstFlow && A.firstFlow >= 0 && laneLineRe.test(ls[prev])) { ls.splice(prev, 1); sel--; }
    apply(ls, sel);
}

/* 泳道順序、改名、新增 */
function rewriteDecls(order, ls) {
    const decl = A.laneItems.filter((x) => x.line < A.firstFlow || A.firstFlow < 0).map((x) => x.line);
    const startLane = decl.length ? A.laneItems.find((x) => x.line === decl[decl.length - 1]).name : null;
    let at = decl.length ? decl[0] : ls.findIndex((s) => /^\s*@startuml/i.test(s)) + 1;
    [...decl].sort((a, b) => b - a).forEach((k) => ls.splice(k, 1));
    const add = order.map((nm) => `|${nm}|`);
    if (startLane && order[order.length - 1] !== startLane) add.push(`|${startLane}|`);
    ls.splice(at, 0, ...add);
    return ls;
}
function moveLane(d) {
    const k = A.sel.lane, j = k + d;
    if (j < 0 || j >= A.lanes.length) return;
    const order = A.lanes.slice();
    [order[k], order[j]] = [order[j], order[k]];
    apply(rewriteDecls(order, lns()), curLine());
    A.sel = { ...A.sel, layer: 'lane', lane: j };
    render();
}
function renameLane(k, merge) {
    const old = A.lanes[k];
    if (old === undefined) return;
    const hdr = sv.querySelector(`[data-lane="${k}"] rect`);
    const bb = hdr ? hdr.getBBox() : { x: 20, y: 8, width: 160 };
    openFree(bb.x + 4, bb.y + 2, old, Math.max(180, bb.width - 8), (v) => {
        v = v.replace(/\|/g, '').trim();
        if (!v || v === old) { render(); return; }
        const ls = lns();
        A.laneItems.forEach((x) => { if (x.name === old) ls[x.line] = `${x.ind}|${x.color ? x.color + '|' : ''}${v}|`; });
        apply(ls, curLine(), merge);
        A.sel = { ...A.sel, layer: 'lane', lane: k };
        render();
    });
}
function addLane() {
    const k = A.sel.lane;
    let nm = T.act.newLane, n = 2;
    while (A.lanes.includes(nm)) nm = `${T.act.newLane} ${n++}`;
    const order = A.lanes.slice();
    order.splice(k + 1, 0, nm);
    apply(rewriteDecls(order, lns()), curLine());
    A.sel = { ...A.sel, layer: 'lane', lane: k + 1 };
    render();
    renameLane(k + 1, true);
}
/* 分支是空的時候按 ↓：先放一個新步驟進去再選它 */
function enterBranch(fi, k) {
    const n = A.flat[fi], b = n && n.branches[k];
    if (!b) return;
    const first = b.items.find(isNode);
    if (first) { const i = A.flat.indexOf(first); A.sel = { ...A.sel, layer: 'node', i, j: i }; render(); return; }
    const ls = lns(), at = b.line + 1;
    ls.splice(at, 0, `${(b.ind ?? n.ind)}  :${T.act.newStep};`);
    apply(ls, at);
    editNode(A.sel.i, true);
}

/* ── 判斷的分支結構：拆成「條件／標籤／內容行」，改完整段重寫 ──
   then 的條件就是判斷本身的條件；else 沒有條件，所以永遠排最後。 */
function descs(n, ls) {
    return n.branches.map((b, k) => {
        const s = b.line + 1, e = (n.branches[k + 1] ? n.branches[k + 1].line : n.endLine) - 1;
        return { cond: b.kw === 'then' ? n.cond : b.kw === 'elseif' ? b.cond : null, label: b.label || '', body: ls.slice(s, e + 1) };
    });
}
function writeIf(n, ds, ls) {
    const ind = n.ind, out = [];
    ds.forEach((d, j) => {
        const lab = d.label ? ` (${d.label})` : '';
        if (j === 0) out.push(`${ind}if (${outNL(d.cond ?? n.cond)}) then${lab}`);
        else if (d.cond != null) out.push(`${ind}elseif (${outNL(d.cond)}) then${lab}`);
        else out.push(`${ind}else${lab}`);
        out.push(...d.body);
    });
    out.push(ls[n.endLine]);
    ls.splice(n.line, n.endLine - n.line + 1, ...out);
    return ls;
}
const branchSel = (fi, k) => { A.sel = { ...A.sel, layer: 'branch', i: fi, j: fi, k }; render(); };
/* 分支層 Shift+Enter：在右邊加一條。只有一條時加 else；else 永遠留在最後 */
function addBranch() {
    const n = A.flat[A.sel.i], ls = lns(), ds = descs(n, ls);
    const k = A.sel.k, last = ds[ds.length - 1];
    let at = k + 1;
    const nb = { cond: T.act.cond, label: T.act.yes, body: [] };
    if (ds.length === 1) Object.assign(nb, { cond: null, label: T.act.no });
    else if (at >= ds.length && last.cond == null) at = ds.length - 1;   // 加在 else 後面不合法，改插在 else 前面
    ds.splice(at, 0, nb);
    apply(writeIf(n, ds, ls), n.line);
    branchSel(A.flat.findIndex((x) => x.line === n.line), at);
}
/* 分支層 Backspace：刪掉這一條（連內容）。只剩一條時清空內容 */
function delBranch() {
    const n = A.flat[A.sel.i], ls = lns(), ds = descs(n, ls), k = A.sel.k;
    if (ds.length === 1) ds[0].body = [];
    else {
        const gone = ds.splice(k, 1)[0];
        if (k === 0 && gone.cond != null && ds[0].cond == null) ds[0].cond = gone.cond;   // 刪掉 then 剩 else：條件留著
    }
    apply(writeIf(n, ds, ls), n.line);
    branchSel(A.flat.findIndex((x) => x.line === n.line), Math.max(0, Math.min(k, ds.length - 1)));
}
/* 分支層 Alt+←→：跟隔壁那條對調。兩條都有條件就連條件一起換；其中一條是 else 就只換標籤與內容 */
function swapBranch(d) {
    const n = A.flat[A.sel.i], ls = lns(), ds = descs(n, ls), k = A.sel.k, j = k + d;
    if (j < 0 || j >= ds.length) return;
    const a = ds[k], b = ds[j];
    if (a.cond != null && b.cond != null) { ds[k] = b; ds[j] = a; }
    else { [a.label, b.label] = [b.label, a.label]; [a.body, b.body] = [b.body, a.body]; }
    apply(writeIf(n, ds, ls), n.line);
    branchSel(A.flat.findIndex((x) => x.line === n.line), j);
}
/* 分支層 Tab：這條的結尾在「接回菱形」與「直接結束（stop）」之間切換 */
function toggleBranchStop() {
    const n = A.flat[A.sel.i], ls = lns(), ds = descs(n, ls), k = A.sel.k, b = n.branches[k];
    const nodes = b.items.filter(isNode), lastN = nodes[nodes.length - 1];
    if (lastN && lastN.t === 'stop') ds[k].body = ls.slice(b.line + 1, lastN.line).concat(ls.slice(lastN.line + 1, (n.branches[k + 1] ? n.branches[k + 1].line : n.endLine)));
    else ds[k].body.push(`${(lastN ? lastN.ind : n.ind + '  ')}stop`);
    apply(writeIf(n, ds, ls), n.line);
    branchSel(A.flat.findIndex((x) => x.line === n.line), k);
}
/* fork 的分支：加一條（fork again）、刪一條、跟隔壁對調內容 */
const forkBodies = (n, ls) => n.branches.map((b, k) => ls.slice(b.line + 1, n.branches[k + 1] ? n.branches[k + 1].line : n.endLine));
function addForkBranch() {
    const n = A.flat[A.sel.i], k = A.sel.k, ls = lns();
    ls.splice(n.branches[k + 1] ? n.branches[k + 1].line : n.endLine, 0, `${n.ind}${n.kw || 'fork'} again`);
    apply(ls, n.line);
    branchSel(A.flat.findIndex((x) => x.line === n.line), k + 1);
}
function delForkBranch() {
    const n = A.flat[A.sel.i], k = A.sel.k, ls = lns(), B = n.branches;
    if (B.length === 1) ls.splice(B[0].line + 1, n.endLine - B[0].line - 1);
    else if (k === 0) ls.splice(B[0].line + 1, B[1].line - B[0].line);          // 第一條：連同下一條的 fork again 一起拿掉，下一條變成第一條
    else ls.splice(B[k].line, (B[k + 1] ? B[k + 1].line : n.endLine) - B[k].line);
    apply(ls, n.line);
    branchSel(A.flat.findIndex((x) => x.line === n.line), Math.max(0, Math.min(k, B.length - 2)));
}
function swapForkBranch(d) {
    const n = A.flat[A.sel.i], k = A.sel.k, j = k + d, ls = lns();
    if (j < 0 || j >= n.branches.length) return;
    const bodies = forkBodies(n, ls);
    [bodies[k], bodies[j]] = [bodies[j], bodies[k]];
    const out = [];
    n.branches.forEach((b, p) => { out.push(ls[b.line], ...bodies[p]); });
    out.push(ls[n.endLine]);
    ls.splice(n.line, n.endLine - n.line + 1, ...out);
    apply(ls, n.line);
    branchSel(A.flat.findIndex((x) => x.line === n.line), j);
}
/* 判斷上 Ctrl+Backspace：拆掉判斷，第一條分支的步驟留在原位（往左退一層縮排） */
function unwrapIf() {
    const n = A.flat[A.sel.i];
    if (!isBlock(n)) return;
    const ls = lns(), body = ls.slice(n.branches[0].line + 1, n.branches[1] ? n.branches[1].line : n.endLine);
    const sub = body.find((s) => s.trim()), cut = sub ? sub.match(/^\s*/)[0].length - n.ind.length : 0;
    const out = body.map((s) => (s.trim() && cut > 0 && /^\s*$/.test(s.slice(0, cut)) ? s.slice(cut) : s));
    ls.splice(n.line, n.endLine - n.line + 1, ...out);
    apply(ls, n.line);
}
/* Alt+Enter：在前面加一步 */
function addBefore(fi) {
    const n = A.flat[fi];
    if (!n) return;
    const ls = lns();
    ls.splice(n.line, 0, `${n.ind}:${T.act.newStep};`);
    apply(ls, n.line);
    editNode(A.sel.i, true);
}
/* 複製／貼上／複製一份：以「行」為單位，貼的時候換成目標位置的縮排 */
let clip = null;
function reindent(lines, from, to) { return lines.map((s) => (s.startsWith(from) ? to + s.slice(from.length) : s)); }
function copyGroup() {
    const g = group();
    if (!g) return;
    clip = { lines: lns().slice(g.s, g.e + 1), ind: g.first.ind };
    try { navigator.clipboard?.writeText(clip.lines.map((s) => s.slice(clip.ind.length)).join('\n')); } catch { /* 剪貼簿不給用就只留在工具裡 */ }
    flash(T.act.copiedN(A.flat.filter((x) => x.line >= g.s && x.line <= g.e).length));
}
function pasteAfter() {
    const cur = A.flat[Math.max(A.sel.i, A.sel.j)];
    if (!clip || !cur) return;
    const at = endOf(cur) + 1, ls = lns();
    ls.splice(at, 0, ...reindent(clip.lines, clip.ind, cur.ind));
    apply(ls, at);
}
function duplicate() {
    const g = group();
    if (!g) return;
    const ls = lns(), dup = ls.slice(g.s, g.e + 1);
    ls.splice(g.e + 1, 0, ...dup);
    apply(ls, g.e + 1);
}
/* 泳道層 Backspace：只有空的泳道能刪 */
function delLane() {
    const nm = A.lanes[A.sel.lane];
    if (nm === undefined) return;
    if (A.flat.some((x) => x.lane === nm)) { flash(T.act.laneNotEmpty(nm)); return; }
    const ls = lns();
    A.laneItems.filter((x) => x.name === nm).map((x) => x.line).sort((a, b) => b - a).forEach((k) => ls.splice(k, 1));
    apply(ls, curLine());
    A.sel = { ...A.sel, layer: 'lane', lane: Math.max(0, Math.min(A.sel.lane, A.lanes.length - 1)) };
    render();
}
function addLaneLeft() {
    const k = A.sel.lane;
    let nm = T.act.newLane, n = 2;
    while (A.lanes.includes(nm)) nm = `${T.act.newLane} ${n++}`;
    const order = A.lanes.slice();
    order.splice(k, 0, nm);
    apply(rewriteDecls(order, lns()), curLine());
    A.sel = { ...A.sel, layer: 'lane', lane: k };
    render();
    renameLane(k, true);
}
/* 走動：跳過分支內容的「同一層下一步」、判斷之間跳 */
function selectNode(i) {
    if (i < 0 || i >= A.flat.length) return;
    A.sel = { ...A.sel, layer: 'node', i, j: i };
    render();
}
function skipOver(fi) {
    const n = A.flat[fi];
    const i = A.flat.findIndex((x) => x.line > endOf(n));
    if (i >= 0) selectNode(i);
}
function jumpIf(d) {
    for (let i = A.sel.i + d; i >= 0 && i < A.flat.length; i += d) if (isBlock(A.flat[i])) { selectNode(i); return; }
}

export function newActStarter() {
    A.undo.push({ text: A.text, line: curLine() });
    setAct(T.act.starter.join(A.nl || '\n'), 0);
    touch();
}

let flashTimer = 0;
function flash(msg) {
    const w = document.getElementById('stWhat');
    w.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => render(), 1800);
}

/* ── 鍵盤 ─────────────────────────────────── */
export function onActKey(e) {
    const k = e.key, ctrl = e.ctrlKey || e.metaKey, Ls = A.sel.layer;
    if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? actRedo() : actUndo(); return; }
    if (k === '?' && !ctrl) { e.preventDefault(); document.getElementById('help').classList.toggle('pinned'); return; }
    if (!A.flat.length) {
        if (k === 'Enter') { e.preventDefault(); newActStarter(); render(); }
        return;
    }
    const n = A.flat[A.sel.i];

    if (Ls === 'lane') {
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
            e.preventDefault();
            const d = k === 'ArrowLeft' ? -1 : 1;
            if (e.altKey) moveLane(d);
            else { A.sel.lane = Math.max(0, Math.min(A.lanes.length - 1, A.sel.lane + d)); render(); }
            return;
        }
        if (k === 'Enter') { e.preventDefault(); e.shiftKey && e.altKey ? addLaneLeft() : e.shiftKey ? addLane() : renameLane(A.sel.lane); return; }
        if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); delLane(); return; }
        if (k === 'ArrowDown' || k === 'Escape' || (ctrl && k === 'ArrowDown')) {
            e.preventDefault();
            const nm = A.lanes[A.sel.lane];
            let i = k === 'ArrowDown' ? A.flat.findIndex((x) => (x.lane ?? A.lanes[0]) === nm) : A.sel.i;
            if (i < 0) i = 0;
            A.sel = { ...A.sel, layer: 'node', i, j: i };
            render();
            return;
        }
        if (k === 'ArrowUp') { e.preventDefault(); return; }
        if (!ctrl && !e.altKey && k.length === 1) { e.preventDefault(); renameLane(A.sel.lane); }
        return;
    }

    if (Ls === 'branch') {
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
            e.preventDefault();
            if (e.altKey) { n.t === 'fork' ? swapForkBranch(k === 'ArrowLeft' ? -1 : 1) : n.t === 'if' ? swapBranch(k === 'ArrowLeft' ? -1 : 1) : flash(T.act.loopBranchNo); return; }
            A.sel.k = Math.max(0, Math.min(n.branches.length - 1, A.sel.k + (k === 'ArrowLeft' ? -1 : 1)));
            render();
            return;
        }
        if (k === 'ArrowDown' && !ctrl) { e.preventDefault(); enterBranch(A.sel.i, A.sel.k); return; }
        const loop = n.t === 'while' || n.t === 'repeat', fk = n.t === 'fork';
        if (k === 'Enter' && e.shiftKey) { e.preventDefault(); loop ? flash(T.act.loopBranchNo) : fk ? addForkBranch() : addBranch(); return; }
        if (k === 'Enter') { e.preventDefault(); editBranch(A.sel.i, A.sel.k); return; }
        if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); loop ? flash(T.act.loopBranchNo) : fk ? delForkBranch() : delBranch(); return; }
        if (k === 'Tab') { e.preventDefault(); n.t === 'if' ? toggleBranchStop() : flash(T.act.loopBranchNo); return; }
        if (k === 'Escape' || (ctrl && (k === 'ArrowUp' || k === 'ArrowDown'))) {
            e.preventDefault(); A.sel = { ...A.sel, layer: 'node', j: A.sel.i }; render(); return;
        }
        if (!ctrl && !e.altKey && k.length === 1) { e.preventDefault(); editBranch(A.sel.i, A.sel.k); }
        return;
    }

    /* 節點層 */
    if (ctrl && k === 'ArrowRight' && isBlock(n)) { e.preventDefault(); A.sel = { ...A.sel, layer: 'branch', k: 0, j: A.sel.i }; render(); return; }
    if (ctrl && k === 'ArrowUp') {   // 往上一層：在分支裡就回到那個判斷，否則上到泳道
        e.preventDefault();
        const owner = A.flat.find((x) => isBlock(x) && x.branches.some((b) => b.items === n.parent));
        if (owner) {
            const i = A.flat.indexOf(owner);
            A.sel = { ...A.sel, layer: 'branch', i, j: i, k: owner.branches.findIndex((b) => b.items === n.parent) };
        } else if (A.lanes.length) A.sel = { ...A.sel, layer: 'lane', lane: Math.max(0, A.lanes.indexOf(n.lane ?? A.lanes[0])) };
        render();
        return;
    }
    if (ctrl && k === 'ArrowDown') { e.preventDefault(); skipOver(A.sel.i); return; }
    if (e.altKey && !ctrl && (e.code === 'KeyN' || k === 'n' || k === 'N')) { e.preventDefault(); noteForSel(); return; }
    if (ctrl && (k === 'c' || k === 'C')) { e.preventDefault(); copyGroup(); return; }
    if (ctrl && (k === 'v' || k === 'V')) { e.preventDefault(); pasteAfter(); return; }
    if (ctrl && (k === 'd' || k === 'D')) { e.preventDefault(); duplicate(); return; }
    if (ctrl && (k === 'Backspace' || k === 'Delete') && isBlock(n)) { e.preventDefault(); unwrapIf(); return; }
    switch (k) {
        case 'Home': e.preventDefault(); selectNode(0); return;
        case 'End': e.preventDefault(); selectNode(A.flat.length - 1); return;
        case 'PageUp': e.preventDefault(); jumpIf(-1); return;
        case 'PageDown': e.preventDefault(); jumpIf(1); return;
        case 'ArrowUp': case 'ArrowDown': {
            e.preventDefault();
            const d = k === 'ArrowUp' ? -1 : 1;
            if (e.altKey) { moveSib(d); return; }
            if (e.shiftKey) {
                const cur = A.flat[A.sel.j], sibs = cur.parent.filter(isNode);
                const nb = sibs[sibs.indexOf(cur) + d];
                if (nb && nb.parent === A.flat[A.sel.i].parent) A.sel.j = A.flat.indexOf(nb);
                render();
                return;
            }
            if (d < 0 && A.sel.i === 0 && A.lanes.length) {
                A.sel = { ...A.sel, layer: 'lane', lane: Math.max(0, A.lanes.indexOf(n.lane ?? A.lanes[0])) };
                render();
                return;
            }
            A.sel.i = Math.max(0, Math.min(A.flat.length - 1, A.sel.i + d));
            A.sel.j = A.sel.i;
            render();
            return;
        }
        case 'ArrowLeft': case 'ArrowRight':
            e.preventDefault(); laneShift(k === 'ArrowLeft' ? -1 : 1); return;
        case 'Tab':
            e.preventDefault(); cycleKind(A.sel.i); return;
        case 'Enter':
            e.preventDefault();
            if (ctrl) wrapIf();
            else if (e.altKey) addBefore(Math.min(A.sel.i, A.sel.j));
            else if (e.shiftKey) addAfter(Math.max(A.sel.i, A.sel.j));
            else editNode(A.sel.i);
            return;
        case 'Backspace': case 'Delete':
            e.preventDefault(); delGroup(); return;
        case 'Escape':
            e.preventDefault(); A.sel.j = A.sel.i; render(); return;
    }
    if (!ctrl && !e.altKey && k.length === 1) { e.preventDefault(); editNode(A.sel.i); }
}

/* ── 滑鼠 ─────────────────────────────────── */
/* 拖曳：按住步驟拖到別的位置放開。放在某一步的上半部＝插在它前面，下半部＝插在它後面；
   左右拖到別條泳道就換泳道。拖動時畫一條紫線標出會放在哪裡。 */
let drag = null, eatClick = false, lastClick = { key: '', t: 0 };
const svPt = (e) => { const r = sv.getBoundingClientRect(); return { x: (e.clientX - r.left) / ZOOM, y: (e.clientY - r.top) / ZOOM }; };
export function onActDown(e) {
    const nd = e.target.closest('[data-node]');
    if (!nd || nd.hasAttribute('data-merge') || e.button !== 0 || e.shiftKey) return;
    const i = +nd.dataset.node;
    if (!A.flat[i] || A.flat[i].t === 'start') return;
    e.preventDefault();                     // 不要拖出一片反白文字
    drag = { i, x0: e.clientX, y0: e.clientY, on: false, drop: null };
    addEventListener('mousemove', dragMove);
    addEventListener('mouseup', dragUp, { once: true });
}
function dropAt(pt) {
    const g = A.laneGeo;
    let lane = A.lanes.length ? A.lanes[0] : null;
    if (g && A.lanes.length) g.x.forEach((x, k) => { if (pt.x >= x) lane = A.lanes[k]; });
    // 最近的步驟：同一條泳道優先，量的是到框的垂直距離
    let best = null, bd = Infinity;
    A.flat.forEach((n, k) => {
        const p = A.pos[k];
        if (!p) return;
        const dy = pt.y < p.y ? p.y - pt.y : pt.y > p.y + p.h ? pt.y - p.y - p.h : 0;
        const dx = pt.x < p.x ? p.x - pt.x : pt.x > p.x + p.w ? pt.x - p.x - p.w : 0;
        const d = dy + dx * 0.2;            // 主要看高度；同高度並排的分支再看左右
        if (d < bd) { bd = d; best = k; }
    });
    if (best == null) return null;
    const n = A.flat[best], p = A.pos[best];
    const after = n.t === 'start' || pt.y > p.y + p.h / 2;
    return { k: best, after, lane, y: after ? p.y + p.h + 12 : p.y - 12, x: p.x - 20, w: p.w + 40 };
}
function dragMove(e) {
    if (!drag) return;
    if (!drag.on && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    if (!drag.on) {
        drag.on = true;
        const a = Math.min(A.sel.i, A.sel.j), b = Math.max(A.sel.i, A.sel.j);
        if (A.sel.layer !== 'node' || drag.i < a || drag.i > b) A.sel = { ...A.sel, layer: 'node', i: drag.i, j: drag.i };
        document.body.style.cursor = 'grabbing';
    }
    const d = dropAt(svPt(e));
    drag.drop = d;
    let line = sv.querySelector('#actDrop');
    if (!line) { line = el('rect', { id: 'actDrop', height: 3, rx: 1.5, fill: rgb('--c-purple') }); sv.appendChild(line); }
    if (d) { line.setAttribute('x', d.x); line.setAttribute('y', d.y - 1.5); line.setAttribute('width', d.w); }
}
function dragUp() {
    removeEventListener('mousemove', dragMove);
    document.body.style.cursor = '';
    const d = drag;
    drag = null;
    if (!d || !d.on) return;
    eatClick = true;
    sv.querySelector('#actDrop')?.remove();
    const g = group();
    if (!g || !d.drop) { render(); return; }
    const t = A.flat[d.drop.k];
    if (t.line >= g.s && t.line <= g.e) {    // 放在自己身上：只有換泳道才動
        if (d.drop.lane && d.drop.lane !== g.first.lane) placeGroup(g, g.s, g.first.ind, d.drop.lane);
        else render();
        return;
    }
    const at = d.drop.after ? tailOf(t) + 1 : t.line;
    placeGroup(g, at, t.ind, d.drop.lane || g.first.lane);
}
export function onActClick(e) {
    if (eatClick) { eatClick = false; return; }     // 剛拖完放開的那一下不算點選
    const note = e.target.closest('[data-note]'), lgd = e.target.closest('[data-legend]');
    if (note || lgd) {
        const key = note ? 'N' + note.dataset.note : 'L', now = performance.now();
        if (key === lastClick.key && now - lastClick.t < 450) { lastClick = { key: '', t: 0 }; note ? editNote(+note.dataset.note) : editLegend(); return; }
        lastClick = { key, t: now };
        const nt = note && A.notes[+note.dataset.note], i = nt && nt.owner ? A.flat.indexOf(nt.owner) : -1;
        if (i >= 0) { A.sel = { ...A.sel, layer: 'node', i, j: i }; render(); }
        return;
    }
    const lane = e.target.closest('[data-lane]'), br = e.target.closest('[data-branch]'), nd = e.target.closest('[data-node]');
    // 點一下就重畫，第二下點到的是新元素，瀏覽器不會發 dblclick：自己認「同一個東西 0.45 秒內點兩下」
    const key = br ? 'b' + br.dataset.branch : nd ? 'n' + nd.dataset.node : lane ? 'l' + lane.dataset.lane : '';
    const now = performance.now();
    if (key && key === lastClick.key && now - lastClick.t < 450) { lastClick = { key: '', t: 0 }; onActDbl(e); return; }
    lastClick = { key, t: now };
    if (br) { const [i, k] = br.dataset.branch.split(':').map(Number); A.sel = { ...A.sel, layer: 'branch', i, j: i, k }; }
    else if (nd) {
        const i = +nd.dataset.node;
        if (e.shiftKey && A.sel.layer === 'node' && A.flat[i] && A.flat[A.sel.i] && A.flat[i].parent === A.flat[A.sel.i].parent) A.sel.j = i;
        else A.sel = { ...A.sel, layer: 'node', i, j: i };
    } else if (lane) A.sel = { ...A.sel, layer: 'lane', lane: +lane.dataset.lane };
    else return;
    render();
}
export function onActDbl(e) {
    if (S.editing) return;                  // 已經由上面的點兩下開了編輯框
    const note = e.target.closest('[data-note]');
    if (note) { editNote(+note.dataset.note); return; }
    if (e.target.closest('[data-legend]')) { editLegend(); return; }
    const lane = e.target.closest('[data-lane]'), br = e.target.closest('[data-branch]'), nd = e.target.closest('[data-node]');
    if (br) { const [i, k] = br.dataset.branch.split(':').map(Number); A.sel = { ...A.sel, layer: 'branch', i, j: i, k }; render(); editBranch(i, k); }
    else if (nd) { const i = +nd.dataset.node; A.sel = { ...A.sel, layer: 'node', i, j: i }; render(); editNode(i); }
    else if (lane) { A.sel = { ...A.sel, layer: 'lane', lane: +lane.dataset.lane }; render(); renameLane(A.sel.lane); }
}
