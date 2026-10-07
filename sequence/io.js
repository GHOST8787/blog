// 進出：Mermaid 雙向轉換、存成 .json 下載、讀回本機 .json、匯出 PNG。
// 這一支不負責重畫，呼叫端拿到資料自己 render，所以不 import render.js。

import { S, T, nid } from './state.js';
import { parseSVG } from './svgin.js';

const ARROW = { sync: '->>', return: '-->>', async: '-)' };

export function toMermaid() {
    const L = ['sequenceDiagram'];
    S.parts.forEach((p) => L.push(`    ${p.kind === 'actor' ? 'actor' : 'participant'} ${p.id} as ${p.name}`));
    const open = [];
    for (let i = 0; i < S.rows.length; i++) {
        S.blocks.filter((b) => b.from === i).sort((a, b) => (b.to - b.from) - (a.to - a.from)).forEach((b) => {
            L.push(' '.repeat(4 + open.length * 4) + `${b.kind} ${b.label}`);
            open.push(b);
        });
        const ind = ' '.repeat(4 + open.length * 4);
        const r = S.rows[i];
        const tag = r.tone === 'dash' ? '※ ' : '';
        if (r.kind === 'phase') {
            L.push(`${ind}rect rgb(236,238,251)`);
            L.push(`${ind}    Note over ${S.parts[0].id},${S.parts[S.parts.length - 1].id}: ${r.text}`);
            L.push(`${ind}end`);
        } else if (r.kind === 'note') {
            L.push(`${ind}Note right of ${r.at}: ${tag}${r.text}`);
        } else {
            L.push(`${ind}${r.from}${ARROW[r.from === r.to ? 'sync' : r.type]}${r.to}: ${tag}${r.text}`);
        }
        while (open.length && open[open.length - 1].to === i) {
            open.pop();
            L.push(' '.repeat(4 + open.length * 4) + 'end');
        }
    }
    return L.join('\n');
}

export function fromMermaid(src) {
    const parts = [], rows = [], blocks = [], stack = [];
    const lines = src.split('\n');
    let started = false, pendingPhase = false;
    for (let n = 0; n < lines.length; n++) {
        const t = lines[n].trim();
        if (!t) continue;
        if (/^sequenceDiagram$/.test(t)) { started = true; continue; }
        if (!started) throw { line: n + 1, msg: T.msg.errFirst };
        let m;
        if ((m = t.match(/^(participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/))) {
            parts.push({ id: m[2], name: (m[3] || m[2]).trim(), kind: m[1] === 'actor' ? 'actor' : 'object' });
            continue;
        }
        if (/^rect\s/.test(t)) { pendingPhase = true; continue; }
        if ((m = t.match(/^Note\s+over\s+\S+\s*,\s*\S+\s*:\s*(.*)$/)) && pendingPhase) {
            rows.push({ id: nid('r'), kind: 'phase', tone: 'solid', text: m[1].trim() });
            pendingPhase = 'awaitEnd';   // 這一組的 end 歸階段帶，不是區塊的
            continue;
        }
        if ((m = t.match(/^(loop|alt|opt)\b\s*(.*)$/))) {
            stack.push({ id: nid('b'), kind: m[1], label: m[2].trim(), from: rows.length, to: rows.length });
            continue;
        }
        if (/^end$/.test(t)) {
            if (pendingPhase) { pendingPhase = false; continue; }
            const b = stack.pop();
            if (!b) throw { line: n + 1, msg: T.msg.errEnd };
            b.to = rows.length - 1;
            if (b.to >= b.from) blocks.push(b);
            continue;
        }
        if ((m = t.match(/^Note\s+(right of|left of|over)\s+(\S+)\s*:\s*(.*)$/))) {
            let txt = m[3].trim(), tone = 'solid';
            if (txt.startsWith('※')) { tone = 'dash'; txt = txt.slice(1).trim(); }
            rows.push({ id: nid('r'), kind: 'note', at: m[2], text: txt, tone });
            continue;
        }
        if ((m = t.match(/^(\S+?)\s*(--?>>|-\)|--?>)\s*(\S+?)\s*:\s*(.*)$/))) {
            let txt = m[4].trim(), tone = 'solid';
            if (txt.startsWith('※')) { tone = 'dash'; txt = txt.slice(1).trim(); }
            const a = m[2];
            const type = a === '-)' ? 'async' : (a.startsWith('--') ? 'return' : 'sync');
            rows.push({ id: nid('r'), kind: 'msg', from: m[1], to: m[3], type, tone, text: txt });
            continue;
        }
        throw { line: n + 1, msg: T.msg.errUnknown(t.slice(0, 30)) };
    }
    if (stack.length) throw { line: lines.length, msg: T.msg.errNoEnd };
    if (!parts.length) throw { line: 1, msg: T.msg.errNoPart };
    const ids = new Set(parts.map((p) => p.id));
    rows.forEach((r, i) => {
        const bad = r.kind === 'note' ? !ids.has(r.at)
            : (r.kind === 'msg' && (!ids.has(r.from) || !ids.has(r.to)));
        if (bad) throw { line: i + 1, msg: T.msg.errOrphan };
    });
    return { parts, rows, blocks };
}

/* ── 存成 .json 下載到使用者自己的電腦。站上不留任何東西。 ── */
export function saveFile() {
    const data = {
        format: 'ghost.ouo/sequence',
        version: 1,
        savedAt: new Date().toISOString(),
        parts: S.parts,
        rows: S.rows,
        blocks: S.blocks,
        legend: S.legend,
    };
    download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `sequence-${stamp()}.json`);
}

function stamp() {
    const d = new Date();
    const p2 = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
}

/* 把整張圖存成 .svg。資料原封不動嵌在 <metadata>，所以這張圖讀得回來也編輯得了。 */
export function saveSVG() {
    const sv = document.getElementById('sv');
    const clone = sv.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // 畫布裡的文字寫的是 font-family:inherit，單獨開啟時沒有頁面可繼承，要在根節點給一份
    clone.setAttribute('font-family', "ui-monospace, 'JetBrains Mono', Menlo, Consolas, 'Noto Sans TC', sans-serif");
    const meta = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
    meta.setAttribute('data-format', 'ghost.ouo/sequence');
    meta.textContent = JSON.stringify({
        version: 1, parts: S.parts, rows: S.rows, blocks: S.blocks, legend: S.legend,
    });
    clone.insertBefore(meta, clone.firstChild);
    const head = '<?xml version="1.0" encoding="UTF-8"?>';
    const str = head + '\n' + new XMLSerializer().serializeToString(clone);
    download(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }), `sequence-${stamp()}.svg`);
}

/* 讀回本機檔案。.json 走自己的格式，.svg 交給 svgin.js 反推。
   讀壞了一律丟錯，呼叫端不覆蓋現有的圖。 */
export async function readFile(file) {
    const text = await file.text();
    const looksSvg = /\.svg$/i.test(file.name) || /^\s*(<\?xml|<svg)/i.test(text);
    if (looksSvg) {
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
        parts: o.parts,
        rows: o.rows,
        blocks: Array.isArray(o.blocks) ? o.blocks : [],
        legend: Array.isArray(o.legend) ? o.legend : undefined,
        report: { native: true },
    };
}

export function exportPNG() {
    const sv = document.getElementById('sv');
    const clone = sv.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
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
        c.toBlob((b) => download(b, 'sequence.png'));
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
}

function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
