// 改資料的動作，外加那一個浮在畫布上的編輯框。每個會動到資料的函式都先 push() 存復原點。

import {
    S, T, nid, push, TYPES, BLOCK_KINDS,
    HEAD_Y, SELF_W, px, pxOf, pIdx, clampPart, selRange, blocksAt, shiftBlocks,
} from './state.js';
import { render, rowY, BTOP, DOC_W, sv, stage } from './render.js';

const ed = document.getElementById('ed');

/* ── 編輯框 ─────────────────────────────── */
function openEd(what, i, x, y, val, w) {
    S.editing = { what, i };
    const a = sv.getBoundingClientRect(), c = stage.getBoundingClientRect();
    ed.style.display = 'block';
    ed.style.left = (x + (a.left - c.left)) + 'px';
    ed.style.top = (y + 8 + (a.top - c.top)) + 'px';
    ed.style.width = (w || 220) + 'px';
    ed.value = val;
    ed.focus();
    ed.select();
}
export function editRow(i) {
    const r = S.rows[i];
    if (!r) return;
    const x = r.kind === 'phase' ? DOC_W / 2 - 110
        : r.kind === 'note' ? pxOf(r.at) + 22
            : r.from === r.to ? pxOf(r.from) + 46
                : (pxOf(r.from) + pxOf(r.to)) / 2 - 110;
    openEd('row', i, Math.max(6, x), rowY(i) - 32, r.text, 230);
}
export function editPart(i) { openEd('part', i, px(i) - 78, HEAD_Y + 6, S.parts[i].name, 156); }
export function editBlock(i) {
    const b = S.blocks[i];
    if (!b) return;
    const r = S.rows[b.from];
    const x = r ? pxOf(r.kind === 'note' ? r.at : (r.kind === 'phase' ? S.parts[0].id : r.from)) : 60;
    openEd('block', i, Math.max(6, x + 40), (BTOP.get(b.id) ?? rowY(b.from) - 36) - 4, b.label, 190);
}
export function editLegend(i, x, y) { openEd('legend', i, x, y, S.legend[i].text, 280); }

export function editCurrent() {
    const L = S.sel.layer;
    if (L === 'part') editPart(S.sel.i);
    else if (L === 'block') editBlock(S.sel.bi);
    else if (S.rows.length) editRow(S.sel.i);
}

export function commitEd(addNext) {
    if (!S.editing) return;
    const { what, i } = S.editing, v = ed.value.trim();
    const cur = what === 'row' ? (S.rows[i] || {}).text
        : what === 'part' ? (S.parts[i] || {}).name
            : what === 'block' ? (S.blocks[i] || {}).label
                : (S.legend[i] || {}).text;
    if (v !== cur) push();
    if (what === 'row' && S.rows[i]) S.rows[i].text = v || T.msg.unnamed;
    if (what === 'part' && S.parts[i]) S.parts[i].name = v || T.msg.unnamed;
    if (what === 'block' && S.blocks[i]) S.blocks[i].label = v;
    if (what === 'legend' && S.legend[i]) S.legend[i].text = v;
    closeEd();
    if (addNext && what === 'row') { addRow('msg'); render(); editRow(S.sel.i); return; }
    render();
}
export function closeEd() {
    if (!S.editing) return;
    S.editing = null;
    ed.style.display = 'none';
    ed.blur();           // 不放掉焦點的話，隱藏的 input 會繼續吃掉所有快捷鍵
}
ed.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEd(e.shiftKey); }
    else if (e.key === 'Escape') { e.preventDefault(); closeEd(); render(); }
    e.stopPropagation();
});
ed.addEventListener('blur', () => { if (S.editing) commitEd(false); });

/* ── 新增 ───────────────────────────────── */
export function addRow(kind) {
    push();
    const cur = S.rows[S.sel.i];
    /* Note 是在說明接下來這一步，插在選取那一列的上方；訊息與階段帶往下長 */
    const at = !S.rows.length ? 0 : (kind === 'note' ? S.sel.i : S.sel.i + 1);
    let r;
    if (kind === 'phase') r = { id: nid('r'), kind: 'phase', tone: 'solid', text: T.msg.newPhase };
    else if (kind === 'note') {
        r = { id: nid('r'), kind: 'note', tone: 'solid', text: T.msg.newNote,
              at: cur && cur.kind === 'msg' ? cur.to : S.parts[0].id };
    } else {
        const from = cur && cur.kind === 'msg' ? cur.to : S.parts[0].id;
        const to = S.parts[(pIdx(from) + 1) % S.parts.length].id;
        r = { id: nid('r'), kind: 'msg', from, to, type: 'sync', tone: 'solid', text: T.msg.newRow };
    }
    S.rows.splice(at, 0, r);
    shiftBlocks(at, 1);
    S.sel = { ...S.sel, layer: 'row', i: at, j: at };
}

export function addPart() {
    push();
    const i = S.sel.layer === 'part' ? S.sel.i + 1 : S.parts.length;
    let n = S.parts.length, id;
    do { id = String.fromCharCode(65 + (n % 26)) + (n > 25 ? n : ''); n++; } while (S.parts.some((p) => p.id === id));
    S.parts.splice(i, 0, { id, name: T.msg.newPart, kind: 'object' });
    S.sel = { ...S.sel, layer: 'part', i };
}

/* ── 刪除 ───────────────────────────────── */
export function delSel() {
    const L = S.sel.layer;
    if (L === 'part') {
        if (S.parts.length <= 2) return;
        push();
        /* 刪一欄不等於刪內容：指到它的端點改接左鄰（沒有左鄰就右鄰），列全部留著 */
        const i = S.sel.i, id = S.parts[i].id;
        const fallback = (S.parts[i - 1] || S.parts[i + 1]).id;
        S.parts.splice(i, 1);
        S.rows.forEach((r) => {
            if (r.kind === 'note') { if (r.at === id) r.at = fallback; }
            else if (r.kind === 'msg') {
                if (r.from === id) r.from = fallback;
                if (r.to === id) r.to = fallback;
            }
        });
        S.sel.i = Math.min(i, S.parts.length - 1);
        return;
    }
    if (L === 'block') { push(); S.blocks.splice(S.sel.bi, 1); S.sel.layer = 'row'; return; }
    const [a, b] = selRange();
    if (b < a) return;
    push();
    S.rows.splice(a, b - a + 1);
    shiftBlocks(a, -(b - a + 1));
    S.sel.i = Math.max(0, Math.min(a, S.rows.length - 1));
    S.sel.j = S.sel.i;
}

/* ── 區塊 ───────────────────────────────── */
export function wrapBlock() {
    const [a, b] = selRange();
    if (b < a) return;
    push();
    const blk = { id: nid('b'), kind: 'loop', label: T.msg.blockLabel, from: a, to: b };
    S.blocks.push(blk);
    S.sel = { ...S.sel, layer: 'block', bi: S.blocks.length - 1 };
    render();
    editBlock(S.blocks.indexOf(blk));
}
export function unwrapBlock() {
    const at = blocksAt(S.sel.i);
    if (at.length) { push(); S.blocks.splice(at[0].bi, 1); }
}

/* ── 搬動與切換 ─────────────────────────── */
export function moveEnd(which, d) {
    const r = S.rows[S.sel.i];
    if (!r || r.kind === 'phase') return;
    push();
    if (r.kind === 'note') { r.at = S.parts[clampPart(pIdx(r.at) + d)].id; return; }
    r[which] = S.parts[clampPart(pIdx(r[which]) + d)].id;   // 經過另一端＝自呼叫，不跳過
}
export function moveRow(d) {
    const [a, b] = selRange();
    const j = d < 0 ? a - 1 : b + 1;
    if (j < 0 || j >= S.rows.length) return;
    push();
    const cut = S.rows.splice(a, b - a + 1);
    S.rows.splice(d < 0 ? a - 1 : a + 1, 0, ...cut);
    S.sel.i += d; S.sel.j += d;
}
export function movePart(d) {
    const i = S.sel.i, j = i + d;
    if (j < 0 || j >= S.parts.length) return;
    push();
    [S.parts[i], S.parts[j]] = [S.parts[j], S.parts[i]];
    S.sel.i = j;
}
export function cycleType() {
    const r = S.rows[S.sel.i];
    if (!r || r.kind !== 'msg' || r.from === r.to) return;
    push();
    r.type = TYPES[(TYPES.indexOf(r.type) + 1) % TYPES.length];
}
export function cycleTone() {
    const r = S.rows[S.sel.i];
    if (!r) return;
    push();
    r.tone = r.tone === 'dash' ? 'solid' : 'dash';
}
export function cycleBlockKind() {
    const b = S.blocks[S.sel.bi];
    if (!b) return;
    push();
    b.kind = BLOCK_KINDS[(BLOCK_KINDS.indexOf(b.kind) + 1) % BLOCK_KINDS.length];
}
export function togglePartKind() {
    const p = S.parts[S.sel.i];
    if (!p) return;
    push();
    p.kind = p.kind === 'actor' ? 'object' : 'actor';
}
