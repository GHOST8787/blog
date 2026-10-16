// 把 state.js 的資料畫成 SVG。顏色一律讀 theme.css 的變數，深淺主題都跟著翻。
// 這裡不綁任何事件，只在元素上留 data-row / data-part / data-pt，交給 keys.js 委派。

import {
    S, T, TYPES, PAD_X, COL_W, HEAD_Y, HEAD_H, BOX_W, ROW_Y0, ROW_H,
    SELF_W, SELF_H, BLK_HEAD, BLK_FOOT, PHASE_H,
    px, pxOf, pIdx, nameOf, selRange, autoSave, LANE, boxWOf,
} from './state.js';
import { toMermaid } from './io.js';
import { toPumlSeq } from './puml.js';
import { A, renderAct } from './act.js';

const NS = 'http://www.w3.org/2000/svg';
export const sv = document.getElementById('sv');
export const stage = document.getElementById('stage');
export const el = (t, a = {}) => {
    const n = document.createElementNS(NS, t);
    for (const k in a) n.setAttribute(k, a[k]);
    return n;
};

export const cvar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export const rgb = (n, a) => (a === undefined ? `rgb(${cvar(n)})` : `rgb(${cvar(n)} / ${a})`);

export let Y = [], BTOP = new Map(), BBOT = new Map(), DOC_W = 0;
export const rowY = (i) => (Y[i] !== undefined ? Y[i] : ROW_Y0 + i * ROW_H);

/* 每列的 y 用累加算：一列上方開幾個區塊，就先讓出幾條標頭高度，
   嵌套區塊的標籤因此永遠錯開，不會疊在一起。 */
/* 文字可以多行（編輯時 Ctrl+Enter 斷行）。畫的時候拆成 tspan，
   每一行都要重新指定 x，不然會接在上一行尾巴。 */
const LINE_H = 15;
const textLines = (v) => String(v == null ? '' : v).split('\n');
const extraH = (r) => (textLines(r.text).length - 1) * LINE_H;

function setText(t, str, x) {
    const ls = textLines(str);
    if (ls.length === 1) { t.textContent = str; return; }
    ls.forEach((line, k) => {
        const sp = el('tspan', { x, dy: k ? LINE_H : 0 });
        sp.textContent = line;
        t.appendChild(sp);
    });
}

/* 文字實際有多寬，用 canvas 量，不用字數猜（中英混排猜不準）。 */
let mctx = null;
export function measure(str, size, weight) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = `${weight || 400} ${size}px ${getComputedStyle(sv).fontFamily || 'sans-serif'}`;
    return Math.max(...textLines(str).map((s) => mctx.measureText(s).width));
}

/* 欄距固定不動（線跟線之間維持原本的距離），文字長就讓它跨出去，
   只把整張圖的左右邊界讓開到放得下。所以長文字會壓過隔壁的線，這是刻意的。 */
function placeLanes() {
    const n = S.parts.length;
    const boxW = S.parts.map((p) => Math.max(BOX_W, measure(p.name, 12.5) + 30));
    const rel = [];                       // 先用「第一欄為 0」的相對座標排
    for (let i = 0; i < n; i++) rel.push(i * COL_W);
    const last = n ? rel[n - 1] : 0;

    let minX = -(boxW[0] || BOX_W) / 2;
    let maxX = last + (boxW[n - 1] || BOX_W) / 2;
    const span = (a, b) => { minX = Math.min(minX, a); maxX = Math.max(maxX, b); };
    let phaseNeed = 0;
    S.rows.forEach((r) => {
        if (r.kind === 'phase') { phaseNeed = Math.max(phaseNeed, measure(r.text, 12.5, 600) + 96); return; }
        if (r.kind === 'note') {
            const x = rel[Math.max(0, pIdx(r.at))] || 0;
            span(x + 16, x + 16 + Math.max(110, measure(r.text, 12) + 28) + 6);
            return;
        }
        const a = pIdx(r.from), b = pIdx(r.to), w = measure(r.text, 12.5);
        if (a === b) {
            const x = rel[Math.max(0, a)] || 0;
            if (a === n - 1) span(x - SELF_W - 12 - w - 6, x);
            else span(x, x + SELF_W + 12 + w + 6);
            return;
        }
        const c = ((rel[a] || 0) + (rel[b] || 0)) / 2;
        span(c - w / 2 - 6, c + w / 2 + 6);
    });

    let padL = Math.max(PAD_X, -minX + 24);
    let padR = Math.max(PAD_X, maxX - last + 24);
    // 階段帶橫跨整張圖，比現有寬度長的話兩邊一起讓
    const short = phaseNeed - (padL + last + padR);
    if (short > 0) { padL += short / 2; padR += short / 2; }

    LANE.x = rel.map((v) => Math.round(v + padL));
    LANE.boxW = boxW;
    return Math.round(padL + last + padR);
}

const ELSE_H = 20;
let ELSE_Y = new Map();
function layout() {
    Y = []; BTOP = new Map(); BBOT = new Map(); ELSE_Y = new Map();
    let y = ROW_Y0;
    for (let i = 0; i < S.rows.length; i++) {
        // alt 的 else 分界線：先讓出一條標籤的高度，記下線的位置
        S.blocks.forEach((b) => (b.elses || []).forEach((e) => { if (e.at === i && b.from < i) { ELSE_Y.set(e, y + 4); y += ELSE_H; } }));
        S.blocks.filter((b) => b.from === i).sort((a, b) => (b.to - b.from) - (a.to - a.from))
            .forEach((b) => { BTOP.set(b.id, y); y += BLK_HEAD; });
        const r = S.rows[i], ex = extraH(r);
        // 文字長在哪一邊，空間就留在哪一邊：訊息在線上方、Note 在框內往下、自呼叫置中
        if (r.kind === 'phase') { y += 14 + ex / 2; Y.push(y + 20); y += PHASE_H + 10 + ex / 2; }
        else if (r.kind === 'note') { y += 24; Y.push(y); y += ROW_H - 24 + ex; }
        else if (r.from === r.to) { y += 24 + ex / 2; Y.push(y); y += ROW_H - 24 + ex / 2; }
        else { y += 24 + ex; Y.push(y); y += ROW_H - 24; }
        S.blocks.filter((b) => b.to === i).sort((a, b) => (a.to - a.from) - (b.to - b.from))
            .forEach((b, k) => { BBOT.set(b.id, Y[i] + 20 + k * BLK_FOOT); y += BLK_FOOT; });
    }
    return y + 26;
}

/* 圖例排版：一條一條往右排，排不下就換到下一行。中文算一個字寬、英數算 0.6。 */
const LEG_H = 18;
const legTextW = (str, fs) => [...str].reduce((a, c) => a + (c.charCodeAt(0) > 255 ? fs : fs * 0.6), 0);
function legendLayout(W) {
    const items = []; let x = 28, row = 0;
    S.legend.forEach((lg) => {
        if (lg.sep) { items.push({ x, row }); return; }     // PUML 圖例的分隔線：不佔位置
        const w = (lg.tone === 'text' ? 0 : 38) + legTextW(lg.text, 11) + 22;
        if (x > 28 && (lg.line || x + w > W - 20)) { x = 28; row++; }
        items.push({ x, row });
        x += w;
    });
    return { items, rows: row + 1 };
}

export function render() {
    if (S.type === 'act') {
        renderAct();
        paintChrome();
        if (exporting) return;
        const mm = document.getElementById('mm');
        if (document.activeElement !== mm) mm.value = A.text;
        paintName();
        autoSave();
        return;
    }
    const C_ON = rgb('--c-purple'), C_OFF = rgb('--c-body'), C_DASH = rgb('--c-purple', '.72');
    const C_LINE = cvar('--c-sep'), C_CYAN = rgb('--c-cyan'), C_WARN = rgb('--c-warn');
    const n = S.parts.length;
    const W = DOC_W = Math.max(560, placeLanes());
    const leg = legendLayout(W);
    const legTop = (leg.rows - 1) * LEG_H;
    const footH = S.footer ? S.footer.split('\n').length * 15 + 6 : 0;
    const H = Math.max(240, layout() + legTop + footH);
    sv.textContent = '';
    applySize(W, H);

    const defs = el('defs');
    for (const [k, c] of [['n', C_OFF], ['s', C_ON], ['d', C_DASH]]) {
        const solid = el('marker', { id: 'mk-solid-' + k, markerWidth: 10, markerHeight: 10, refX: 9, refY: 3, orient: 'auto', markerUnits: 'userSpaceOnUse' });
        solid.appendChild(el('path', { d: 'M0,0 L9,3 L0,6 z', fill: c }));
        // 雙向箭頭的起點那一頭
        const rev = el('marker', { id: 'mk-rev-' + k, markerWidth: 10, markerHeight: 10, refX: 0, refY: 3, orient: 'auto', markerUnits: 'userSpaceOnUse' });
        rev.appendChild(el('path', { d: 'M9,0 L0,3 L9,6 z', fill: c }));
        defs.appendChild(rev);
        const open = el('marker', { id: 'mk-open-' + k, markerWidth: 12, markerHeight: 12, refX: 9, refY: 4, orient: 'auto', markerUnits: 'userSpaceOnUse' });
        open.appendChild(el('path', { d: 'M0,0 L9,4 L0,8', fill: 'none', stroke: c, 'stroke-width': 1.4 }));
        defs.append(solid, open);
    }
    sv.appendChild(defs);
    sv.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: rgb('--c-bg') }));

    const L = S.sel.layer;
    const [s0, s1] = selRange();

    if (L === 'row' || L === 'point') {
        for (let i = s0; i <= s1 && S.rows.length; i++) {
            sv.appendChild(el('rect', { x: 0, y: rowY(i) - 24, width: W, height: ROW_H - 8, fill: rgb('--c-purple', '.09') }));
            sv.appendChild(el('rect', { x: 0, y: rowY(i) - 24, width: 3, height: ROW_H - 8, fill: C_ON }));
        }
    }

    (S.boxes || []).forEach((bx) => {
        const ks = bx.ids.map(pIdx).filter((k) => k >= 0);
        if (!ks.length) return;
        const a = Math.min(...ks), b = Math.max(...ks);
        const x1 = px(a) - boxWOf(a) / 2 - 10, x2 = px(b) + boxWOf(b) / 2 + 10;
        const c = bx.color ? bx.color.replace(/^#(?![0-9a-f]{3}$|[0-9a-f]{6}$)/i, '') : '';
        sv.appendChild(el('rect', { x: x1, y: 4, width: x2 - x1, height: H - 32 - legTop - footH, rx: 6,
            fill: c || rgb('--c-ink', '.04'), 'fill-opacity': c ? .12 : 1, stroke: rgb('--c-ink', '.18') }));
        if (bx.label) {
            const t = el('text', { x: (x1 + x2) / 2, y: 17, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600, 'font-family': 'inherit', fill: cvar('--c-dim') });
            t.textContent = bx.label;
            sv.appendChild(t);
        }
    });
    S.parts.forEach((p, i) => {
        const hot = S.drag && S.drag.lane === i;
        sv.appendChild(el('line', {
            x1: px(i), y1: HEAD_Y + HEAD_H, x2: px(i), y2: H - 32 - legTop - footH,
            stroke: hot ? C_ON : C_LINE, 'stroke-width': hot ? 1.6 : 1,
            'stroke-dasharray': hot ? 'none' : '4 5',
        }));
    });

    /* 執行長條（PUML 的 activate／deactivate、++／--、return） */
    paintBars(H - 32 - legTop - footH);

    /* 區塊框 */
    S.blocks.forEach((b, bi) => {
        const depth = S.blocks.filter((o, oi) => o !== b && o.from <= b.from && o.to >= b.to &&
            (o.from < b.from || o.to > b.to || oi < bi)).length;
        const pad = Math.max(16, 40 - depth * 12);
        const xs = [];
        for (let i = b.from; i <= b.to; i++) {
            const r = S.rows[i];
            if (!r) continue;
            if (r.kind === 'note') xs.push(pxOf(r.at), r.at2 && pIdx(r.at2) >= 0 ? pxOf(r.at2) : pxOf(r.at) + 160);
            else if (r.kind === 'phase') xs.push(px(0), px(n - 1));
            else xs.push(pxOf(r.from), pxOf(r.to) + (r.from === r.to ? SELF_W + 10 : 0));
        }
        if (!xs.length) return;
        const on = L === 'block' && S.sel.bi === bi;
        const col = on ? C_ON : C_CYAN;
        const x1 = Math.min(...xs) - pad, x2 = Math.max(...xs) + pad;
        const y1 = BTOP.get(b.id) ?? (rowY(b.from) - 40), y2 = BBOT.get(b.id) ?? (rowY(b.to) + 22);
        sv.appendChild(el('rect', { x: x1, y: y1, width: x2 - x1, height: y2 - y1, rx: 4, fill: 'none', stroke: col, 'stroke-width': on ? 1.6 : 1, opacity: on ? 1 : .55 }));
        sv.appendChild(el('path', { d: `M${x1},${y1} h58 l10,16 h-68 z`, fill: col, opacity: on ? .22 : .14 }));
        const g = el('g', { 'data-block': bi, style: 'cursor:pointer' });
        const kt = el('text', { x: x1 + 8, y: y1 + 13, fill: col, 'font-size': 11, 'font-family': 'inherit' });
        kt.textContent = b.kind;
        const lt = el('text', { x: x1 + 74, y: y1 + 13, fill: col, 'font-size': 11, 'font-family': 'inherit', opacity: .85 });
        lt.textContent = b.label;
        g.append(kt, lt);
        sv.appendChild(g);
        // alt 的 else：虛線分界加上 [條件]
        (b.elses || []).forEach((e) => {
            const ey = ELSE_Y.get(e) ?? (y2 - 8);
            sv.appendChild(el('line', { x1: x1, y1: ey, x2: x2, y2: ey, stroke: col, 'stroke-dasharray': '5 4', opacity: on ? 1 : .55 }));
            if (e.label) {
                const et = el('text', { x: x1 + 8, y: ey + 13, fill: col, 'font-size': 11, 'font-family': 'inherit', opacity: .85 });
                et.textContent = `[${e.label}]`;
                sv.appendChild(et);
            }
        });
    });

    /* 參與者頂框 */
    S.parts.forEach((p, i) => {
        const on = L === 'part' && S.sel.i === i;
        const g = el('g', { 'data-part': i, style: 'cursor:grab' });
        g.appendChild(el('rect', {
            x: px(i) - boxWOf(i) / 2, y: HEAD_Y, width: boxWOf(i), height: HEAD_H, rx: 7,
            fill: on ? rgb('--c-purple', '.14') : rgb('--c-surface'),
            stroke: on ? C_ON : (p.kind === 'actor' ? rgb('--c-purple', '.45') : rgb('--c-ink', '.14')),
            'stroke-width': on ? 1.6 : 1,
        }));
        if (p.kind === 'actor') {
            g.appendChild(el('circle', { cx: px(i) - boxWOf(i) / 2 + 16, cy: HEAD_Y + 17, r: 4.5, fill: 'none', stroke: rgb('--c-purple', '.75'), 'stroke-width': 1.2 }));
            g.appendChild(el('path', { d: `M${px(i) - boxWOf(i) / 2 + 10},${HEAD_Y + 33} q6,-9 12,0`, fill: 'none', stroke: rgb('--c-purple', '.75'), 'stroke-width': 1.2 }));
        } else shapeIcon(g, p.shape, px(i) - boxWOf(i) / 2 + 16, HEAD_Y + HEAD_H / 2, rgb('--c-cyan', '.8'));
        const t = el('text', { x: px(i) + (p.kind === 'actor' || ICON_SHAPES.includes(p.shape) ? 10 : 0), y: HEAD_Y + 28, 'text-anchor': 'middle', 'font-size': 12.5, 'font-family': 'inherit', fill: on ? C_ON : C_OFF });
        t.textContent = p.name;
        g.appendChild(t);
        sv.appendChild(g);
    });

    /* 列 */
    let msgNo = 0;
    // autonumber：訊息起點畫一個帶編號的小圓
    const numBadge = (g, x, y) => {
        msgNo++;
        g.appendChild(el('circle', { cx: x, cy: y, r: 8.5, fill: rgb('--c-ink', '.85') }));
        const t = el('text', { x, y: y + 3.5, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 700, 'font-family': 'inherit', fill: rgb('--c-bg') });
        t.textContent = msgNo;
        g.appendChild(t);
    };
    S.rows.forEach((r, i) => {
        const y = rowY(i);
        const inSel = i >= s0 && i <= s1 && (L === 'row' || L === 'point');
        const dashed = r.tone === 'dash';
        const col = inSel ? C_ON : (dashed ? C_DASH : C_OFF);
        const mk = inSel ? 's' : (dashed ? 'd' : 'n');
        const g = el('g', { 'data-row': i, style: 'cursor:pointer' });

        const ex = extraH(r);
        if (r.kind === 'phase' && !r.delay) {
            g.appendChild(el('rect', {
                x: 24, y: y - 20 - ex / 2, width: W - 48, height: PHASE_H - 6 + ex, rx: 4,
                fill: inSel ? rgb('--c-purple', '.14') : rgb('--c-ink', '.05'),
                stroke: inSel ? C_ON : rgb('--c-ink', '.1'),
            }));
            const t = el('text', { x: W / 2, y: y + 5 - ex / 2, 'text-anchor': 'middle', 'font-size': 12.5, 'font-family': 'inherit', 'font-weight': 600, fill: inSel ? C_ON : C_OFF });
            setText(t, r.text, W / 2);
            g.appendChild(t);
        } else if (r.kind === 'phase' && r.delay) {
            // PUML 的 ...：時間間隔，畫成一行淡色斜體字
            const t = el('text', { x: W / 2, y: y + 4 - ex / 2, 'text-anchor': 'middle', 'font-size': 12, 'font-style': 'italic', 'font-family': 'inherit', fill: inSel ? C_ON : cvar('--c-dim') });
            setText(t, r.text ? `⋯ ${r.text} ⋯` : '⋯', W / 2);
            g.appendChild(t);
        } else if (r.kind === 'note') {
            let w = Math.max(110, measure(r.text, 12) + 28);
            // 跨兩個參與者的 Note：寬度至少蓋過兩條生命線
            if (r.pos === 'over' && r.at2 && pIdx(r.at2) >= 0) w = Math.max(w, Math.abs(pxOf(r.at2) - pxOf(r.at)) + 60);
            const isRef = r.kw === 'ref';
            if (isRef) w += 36;
            const x = noteX(r, w);
            if (isRef) {
                g.appendChild(el('rect', { x, y: y - 15, width: w, height: 26 + ex + 11, fill: rgb('--c-surface'), stroke: inSel ? col : rgb('--c-ink', '.45') }));
                g.appendChild(el('path', { d: `M${x},${y - 15} h30 v10 l-6,6 h-24 z`, fill: rgb('--c-ink', '.12') }));
                const rt = el('text', { x: x + 5, y: y - 4, 'font-size': 10, 'font-weight': 700, 'font-family': 'inherit', fill: inSel ? col : C_OFF });
                rt.textContent = 'ref';
                g.appendChild(rt);
            } else {
                g.appendChild(el('path', {
                    d: `M${x},${y - 15} h${w - 11} l11,11 v${26 + ex} h-${w} z`,
                    fill: rgb('--c-warn', '.1'), stroke: inSel ? col : rgb('--c-warn', '.55'),
                }));
            }
            const tx = isRef ? x + 40 : x + 10;
            const t = el('text', { x: tx, y: y + 7, 'font-size': 12, 'font-family': 'inherit', fill: inSel ? col : isRef ? C_OFF : C_WARN });
            setText(t, r.text, tx);
            g.appendChild(t);
        } else if (r.from === r.to) {
            const last = pIdx(r.from) === n - 1;
            const x = pxOf(r.from), d = last ? -1 : 1, yy = y;
            g.appendChild(el('path', {
                d: `M${x},${yy - SELF_H / 2} h${d * SELF_W} v${SELF_H} h${-d * (SELF_W - 7)}`,
                fill: 'none', stroke: col, 'stroke-width': 1.4,
                'stroke-dasharray': dashed ? '6 4' : 'none', 'marker-end': `url(#mk-solid-${mk})`,
            }));
            const tx = x + d * (SELF_W + 12);
            const t = el('text', { x: tx, y: yy + 4 - ex / 2, 'font-size': 12.5, 'font-family': 'inherit', 'text-anchor': last ? 'end' : 'start', fill: col });
            setText(t, r.text, tx);
            g.appendChild(t);
            if (S.autonumber) numBadge(g, x, yy - SELF_H / 2);
            handle(g, x, yy - SELF_H / 2, i, 'from', inSel, C_ON);
        } else {
            const x1 = pxOf(r.from), x2 = pxOf(r.to);
            const y1 = y, y2 = y;
            const dir = x2 > x1 ? 1 : -1;
            // 箭頭頭：一般／開口；x＝打叉（訊息丟失）、o＝小圓；Mermaid 的 -> 是沒有頭的線；<<->> 兩頭都有
            const bare = r.mark || r.nohead;
            const ln = { x1: r.both ? x1 + dir * 7 : x1, y1, x2: bare ? x2 - dir * (r.mark ? 6 : 0) : x2 - dir * 7, y2, stroke: col, 'stroke-width': 1.4,
                'stroke-dasharray': (dashed || r.type === 'return') ? '6 4' : 'none' };
            if (!bare) ln['marker-end'] = `url(#mk-${r.type === 'sync' ? 'solid' : 'open'}-${mk})`;
            if (r.both) ln['marker-start'] = `url(#mk-rev-${mk})`;
            g.appendChild(el('line', ln));
            if (r.mark === 'x') {
                const cx = x2 - dir * 6;
                g.appendChild(el('path', { d: `M${cx - 5},${y2 - 5} L${cx + 5},${y2 + 5} M${cx + 5},${y2 - 5} L${cx - 5},${y2 + 5}`, stroke: col, 'stroke-width': 1.8 }));
            }
            if (r.mark === 'o') g.appendChild(el('circle', { cx: x2 - dir * 5, cy: y2, r: 4.5, fill: 'none', stroke: col, 'stroke-width': 1.4 }));
            const tx = (x1 + x2) / 2;
            const t = el('text', { x: tx, y: Math.min(y1, y2) - 9 - ex, 'text-anchor': 'middle', 'font-size': 12.5, 'font-family': 'inherit', fill: col });
            setText(t, r.text, tx);
            g.appendChild(t);
            if (S.autonumber) numBadge(g, x1, y1);
            handle(g, x1, y1, i, 'from', inSel, C_ON);
            handle(g, x2, y2, i, 'to', inSel, C_ON);
        }

        if (!exporting) {
            const hit = el('rect', { x: 0, y: y - 24 - ex, width: W, height: ROW_H - 8 + ex * 2, fill: 'transparent' });
            g.insertBefore(hit, g.firstChild);
        }
        sv.appendChild(g);
    });

    /* 圖例 */
    const ly0 = H - 14 - legTop - footH;
    S.legend.forEach((lg, k) => {
        if (lg.sep) return;
        const x = leg.items[k].x, ly = ly0 + leg.items[k].row * LEG_H;
        // tone='text' 是純註腳，不配線條樣本，否則看起來像在說「實線＝這段話」
        if (lg.tone !== 'text') {
            sv.appendChild(el('line', {
                x1: x, y1: ly, x2: x + 30, y2: ly,
                stroke: lg.tone === 'dash' ? C_DASH : C_OFF, 'stroke-width': 1.4,
                'stroke-dasharray': lg.tone === 'dash' ? '6 4' : 'none',
                'marker-end': `url(#mk-solid-${lg.tone === 'dash' ? 'd' : 'n'})`,
            }));
        }
        const t = el('text', { x: x + (lg.tone === 'text' ? 0 : 38), y: ly + 4, 'font-size': 11, 'font-family': 'inherit', fill: cvar('--c-dim'), 'data-legend': k, style: 'cursor:pointer' });
        t.textContent = lg.text;
        sv.appendChild(t);
    });

    if (S.header) {
        const t = el('text', { x: W - 16, y: 13, 'text-anchor': 'end', 'font-size': 11, 'font-family': 'inherit', fill: cvar('--c-dim') });
        t.textContent = S.header.split('\n').join('  ');
        sv.appendChild(t);
    }
    if (S.footer) S.footer.split('\n').forEach((s, k, arr) => {
        const t = el('text', { x: W / 2, y: H - 6 - (arr.length - 1 - k) * 15, 'text-anchor': 'middle', 'font-size': 11, 'font-family': 'inherit', fill: cvar('--c-dim') });
        t.textContent = s;
        sv.appendChild(t);
    });
    paintFoot();
    paintName();
    // 匯出那一瞬間的假選取不該寫進狀態列，也不該捲動畫面
    if (exporting) return;

    paintStatus();
    paintChrome();
    const mm = document.getElementById('mm');
    if (document.activeElement !== mm) mm.value = S.fmt === 'puml' ? toPumlSeq() : toMermaid();

    const key = JSON.stringify(S.sel);
    if (key !== lastSelKey) { lastSelKey = key; if (!skipScroll) keepInView(); }
    autoSave();
}

function handle(g, x, y, i, end, inSel, C_ON) {
    if (exporting) return;
    const on = inSel && S.sel.layer === 'point' && S.sel.end === end;
    g.appendChild(el('circle', {
        cx: x, cy: y, r: on ? 6 : 3.6,
        fill: on ? C_ON : (inSel ? rgb('--c-purple', '.6') : rgb('--c-ink', '.18')),
        stroke: on ? rgb('--c-bg') : rgb('--c-ink', '.3'), 'stroke-width': on ? 2 : 1,
        'data-pt': i, 'data-end': end, style: 'cursor:grab',
    }));
}

/* 狀態列：永遠寫著現在選到什麼、這一層的鍵能做什麼 */
function paintStatus() {
    const w = document.getElementById('stWhat'), k = document.getElementById('stKeys');
    const L = S.sel.layer, r = S.rows[S.sel.i];
    if (L === 'part') {
        const p = S.parts[S.sel.i];
        w.textContent = T.layer.partWhat(p.name, p.kind);
        k.innerHTML = T.layer.partKeys;
        return;
    }
    if (L === 'block') {
        const b = S.blocks[S.sel.bi];
        if (!b) { S.sel.layer = 'row'; return paintStatus(); }
        w.textContent = T.layer.blockWhat(b.kind, b.label, b.from + 1, b.to + 1);
        k.innerHTML = T.layer.blockKeys;
        return;
    }
    if (L === 'point' && r && r.kind === 'msg') {
        const who = S.sel.end === 'from' ? T.layer.sender : T.layer.receiver;
        w.textContent = T.layer.pointWhat(who, nameOf(r[S.sel.end]));
        k.innerHTML = T.layer.pointKeys;
        return;
    }
    if (!r) { w.textContent = T.layer.emptyWhat; k.innerHTML = T.layer.emptyKeys; return; }
    const [a, b] = selRange();
    const span = T.layer.rowSpan(a + 1, b + 1);
    const tone = r.tone === 'dash' ? T.layer.dash : '';
    // 狀態列只有一行，多行文字在這裡壓成空白
    const flat = (v) => textLines(v).join(' ');
    if (r.kind === 'phase') w.textContent = `${span} · ${T.layer.phaseWhat(flat(r.text))}`;
    else if (r.kind === 'note') w.textContent = `${span} · Note @ ${nameOf(r.at)}`;
    else if (r.from === r.to) w.textContent = `${span} · ${T.layer.selfCall(nameOf(r.from))}${tone}`;
    else w.textContent = `${span} · ${nameOf(r.from)} → ${nameOf(r.to)} · ${T.typeLabel[r.type]}${tone}`;
    k.innerHTML = T.layer.rowKeys + ` <span class="more">· ${T.layer.more}</span>`;
}

/* 命名欄跟著資料走（讀檔、復原都會變）；使用者正在打字時不要蓋掉他 */
function paintName() {
    const nb = document.getElementById('docName');
    if (nb && document.activeElement !== nb) nb.value = S.name || '';
}

function paintFoot() {
    document.getElementById('foot').textContent = T.msg.foot(
        S.parts.length, S.rows.length,
        S.rows.filter((r) => r.kind === 'msg' && r.from !== r.to).length,
        S.rows.filter((r) => r.kind === 'msg' && r.from === r.to).length,
        S.rows.filter((r) => r.kind === 'note').length,
        S.rows.filter((r) => r.kind === 'phase').length,
        S.blocks.length,
    );
}

/* 選取跑到視窗外時把頁面捲過去。上方釘住那幾條的高度要扣掉。 */
let lastSelKey = '';
export function resetSelKey() { lastSelKey = ''; }

/* 縮放：ZOOM 是螢幕像素 ÷ 圖座標。滑鼠與編輯框換算座標都要經過它。
   zoomFit 開著時每次重畫都重算，讓整張圖的寬度剛好塞進畫布。 */
export let ZOOM = 1;
let zoomFit = false;
const zoomPct = document.getElementById('zoomPct');
const ZMIN = 0.1, ZMAX = 3;
function fitZoom(W) {
    const avail = stage.clientWidth - 8;
    return avail > 0 ? Math.min(1, Math.max(ZMIN, avail / W)) : 1;
}
/* 圖畫好之後定尺寸：縮放只改顯示尺寸，viewBox（圖本身的座標）不動；匯出一律用原尺寸 */
export function applySize(W, H) {
    if (zoomFit && !exporting) ZOOM = fitZoom(W);
    const z = exporting ? 1 : ZOOM;
    if (!exporting && zoomPct) zoomPct.textContent = Math.round(z * 100) + '%';
    sv.setAttribute('width', Math.round(W * z));
    sv.setAttribute('height', Math.round(H * z));
    sv.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // 圖比版面寬的時候，整塊工作區跟著長（用縮放後的寬度，縮小時才會回到正中）
    const app = document.querySelector('.seq-app');
    if (app && !exporting) app.style.maxWidth = Math.max(1180, W * z + 24) + 'px';
}
export const isExporting = () => exporting;
export const skipScrollNow = () => skipScroll;
export function setZoom(z, fit = false) {
    zoomFit = fit;
    if (!fit) ZOOM = Math.min(ZMAX, Math.max(ZMIN, z));
    render();
}

/* 滑鼠點的東西本來就在畫面上，不需要把頁面捲過去；只有鍵盤移動才追。 */
let skipScroll = false;
export function setSkipScroll(v) { skipScroll = v; }

/* 匯出時把編輯用的記號全部拿掉：端點把手、點擊用的透明區、選取高亮。
   畫一張乾淨的，交給 fn 去輸出，然後把畫面還原成原本選到的樣子。 */
let exporting = false;
export function withCleanSvg(fn) {
    const keep = S.sel, keepA = A.sel;
    exporting = true;
    S.sel = { layer: 'none', i: -1, j: -1, end: 'to', bi: -1 };
    A.sel = { ...A.sel, layer: 'none' };
    render();
    try { return fn(); } finally {
        exporting = false;
        S.sel = keep;
        A.sel = keepA;
        resetSelKey();
        render();
    }
}

function keepInView() {
    if (S.drag || S.editing) return;
    const r = sv.getBoundingClientRect();
    let y1, y2, x1 = null, x2 = null;
    if (S.sel.layer === 'part') {
        y1 = HEAD_Y; y2 = HEAD_Y + HEAD_H;
        x1 = px(S.sel.i) - boxWOf(S.sel.i) / 2; x2 = px(S.sel.i) + boxWOf(S.sel.i) / 2;
    } else if (S.sel.layer === 'block') {
        const b = S.blocks[S.sel.bi];
        if (!b) return;
        y1 = BTOP.get(b.id) ?? rowY(b.from) - 40; y2 = y1 + 40;
    } else {
        if (!S.rows.length) return;
        const [a, z] = selRange();
        y1 = rowY(a) - 30; y2 = rowY(z) + 30;
        const rw = S.rows[S.sel.i];
        if (rw && rw.kind === 'msg') {
            const xa = pxOf(rw.from), xb = pxOf(rw.to);
            x1 = Math.min(xa, xb) - 30;
            x2 = Math.max(xa, xb) + (rw.from === rw.to ? SELF_W + 120 : 30);
        }
    }
    scrollRectIntoView(x1 === null ? null : r.left + x1 * ZOOM, r.top + y1 * ZOOM,
        x2 === null ? null : r.left + x2 * ZOOM, r.top + y2 * ZOOM);
}

/* 把畫面上（螢幕座標）的一塊範圍捲進看得到的地方。
   分割檢視時圖在畫布裡自己捲，要捲的是畫布；只看圖時捲整頁，上方釘住那幾條的高度要扣掉。 */
export function scrollRectIntoView(vx1, vy1, vx2, vy2) {
    const bars = document.querySelector('.seq-bars');
    const stick = bars ? bars.getBoundingClientRect().height : 0;
    const split = document.body.classList.contains('view-split');
    const c = split ? stage.getBoundingClientRect() : null;
    const top = split ? c.top : 0, bottom = split ? c.top + stage.clientHeight : innerHeight;
    const left = split ? c.left : 0, right = split ? c.left + stage.clientWidth : innerWidth;
    const padT = (split ? 0 : stick) + 20, padB = 24, padX = 36;
    let dx = 0, dy = 0;
    if (vy1 < top + padT) dy = vy1 - top - padT;
    else if (vy2 > bottom - padB) dy = Math.min(vy2 - bottom + padB, vy1 - top - padT);
    if (vx1 !== null) {
        /* 分割時畫布窄，跨好幾欄的箭頭塞不下：改成把中間（文字所在）對到畫布正中 */
        if (split && vx2 - vx1 > right - left - padX * 2) dx = (vx1 + vx2) / 2 - (left + right) / 2;
        else if (vx1 < left + padX) dx = vx1 - left - padX;
        else if (vx2 > right - padX) dx = Math.min(vx2 - right + padX, vx1 - left - padX);
    }
    if (dx || dy) (split ? stage : window).scrollBy(dx, dy);
}

/* 參與者的 PUML 外形：在框的左邊畫一個小圖示 */
const ICON_SHAPES = ['database', 'queue', 'entity', 'boundary', 'control', 'collections'];
function shapeIcon(g, shape, cx, cy, c) {
    const s = { fill: 'none', stroke: c, 'stroke-width': 1.2 };
    if (shape === 'database') {
        g.appendChild(el('path', { ...s, d: `M${cx - 6},${cy - 6} v12 a6,2.5 0 0 0 12,0 v-12` }));
        g.appendChild(el('ellipse', { ...s, cx, cy: cy - 6, rx: 6, ry: 2.5 }));
    } else if (shape === 'queue') {
        g.appendChild(el('rect', { ...s, x: cx - 8, y: cy - 5, width: 16, height: 10, rx: 5 }));
    } else if (shape === 'entity') {
        g.appendChild(el('circle', { ...s, cx, cy: cy - 1, r: 5.5 }));
        g.appendChild(el('line', { ...s, x1: cx - 6, y1: cy + 7, x2: cx + 6, y2: cy + 7 }));
    } else if (shape === 'boundary') {
        g.appendChild(el('circle', { ...s, cx: cx + 2, cy, r: 5.5 }));
        g.appendChild(el('path', { ...s, d: `M${cx - 8},${cy - 6} v12 M${cx - 8},${cy} h4.5` }));
    } else if (shape === 'control') {
        g.appendChild(el('circle', { ...s, cx, cy: cy + 1, r: 5.5 }));
        g.appendChild(el('path', { ...s, d: `M${cx + 1},${cy - 7.5} l-3,3 l3,3` }));
    } else if (shape === 'collections') {
        g.appendChild(el('rect', { ...s, x: cx - 5, y: cy - 7, width: 11, height: 9 }));
        g.appendChild(el('rect', { ...s, x: cx - 7, y: cy - 4, width: 11, height: 9, fill: rgb('--c-surface') }));
    }
}

/* Note 的位置：右側（預設）、左側、蓋在一個或兩個參與者上 */
function noteX(r, w) {
    const x = pxOf(r.at);
    if (r.pos === 'left') return Math.max(4, x - 16 - w);     // 最左邊那一欄的左側 Note 不要被切掉
    if (r.pos === 'over') {
        if (r.at2 && pIdx(r.at2) >= 0) return (x + pxOf(r.at2)) / 2 - w / 2;
        return x - w / 2;
    }
    return x + 16;
}

/* 執行長條：照列的順序走一遍，開了就記起點，關了就畫一段 */
function paintBars(yEnd) {
    const open = new Map(), segs = [];
    const start = (id, y) => { if (!open.has(id)) open.set(id, []); open.get(id).push(y); };
    const stop = (id, y) => { const a = open.get(id); if (a && a.length) segs.push({ id, y0: a.pop(), y1: y, d: a.length }); };
    S.rows.forEach((r, i) => {
        if (r.kind !== 'msg') return;
        const y = rowY(i);
        if (r.ret) stop(r.from, y);
        if (r.mod === '++') start(r.to, y);
        if (r.mod === '--') stop(r.from, y);
        (r.act || []).forEach((a) => (a.op === 'activate' ? start(a.id, y) : stop(a.id, y)));
    });
    open.forEach((a, id) => { while (a.length) segs.push({ id, y0: a.pop(), y1: yEnd - 6, d: a.length }); });
    segs.forEach((g) => {
        const k = pIdx(g.id);
        if (k < 0) return;
        sv.appendChild(el('rect', {
            x: px(k) - 5 + g.d * 5, y: g.y0, width: 10, height: Math.max(8, g.y1 - g.y0),
            fill: rgb('--c-surface'), stroke: rgb('--c-ink', '.35'), 'stroke-width': 1,
        }));
    });
}

/* 工具列跟著目前的圖種與格式變：PUML 模式下 .json／Mermaid 那兩顆換成 PUML 的 */
export function paintChrome() {
    const puml = S.type === 'act' || S.fmt === 'puml';
    const set = (sel, txt, tip) => {
        const b = document.querySelector(sel);
        if (!b) return;
        if (!b.dataset.busy) b.textContent = txt;
        b.title = tip;
    };
    set('[data-act="save"]', puml ? T.btn.savePuml : T.btn.save, puml ? T.hint.savePumlTip : T.hint.saveTip);
    set('[data-act="copy"]', puml ? T.btn.copyPuml : T.btn.copy, puml ? T.hint.copyPumlTip : T.hint.copyTip);
    const clr = document.querySelector('[data-act="clear"]');
    if (clr) clr.title = S.type === 'act' ? T.hint.clearActTip : T.hint.clearTip;
    const title = S.type === 'act' ? T.titleAct : T.title;
    const h1 = document.getElementById('seqTitle');
    if (h1 && h1.textContent !== title) { h1.textContent = title; document.title = `${title} | GHOST.ouo`; }
    document.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('on', b.dataset.type === S.type));
    document.querySelectorAll('[data-help]').forEach((d) => { d.hidden = d.dataset.help !== S.type; });
    const dt = document.getElementById('ddType');
    if (dt) dt.textContent = S.type === 'act' ? T.btn.typeAct : T.btn.typeSeq;
    const h = document.getElementById('mmHead');
    if (h) h.textContent = puml ? T.msg.mmHeadPuml : T.msg.mmHead;
}
