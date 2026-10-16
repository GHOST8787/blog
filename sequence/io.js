// 進出：Mermaid 雙向轉換、存成 .json 下載、讀回本機 .json、匯出 PNG。
// 這一支不負責重畫，呼叫端拿到資料自己 render，所以不 import render.js。

import { S, T, nid } from './state.js';
import { withCleanSvg } from './render.js';
import { parseSVG } from './svgin.js';
import { toPumlSeq } from './puml.js';
import { A } from './act.js';

/* PUML 模式：活動圖一律是，時序圖看當初從哪種格式進來 */
export const isPuml = () => S.type === 'act' || S.fmt === 'puml';
export const currentPuml = () => (S.type === 'act' ? A.text : toPumlSeq());
const PUML_EXT = /[.](puml|plantuml|pu|iuml|wsd)$/i;

const ARROW = { sync: '->>', return: '-->>', async: '-)' };
// PUML 的 group 在 Mermaid 沒有對應，寫成 opt 保留標籤
const MM_KIND = { loop: 'loop', alt: 'alt', opt: 'opt', par: 'par', break: 'break', critical: 'critical', group: 'opt' };
// Mermaid 一列就是一行，文字裡的換行照它的慣例寫成 <br/>
const outNL = (t) => String(t).split('\n').join('<br/>');
const inNL = (t) => t.replace(/<br\s*[/]?>/gi, '\n');

// Mermaid 的箭頭：原文寫哪一種就記在 r.mm，型別沒被改過就照原樣寫回
const MM_ARROWS = ['<<-->>', '<<->>', '-->>', '->>', '--x', '-x', '--)', '-)', '-->', '->'];
const MM_ARROW_RE = MM_ARROWS.map((x) => x.replace(/[()]/g, '\\$&')).join('|');
const MSG_RE = new RegExp(`^([^\\s:+]+?)\\s*(${MM_ARROW_RE})\\s*([+-]?)\\s*([^\\s:+-][^:]*?)\\s*(?::\\s*(.*))?$`);
function mmArrowInfo(a) {
    const dashed = a.includes('--');
    return {
        type: a.endsWith(')') ? (dashed ? 'return' : 'async') : dashed ? 'return' : 'sync',
        nohead: /^-{1,2}>$/.test(a), mark: /x$/.test(a) ? 'x' : '', both: a.startsWith('<<'),
    };
}

export function toMermaid() {
    const L = [];
    if (S.mmTitle && S.name) L.push('---', `title: ${S.name}`, '---');
    L.push('sequenceDiagram');
    if (S.autonumber) L.push('    autonumber');
    const declLine = (p, ind) => `${ind}${p.kind === 'actor' ? 'actor' : 'participant'} ${p.id}${p.name !== p.id ? ' as ' + p.name : ''}`;
    // 參與者：box 裡的連續幾個包在 box … end；中途 create 的不在開頭宣告
    let openBox = null;
    S.parts.forEach((p) => {
        if (p.created != null) return;
        const bx = (S.boxes || []).find((x) => x.ids.includes(p.id)) || null;
        if (bx !== openBox) {
            if (openBox) L.push('    end');
            if (bx) L.push(`    box ${[bx.color, bx.label].filter(Boolean).join(' ')}`.trimEnd());
            openBox = bx;
        }
        (p.mmPre || []).forEach((x) => L.push(x));
        L.push(declLine(p, openBox ? '        ' : '    '));
    });
    if (openBox) L.push('    end');
    S.parts.forEach((p) => (p.links || []).forEach((x) => L.push(`    ${x}`)));
    const open = [];
    for (let i = 0; i < S.rows.length; i++) {
        // alt 的 else（par 的是 and、critical 的是 option）：寫在開著的那一層
        open.forEach((b, k) => (b.elses || []).forEach((e) => {
            if (e.at === i) L.push(' '.repeat(4 + k * 4) + `${b.kind === 'par' ? 'and' : b.kind === 'critical' ? 'option' : 'else'}${e.label ? ' ' + e.label : ''}`);
        }));
        S.blocks.filter((b) => b.from === i).sort((a, b) => (b.to - b.from) - (a.to - a.from)).forEach((b) => {
            L.push(' '.repeat(4 + open.length * 4) + `${MM_KIND[b.kind] || 'opt'} ${b.label}`);
            open.push(b);
        });
        const ind = ' '.repeat(4 + open.length * 4);
        const r = S.rows[i];
        (r.mmPre || []).forEach((x) => L.push(ind + x));
        S.parts.filter((p) => p.created === i).forEach((p) => L.push(`${ind}create ${declLine(p, '')}`));
        (r.destroy || []).forEach((id) => L.push(`${ind}destroy ${id}`));
        const tag = r.tone === 'dash' ? '※ ' : '';
        if (r.kind === 'phase') {
            L.push(`${ind}rect rgb(236,238,251)`);
            L.push(`${ind}    Note over ${S.parts[0].id},${S.parts[S.parts.length - 1].id}: ${outNL(r.text)}`);
            L.push(`${ind}end`);
        } else if (r.kind === 'note') {
            const where = r.pos === 'over' ? `over ${r.at}${r.at2 ? ',' + r.at2 : ''}` : r.pos === 'left' ? `left of ${r.at}` : `right of ${r.at}`;
            L.push(`${ind}Note ${where}: ${tag}${outNL(r.text)}`);
        } else {
            const arrow = r.mm && r.mmType === r.type ? r.mm : ARROW[r.from === r.to ? 'sync' : r.type];
            const mod = r.mod === '++' ? '+' : r.mod === '--' ? '-' : '';
            L.push(`${ind}${r.from}${arrow}${mod}${r.to}: ${tag}${outNL(r.text)}`);
            (r.act || []).forEach((x) => L.push(`${ind}${x.op} ${x.id}`));
        }
        while (open.length && open[open.length - 1].to === i) {
            open.pop();
            L.push(' '.repeat(4 + open.length * 4) + 'end');
        }
    }
    (S.mmTail || []).forEach((x) => L.push('    ' + x));
    return L.join('\n');
}

export function fromMermaid(src) {
    const parts = [], rows = [], blocks = [], stack = [], lineOf = [];   // lineOf：每一列來自原文第幾行，報錯用
    const boxes = [];
    const lines = src.split('\n');
    let started = false, pendingPhase = false, autonumber = false, name = '', mmTitle = false;
    let box = null, pre = [], created = [], destroy = [], lastMsg = null;
    const addRow = (r, n) => {
        if (pre.length) { r.mmPre = pre; pre = []; }
        if (destroy.length) { r.destroy = destroy; destroy = []; }
        created.forEach((p) => { p.created = rows.length; });
        created = [];
        rows.push(r); lineOf.push(n + 1);
        return r;
    };
    const addPart = (kw, id, alias) => {
        const p = { id, name: (alias || id).trim(), kind: kw === 'actor' ? 'actor' : 'object' };
        if (pre.length) { p.mmPre = pre; pre = []; }
        const old = parts.find((x) => x.id === id);
        if (old) Object.assign(old, { name: p.name, kind: p.kind });
        else parts.push(p);
        if (box) box.ids.push(id);
        return old || p;
    };
    for (let n = 0; n < lines.length; n++) {
        const t = lines[n].trim();
        if (!t) continue;
        // 開頭的 --- title: … --- 設定區：只取標題
        if (!started && t === '---') {
            let j = n + 1;
            while (j < lines.length && lines[j].trim() !== '---') {
                const tm = lines[j].trim().match(/^title:\s*(.*)$/);
                if (tm) { name = tm[1].trim().replace(/^["'](.*)["']$/, '$1'); mmTitle = true; }
                j++;
            }
            n = j;
            continue;
        }
        // %% 註解與 %%{init}%% 設定：記住位置，複製出去時放回原處
        if (t.startsWith('%%')) { if (started) pre.push(t); continue; }
        if (/^sequenceDiagram$/.test(t)) { started = true; continue; }
        if (!started) throw { line: n + 1, msg: T.msg.errFirst };
        if (/^autonumber\b/.test(t)) { autonumber = true; continue; }
        let m;
        if ((m = t.match(/^title\s*:?\s+(.*)$/))) { name = m[1].trim(); mmTitle = true; continue; }
        if (/^(accTitle|accDescr)\b/.test(t)) { pre.push(t); continue; }
        if ((m = t.match(/^(participant|actor)\s+([^\s@]+)(?:\s+as\s+(.+))?$/))) { addPart(m[1], m[2], m[3]); continue; }
        if ((m = t.match(/^create\s+(participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/))) { created.push(addPart(m[1], m[2], m[3])); continue; }
        if ((m = t.match(/^destroy\s+(\S+)$/))) { destroy.push(m[1]); continue; }
        if ((m = t.match(/^links?\s+([^:\s]+)\s*:/))) {
            const p = parts.find((x) => x.id === m[1]);
            if (p) { (p.links ||= []).push(t); continue; }
        }
        // box 顏色 名稱 … end：框住中間宣告的參與者。顏色可以是名字、rgb()，也可以省略
        if ((m = t.match(/^box\b\s*(.*)$/))) {
            let rest = m[1].trim(), color = '';
            const fm = rest.match(/^((?:rgb|rgba|hsl|hsla)\([^)]*\))\s*(.*)$/i);
            if (fm) { color = fm[1]; rest = fm[2]; }
            else {
                const w = rest.split(/\s+/)[0];
                if (w && (w === 'transparent' || (globalThis.CSS && CSS.supports('color', w)))) { color = w; rest = rest.slice(w.length).trim(); }
            }
            box = { label: rest, color, ids: [] };
            boxes.push(box);
            continue;
        }
        if (/^rect\s/.test(t)) { pendingPhase = true; continue; }
        if ((m = t.match(/^Note\s+over\s+\S+\s*,\s*\S+\s*:\s*(.*)$/)) && pendingPhase) {
            addRow({ id: nid('r'), kind: 'phase', tone: 'solid', text: inNL(m[1].trim()) }, n);
            pendingPhase = 'awaitEnd';   // 這一組的 end 歸階段帶，不是區塊的
            continue;
        }
        if ((m = t.match(/^(loop|alt|opt|par|break|critical)\b\s*(.*)$/))) {
            stack.push({ id: nid('b'), kind: m[1], label: m[2].trim(), from: rows.length, to: rows.length, elses: [] });
            continue;
        }
        if ((m = t.match(/^(else|and|option)\b\s*(.*)$/)) && stack.length) {
            stack[stack.length - 1].elses.push({ at: rows.length, label: m[2].trim() });
            continue;
        }
        if (/^end$/.test(t)) {
            if (box) { box = null; continue; }
            if (pendingPhase) { pendingPhase = false; continue; }
            const b = stack.pop();
            if (!b) throw { line: n + 1, msg: T.msg.errEnd };
            b.to = rows.length - 1;
            if (b.to >= b.from) blocks.push(b);
            continue;
        }
        if ((m = t.match(/^(activate|deactivate)\s+(\S+)$/))) {
            if (lastMsg) (lastMsg.act ||= []).push({ op: m[1], id: m[2] });
            continue;
        }
        if ((m = t.match(/^Note\s+(right of|left of|over)\s+([^:,\s]+)\s*(?:,\s*([^:\s]+))?\s*:\s*(.*)$/i))) {
            let txt = m[4].trim(), tone = 'solid';
            if (txt.startsWith('※')) { tone = 'dash'; txt = txt.slice(1).trim(); }
            const pos = /^over$/i.test(m[1]) ? 'over' : /^left/i.test(m[1]) ? 'left' : undefined;
            const r = { id: nid('r'), kind: 'note', at: m[2], text: inNL(txt), tone };
            if (pos) r.pos = pos;
            if (m[3] && pos === 'over') r.at2 = m[3];
            addRow(r, n);
            continue;
        }
        if ((m = t.match(MSG_RE))) {
            let txt = (m[5] || '').trim(), tone = 'solid';
            if (txt.startsWith('※')) { tone = 'dash'; txt = txt.slice(1).trim(); }
            const info = mmArrowInfo(m[2]);
            const r = { id: nid('r'), kind: 'msg', from: m[1], to: m[4], type: info.type, tone, text: inNL(txt), mm: m[2], mmType: info.type };
            if (info.nohead) r.nohead = true;
            if (info.mark) r.mark = info.mark;
            if (info.both) r.both = true;
            if (m[3]) r.mod = m[3] === '+' ? '++' : '--';
            lastMsg = addRow(r, n);
            continue;
        }
        throw { line: n + 1, msg: T.msg.errUnknown(t.slice(0, 30)) };
    }
    if (stack.length) throw { line: lines.length, msg: T.msg.errNoEnd };
    // Mermaid 允許不宣告就直接用：沒宣告的參與者照第一次出現的順序補上
    const ids = new Set(parts.map((p) => p.id));
    const need = (id) => { if (id && !ids.has(id)) { ids.add(id); parts.push({ id, name: id, kind: 'object' }); } };
    rows.forEach((r) => {
        if (r.kind === 'note') { need(r.at); need(r.at2); }
        else if (r.kind === 'msg') { need(r.from); need(r.to); }
    });
    rows.forEach((r) => (r.act || []).forEach((x) => need(x.id)));
    if (!parts.length) throw { line: 1, msg: T.msg.errNoPart };
    return { parts, rows, blocks, autonumber, boxes, mmTail: pre, ...(mmTitle ? { name, mmTitle } : {}) };
}

/* 檔名用這張圖的名字，沒取名就退回日期。擋掉檔名不能用的字元。 */
function fileBase() {
    const n = String(S.name || '').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60);
    return n || `sequence-${stamp()}`;
}

/* ── 存成 .json 下載到使用者自己的電腦。站上不留任何東西。 ── */
export function saveFile() {
    if (isPuml()) {
        download(new Blob([currentPuml()], { type: 'text/plain;charset=utf-8' }), `${fileBase()}.puml`);
        return;
    }
    const data = {
        format: 'ghost.ouo/sequence',
        version: 1,
        savedAt: new Date().toISOString(),
        name: S.name || '',
        parts: S.parts,
        rows: S.rows,
        blocks: S.blocks,
        legend: S.legend,
        autonumber: S.autonumber,
        boxes: S.boxes,
    };
    download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `${fileBase()}.json`);
}

function stamp() {
    const d = new Date();
    const p2 = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
}

/* 把整張圖存成 .svg。資料原封不動嵌在 <metadata>，所以這張圖讀得回來也編輯得了。 */
export function saveSVG() {
    withCleanSvg(buildSVG);
}

function buildSVG() {
    const sv = document.getElementById('sv');
    const clone = sv.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    stripCursor(clone);
    // 畫布裡的文字寫的是 font-family:inherit，單獨開啟時沒有頁面可繼承，要在根節點給一份
    clone.setAttribute('font-family', "ui-monospace, 'JetBrains Mono', Menlo, Consolas, 'Noto Sans TC', sans-serif");
    const meta = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
    meta.setAttribute('data-format', 'ghost.ouo/sequence');
    meta.textContent = JSON.stringify({
        version: 1, name: S.name || '', type: S.type, parts: S.parts, rows: S.rows, blocks: S.blocks, legend: S.legend, autonumber: S.autonumber,
        // PUML 來的圖把原文一起放進去，讀回來照原文重建，一個字都不會變
        ...(isPuml() ? { puml: currentPuml() } : {}),
    });
    clone.insertBefore(meta, clone.firstChild);
    const head = '<?xml version="1.0" encoding="UTF-8"?>';
    const str = head + '\n' + new XMLSerializer().serializeToString(clone);
    download(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }), `${fileBase()}.svg`);
}

/* 讀回本機檔案。.json 走自己的格式，.svg 交給 svgin.js 反推。
   讀壞了一律丟錯，呼叫端不覆蓋現有的圖。 */
export async function readFile(file) {
    const text = await file.text();
    const looksSvg = /\.svg$/i.test(file.name) || /^\s*(<\?xml|<svg)/i.test(text);
    if (PUML_EXT.test(file.name) || /^\s*@startuml/i.test(text)) return { puml: text };
    // Mermaid：副檔名 .mmd／.mermaid，或內容（跳過 frontmatter、%% 註解、空行）以 sequenceDiagram 開頭
    if (/[.](mmd|mermaid)$/i.test(file.name)
        || /^(?:\s*\n|\s*%%[^\n]*\n|\s*---\n[\s\S]*?\n---\s*\n)*\s*sequenceDiagram\b/.test(text.replace(/\r/g, ''))) return { mermaid: text.replace(/\r/g, '') };
    if (looksSvg) {
        const fromMeta = pumlInSvg(text);
        if (fromMeta) return fromMeta;
        const { diagram, report } = parseSVG(text);   // 失敗時丟 {msg, detail}
        return { ...diagram, report };
    }
    let o;
    try { o = JSON.parse(text); } catch { throw new Error(T.msg.errFile); }
    if (!o || !Array.isArray(o.parts) || !Array.isArray(o.rows) || !o.parts.length) {
        throw new Error(T.msg.errFile);
    }
    o.rows.forEach((r) => { delete r.dy; if (!r.tone) r.tone = 'solid'; });
    return {
        name: typeof o.name === 'string' ? o.name : '',
        parts: o.parts,
        rows: o.rows,
        blocks: Array.isArray(o.blocks) ? o.blocks : [],
        legend: Array.isArray(o.legend) ? o.legend : undefined,
        autonumber: !!o.autonumber,
        boxes: Array.isArray(o.boxes) ? o.boxes : [],
        report: { native: true },
    };
}

/* 這個工具匯出的 SVG 若是 PUML 來的，<metadata> 裡有原文 */
function pumlInSvg(text) {
    try {
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        const meta = doc.querySelector('metadata[data-format="ghost.ouo/sequence"]');
        const d = meta && JSON.parse(meta.textContent);
        if (d && typeof d.puml === 'string') return { puml: d.puml, name: d.name || '' };
    } catch { /* 交給 parseSVG 處理 */ }
    return null;
}

export function exportPNG() {
    withCleanSvg(buildPNG);
}

function buildPNG() {
    const sv = document.getElementById('sv');
    const clone = sv.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    stripCursor(clone);
    const W = +sv.getAttribute('width'), H = +sv.getAttribute('height');
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim();
    const str = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => {
        const c = document.createElement('canvas');
        c.width = W * 2; c.height = H * 2;
        const ctx = c.getContext('2d');
        ctx.fillStyle = `rgb(${bg})`;
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => download(b, `${fileBase()}.png`));
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
}

/* 編輯用的游標樣式不該跟著圖出去，單獨開啟那張 svg 時滑過去不會變成手指 */
function stripCursor(root) {
    root.querySelectorAll('[style]').forEach((e) => {
        const v = e.getAttribute('style').replace(/cursor\s*:[^;]*;?/g, '').trim();
        if (v) e.setAttribute('style', v); else e.removeAttribute('style');
    });
}

function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
