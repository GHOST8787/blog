// 鍵盤分派與滑鼠操作。方向鍵做什麼看 S.sel.layer，跟狀態列寫的一致。

import {
    S, push, undo, redo, px, pIdx, clampPart, blocksAt, laneOfRow,
} from './state.js';
import { render, sv, rowY, setSkipScroll } from './render.js';
import {
    editRow, editPart, editBlock, editLegend, editCurrent, closeEd,
    addRow, addPart, delSel, wrapBlock, unwrapBlock,
    moveEnd, moveRow, movePart, cycleType, cycleTone, cycleBlockKind, togglePartKind,
} from './edit.js';

const mmBox = document.getElementById('mm');

export function initKeys() {
    // 捲動只服務鍵盤：滑鼠按下先關掉，下一次敲鍵盤再打開
    document.addEventListener('pointerdown', () => setSkipScroll(true), true);
    document.addEventListener('keydown', () => setSkipScroll(false), true);
    document.addEventListener('keydown', onKey);
    sv.addEventListener('mousedown', onDown);
    sv.addEventListener('click', onClick);
    sv.addEventListener('dblclick', onDbl);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

/* ── 鍵盤 ───────────────────────────────── */
function onKey(e) {
    if (S.editing) return;
    if (e.target === mmBox || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const k = e.key, L = S.sel.layer;
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? redo(render) : undo(render); return; }

    /* 跨層 */
    if (ctrl && (k === 'ArrowLeft' || k === 'ArrowRight') && L !== 'part') {
        const r = S.rows[S.sel.i];
        if (r && r.kind === 'msg') {
            e.preventDefault();
            S.sel = { ...S.sel, layer: 'point', end: k === 'ArrowLeft' ? 'from' : 'to' };
            render();
            return;
        }
    }
    if (ctrl && k === 'ArrowUp') {
        e.preventDefault();
        if (L === 'row' || L === 'point') {
            const at = blocksAt(S.sel.i);
            S.sel = at.length ? { ...S.sel, layer: 'block', bi: at[0].bi }
                              : { ...S.sel, layer: 'part', i: laneOfRow(S.sel.i) };
        } else if (L === 'block') {
            const cur = S.blocks[S.sel.bi];
            const outer = blocksAt(cur.from).find((o) => o.b.to - o.b.from > cur.to - cur.from);
            S.sel = outer ? { ...S.sel, layer: 'block', bi: outer.bi }
                          : { ...S.sel, layer: 'part', i: laneOfRow(cur.from) };
        }
        render();
        return;
    }
    if ((ctrl && k === 'ArrowDown') || k === 'Escape') {
        e.preventDefault();
        if (L !== 'row') S.sel = { ...S.sel, layer: 'row', i: Math.min(S.sel.i, S.rows.length - 1) };
        S.sel.j = S.sel.i;
        render();
        return;
    }

    /* 參與者層 */
    if (L === 'part') {
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
            e.preventDefault();
            const d = k === 'ArrowLeft' ? -1 : 1;
            if (e.altKey) movePart(d); else S.sel.i = clampPart(S.sel.i + d);
            render();
            return;
        }
        if (k === 'Tab') { e.preventDefault(); togglePartKind(); render(); return; }
        if (k === 'Enter') { e.preventDefault(); editPart(S.sel.i); return; }
        if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); delSel(); render(); return; }
        if (k === 'ArrowUp') { e.preventDefault(); return; }          // 已經在最上面，停住
        if (k === 'ArrowDown') {
            e.preventDefault();
            S.sel = { ...S.sel, layer: 'row', i: 0, j: 0 };
            render();
            return;
        }
    }

    /* 區塊層 */
    if (L === 'block') {
        const b = S.blocks[S.sel.bi];
        if (!b) { S.sel.layer = 'row'; render(); return; }
        if (k === 'ArrowUp' || k === 'ArrowDown') {
            e.preventDefault();
            const d = k === 'ArrowUp' ? -1 : 1;
            if (e.shiftKey) { push(); b.to = Math.max(b.from, Math.min(S.rows.length - 1, b.to + d)); }
            else if (e.altKey) {
                const nf = b.from + d, nt = b.to + d;
                if (nf >= 0 && nt < S.rows.length) {
                    push();
                    const cut = S.rows.splice(b.from, b.to - b.from + 1);
                    S.rows.splice(nf, 0, ...cut);
                    b.from = nf; b.to = nt;
                }
            } else {
                const at = blocksAt(b.from);
                const pos = at.findIndex((o) => o.bi === S.sel.bi);
                const nx = at[pos + (k === 'ArrowUp' ? 1 : -1)];
                if (nx) S.sel.bi = nx.bi;
            }
            render();
            return;
        }
        if (k === 'Tab') { e.preventDefault(); cycleBlockKind(); render(); return; }
        if (k === 'Enter') { e.preventDefault(); editBlock(S.sel.bi); return; }
        if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); delSel(); render(); return; }
    }

    /* 端點層 */
    if (L === 'point') {
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
            e.preventDefault(); moveEnd(S.sel.end, k === 'ArrowLeft' ? -1 : 1); render(); return;
        }
        if (k === 'ArrowUp' || k === 'ArrowDown') {
            e.preventDefault();
            // ↑↓ 就是換上下一列，順手退回列層，不用再按一次 Esc
            const d = k === 'ArrowUp' ? -1 : 1;
            const i = Math.max(0, Math.min(S.rows.length - 1, S.sel.i + d));
            S.sel = { ...S.sel, layer: 'row', i, j: i };
            render();
            return;
        }
        if (k === 'Tab') { e.preventDefault(); S.sel.end = S.sel.end === 'from' ? 'to' : 'from'; render(); return; }
        if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); delSel(); render(); return; }
        if (k === 'Enter') { e.preventDefault(); editRow(S.sel.i); return; }
    }

    /* 列層 */
    if (L === 'row') {
        switch (k) {
            case 'ArrowUp': case 'ArrowDown': {
                e.preventDefault();
                const d = k === 'ArrowUp' ? -1 : 1;
                if (d < 0 && S.sel.i === 0 && !e.altKey && !e.shiftKey) {
                    S.sel = { ...S.sel, layer: 'part', i: laneOfRow(0) };   // 到頂再往上＝上到標題列
                    render();
                    return;
                }
                if (e.altKey) moveRow(d);
                else {
                    S.sel.i = Math.max(0, Math.min(S.rows.length - 1, S.sel.i + d));
                    if (!e.shiftKey) S.sel.j = S.sel.i;
                }
                render();
                return;
            }
            case 'ArrowLeft': case 'ArrowRight':
                e.preventDefault();
                moveEnd(e.shiftKey ? 'from' : 'to', k === 'ArrowLeft' ? -1 : 1);
                S.sel.j = S.sel.i;
                render();
                return;
            case 'Tab':
                e.preventDefault();
                e.shiftKey ? cycleTone() : cycleType();
                render();
                return;
            case 'Enter':
                e.preventDefault();
                if (ctrl) wrapBlock();
                else if (!S.rows.length) { addRow('msg'); render(); editRow(S.sel.i); }
                else editRow(S.sel.i);
                return;
            case 'Backspace': case 'Delete':
                e.preventDefault();
                if (ctrl) unwrapBlock(); else delSel();
                render();
                return;
        }
    }

    /* 新增：一律 Alt 組合，單鍵留給打字 */
    if (e.altKey && !ctrl) {
        const key = k.toLowerCase();
        if (key === 'm') { e.preventDefault(); addRow('msg'); render(); editRow(S.sel.i); return; }
        if (key === 'n') { e.preventDefault(); addRow('note'); render(); editRow(S.sel.i); return; }
        if (key === 's') { e.preventDefault(); addRow('phase'); render(); editRow(S.sel.i); return; }
        if (key === 'p') { e.preventDefault(); addPart(); render(); editPart(S.sel.i); return; }
    }
    if (k === '?' && !ctrl) {
        e.preventDefault();
        document.getElementById('help').classList.toggle('pinned');
        return;
    }

    /* 直接打字＝進編輯，內容整段反白，跟雙擊一樣 */
    if (!ctrl && !e.altKey && !e.metaKey && k.length === 1) {
        e.preventDefault();
        editCurrent();
    }
}

/* ── 滑鼠 ───────────────────────────────── */
const svPos = (e) => {
    const r = sv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
};
function nearestLane(x) {
    let best = 0, bd = Infinity;
    S.parts.forEach((p, i) => { const d = Math.abs(px(i) - x); if (d < bd) { bd = d; best = i; } });
    return best;
}

function onDown(e) {
    const pt = e.target.closest('[data-pt]');
    if (pt) {
        e.preventDefault();
        const i = +pt.dataset.pt, end = pt.dataset.end;
        push();
        S.sel = { ...S.sel, layer: 'point', i, j: i, end };
        S.drag = { kind: 'point', i, end, lane: null };
        render();
        return;
    }
    const part = e.target.closest('[data-part]');
    if (part) {
        e.preventDefault();
        const i = +part.dataset.part;
        push();
        S.sel = { ...S.sel, layer: 'part', i };
        S.drag = { kind: 'part', i, lane: null };
        render();
        return;
    }
    const row = e.target.closest('[data-row]');
    if (row && !e.shiftKey) {
        const i = +row.dataset.row;
        if (S.rows[i] && S.rows[i].kind === 'note') {
            e.preventDefault();
            push();
            S.sel = { ...S.sel, layer: 'row', i, j: i };
            S.drag = { kind: 'note', i, lane: null };
            render();
        }
    }
}

function onClick(e) {
    if (S.drag) return;
    const lg = e.target.closest('[data-legend]');
    if (lg) {
        const k = +lg.dataset.legend;
        const r = lg.getBoundingClientRect(), s = sv.getBoundingClientRect();
        editLegend(k, r.left - s.left, r.top - s.top - 12);
        return;
    }
    const blk = e.target.closest('[data-block]');
    if (blk) { S.sel = { ...S.sel, layer: 'block', bi: +blk.dataset.block }; closeEd(); render(); return; }
    if (e.target.closest('[data-part]') || e.target.closest('[data-pt]')) return;
    const row = e.target.closest('[data-row]');
    if (row) {
        const i = +row.dataset.row;
        const L = S.sel.layer;
        if (e.shiftKey && (L === 'row' || L === 'point')) S.sel = { ...S.sel, layer: 'row', i };
        else S.sel = { ...S.sel, layer: 'row', i, j: i };
        closeEd();
        render();
    }
}

function onDbl(e) {
    const blk = e.target.closest('[data-block]');
    if (blk) { S.sel = { ...S.sel, layer: 'block', bi: +blk.dataset.block }; render(); editBlock(S.sel.bi); return; }
    const part = e.target.closest('[data-part]');
    if (part) { S.sel = { ...S.sel, layer: 'part', i: +part.dataset.part }; render(); editPart(S.sel.i); return; }
    const row = e.target.closest('[data-row]');
    if (row) {
        const i = +row.dataset.row;
        S.sel = { ...S.sel, layer: 'row', i, j: i };
        render();
        editRow(i);
    }
}

function onMove(e) {
    if (!S.drag) return;
    const { x, y } = svPos(e);
    const lane = nearestLane(x);
    const d = S.drag;
    if (d.kind === 'point') {
        const r = S.rows[d.i];
        if (!r) return;
        if (S.parts[lane]) r[d.end] = S.parts[lane].id;
        d.lane = lane;
    } else if (d.kind === 'note') {
        const r = S.rows[d.i];
        if (!r) return;
        r.at = S.parts[lane].id;
        d.lane = lane;
        const tgt = S.rows.findIndex((_, n) => rowY(n) > y);
        const to = tgt === -1 ? S.rows.length - 1 : Math.max(0, tgt - 1);
        if (to !== d.i) {
            const [cut] = S.rows.splice(d.i, 1);
            S.rows.splice(to, 0, cut);
            d.i = to; S.sel.i = to; S.sel.j = to;
        }
    } else if (d.kind === 'part') {
        if (lane !== d.i) {
            [S.parts[d.i], S.parts[lane]] = [S.parts[lane], S.parts[d.i]];
            d.i = lane; S.sel.i = lane;
        }
        d.lane = lane;
    }
    render();
}

function onUp() {
    if (!S.drag) return;
    S.drag = null;
    render();
}
