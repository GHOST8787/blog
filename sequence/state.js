// 時序圖的狀態、版面常數、復原堆疊。畫面怎麼畫在 render.js，鍵盤與滑鼠在 keys.js。
// 焦點分四層，放在 S.sel.layer：row（預設）／point（端點）／block（區塊框）／part（參與者）。

let uid = 0;
export const nid = (p) => p + (++uid);

export const TYPES = ['sync', 'return', 'async'];
export const BLOCK_KINDS = ['loop', 'alt', 'opt'];

/* 版面常數 */
export const PAD_X = 92, COL_W = 186, HEAD_Y = 26, HEAD_H = 46, BOX_W = 150;
export const ROW_Y0 = 112, ROW_H = 50, SELF_W = 34, SELF_H = 24;
export const BLK_HEAD = 28, BLK_FOOT = 12, PHASE_H = 40;

export let T = null;                       // 語言字串，app.js 開場就設
export function setStrings(s) { T = s; }

export const S = {
    parts: [],
    rows: [],
    blocks: [],
    legend: [],
    sel: { layer: 'row', i: 0, j: 0, end: 'to', bi: 0 },
    editing: null,
    drag: null,
};

/* 開啟工具時看到的示範圖。純通用流程，不放任何實際專案內容。
   文字放在 strings.zh/en 的 sample，這裡只管結構，索引對應那邊的陣列順序。 */
export function sampleDiagram() {
    const X = T.sample, [A, B, C, D] = X.parts.map((n, i) => ({ id: 'ABCD'[i], name: n, kind: i ? 'object' : 'actor' }));
    const r = X.rows;
    const msg = (from, to, type, tone, text) => ({ id: nid('r'), kind: 'msg', from, to, type, tone, text });
    return {
        parts: [A, B, C, D],
        rows: [
            { id: nid('r'), kind: 'phase', tone: 'solid', text: r[0] },
            msg('A', 'B', 'sync', 'solid', r[1]),
            msg('B', 'C', 'sync', 'solid', r[2]),
            msg('C', 'D', 'sync', 'solid', r[3]),
            msg('D', 'C', 'return', 'solid', r[4]),
            msg('C', 'C', 'self', 'solid', r[5]),
            msg('C', 'B', 'return', 'solid', r[6]),
            { id: nid('r'), kind: 'note', at: 'B', tone: 'solid', text: r[7] },
            msg('B', 'A', 'async', 'solid', r[8]),
            { id: nid('r'), kind: 'phase', tone: 'solid', text: r[9] },
            msg('B', 'C', 'sync', 'dash', r[10]),
            msg('C', 'B', 'return', 'dash', r[11]),
        ],
        blocks: [{ id: nid('b'), kind: 'loop', label: X.block, from: 3, to: 4 }],
    };
}

export function loadDiagram(d) {
    S.parts = d.parts;
    S.rows = d.rows;
    S.blocks = d.blocks || [];
    if (d.legend) S.legend = d.legend;
    S.sel = { layer: 'row', i: 0, j: 0, end: 'to', bi: 0 };
    S.editing = null;
    S.drag = null;
}

/* 自動存回這台電腦的瀏覽器，重新整理（含 Ctrl+Shift+R）不會把圖弄丟。
   只存在使用者自己的瀏覽器裡，沒有送到任何地方。 */
const LS_KEY = 'ghost.sequence.doc.v1';
let dirty = false, saveTimer = 0;

export function autoSave() {
    if (!dirty) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({
                v: 1, savedAt: Date.now(),
                parts: S.parts, rows: S.rows, blocks: S.blocks, legend: S.legend,
            }));
        } catch { /* 無痕模式或空間滿了就不存，編輯照常 */ }
    }, 400);
}

export function loadSaved() {
    try {
        const d = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
        if (!d || !Array.isArray(d.parts) || !Array.isArray(d.rows) || !d.parts.length) return null;
        d.rows.forEach((r) => { if (!r.tone) r.tone = 'solid'; });
        return { parts: d.parts, rows: d.rows, blocks: d.blocks || [], legend: d.legend };
    } catch { return null; }
}

/* 復原。每次動資料之前呼叫 push()，存的是改動前的樣子。 */
const undoStack = [], redoStack = [];
const snap = () => JSON.stringify({ p: S.parts, r: S.rows, b: S.blocks, l: S.legend });

export function push() {
    dirty = true;
    undoStack.push(snap());
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
}
function restore(str) {
    dirty = true;
    const o = JSON.parse(str);
    S.parts = o.p; S.rows = o.r; S.blocks = o.b; S.legend = o.l;
    S.sel.i = Math.min(S.sel.i, Math.max(0, S.rows.length - 1));
    S.sel.j = S.sel.i;
    if (S.sel.layer === 'part') S.sel.i = Math.min(S.sel.i, S.parts.length - 1);
}
export function undo(after) {
    if (!undoStack.length) return;
    redoStack.push(snap()); restore(undoStack.pop()); after();
}
export function redo(after) {
    if (!redoStack.length) return;
    undoStack.push(snap()); restore(redoStack.pop()); after();
}

/* 共用小工具 */
export const pIdx = (id) => S.parts.findIndex((p) => p.id === id);
export const nameOf = (id) => (S.parts.find((p) => p.id === id) || { name: '?' }).name;
export const clampPart = (i) => Math.max(0, Math.min(S.parts.length - 1, i));
export const px = (i) => PAD_X + i * COL_W;
export const pxOf = (id) => px(Math.max(0, pIdx(id)));

export function selRange() {
    if (!S.rows.length) return [0, -1];
    return [Math.min(S.sel.i, S.sel.j), Math.max(S.sel.i, S.sel.j)];
}
export function blocksAt(i) {
    return S.blocks.map((b, bi) => ({ b, bi }))
        .filter((o) => o.b.from <= i && o.b.to >= i)
        .sort((p, q) => (p.b.to - p.b.from) - (q.b.to - q.b.from));
}
export function laneOfRow(i) {
    const r = S.rows[i];
    if (!r) return 0;
    if (r.kind === 'note') return Math.max(0, pIdx(r.at));
    if (r.kind === 'msg') return Math.max(0, pIdx(r.from));
    return 0;
}
export function shiftBlocks(at, d) {
    S.blocks.forEach((b) => { if (b.from >= at) b.from += d; if (b.to >= at) b.to += d; });
    S.blocks = S.blocks.filter((b) => b.to >= b.from && b.from >= 0);
}
