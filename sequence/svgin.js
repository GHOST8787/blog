// 把一張時序圖 SVG 讀回成可編輯的資料。
//
// 兩條路：
//   1. 這個工具自己匯出的 SVG —— 資料原封不動嵌在 <metadata> 裡，直接拿回來。
//   2. 別處產的 SVG（例如 Claude 畫的那種）—— 照圖形特徵反推，規則都寫在下面。
//      認得出來的進圖裡，認不出來的一個一個列進報告，不要默默吞掉。
//
// 反推規則（不綁死任何座標，全部看相對關係）：
//   lifeline  垂直線（x1≈x2）且夠長
//   參與者    lifeline 頂端上方、中心對齊那條線的方框，名字取框內的文字
//   訊息      水平線（y1≈y2），兩端各自吸附到最近的 lifeline，虛線＝dash
//   自呼叫    從某條 lifeline 出發、寬度很小又繞回同一條的 path
//   階段帶    橫跨大半張圖寬度的方框，文字置中
//   Note      帶折角的方框（右上角被切掉）
//
import { nid } from './state.js';

const num = (el, a) => parseFloat(el.getAttribute(a) || '0');
const near = (a, b, t) => Math.abs(a - b) <= t;

export function parseSVG(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const bad = doc.querySelector('parsererror');
    if (bad) throw { msg: 'svgBadXml', detail: [bad.textContent.replace(/\s+/g, ' ').slice(0, 140)] };
    const svg = doc.documentElement;
    if (!svg || svg.tagName.toLowerCase() !== 'svg') throw { msg: 'svgNotSvg', detail: [] };

    /* 1. 自己匯出的，資料直接在裡面 */
    const meta = svg.querySelector('metadata[data-format="ghost.ouo/sequence"]');
    if (meta) {
        try {
            const d = JSON.parse(meta.textContent);
            if (Array.isArray(d.parts) && Array.isArray(d.rows)) {
                return { diagram: normalize(d), report: { native: true } };
            }
        } catch { /* 嵌的資料壞了就當一般 SVG 處理 */ }
    }

    /* 2. 反推 */
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    const W = vb.length === 4 ? vb[2] : num(svg, 'width') || 800;
    const H = vb.length === 4 ? vb[3] : num(svg, 'height') || 600;

    const lines = [...svg.querySelectorAll('line')];
    const paths = [...svg.querySelectorAll('path')];
    const rects = [...svg.querySelectorAll('rect')];
    const texts = [...svg.querySelectorAll('text')].map((t) => ({
        el: t, x: num(t, 'x'), y: num(t, 'y'),
        anchor: t.getAttribute('text-anchor') || 'start',
        s: (t.textContent || '').replace(/\s+/g, ' ').trim(),
    })).filter((t) => t.s);

    const used = new Set();
    const unknown = [];

    /* ── lifeline ── */
    const vertical = lines.filter((l) => near(num(l, 'x1'), num(l, 'x2'), 2) &&
        Math.abs(num(l, 'y2') - num(l, 'y1')) > H * 0.2);
    if (vertical.length < 2) {
        throw { msg: 'svgNoLifelines', detail: [`垂直長線只找到 ${vertical.length} 條`] };
    }
    vertical.forEach((l) => used.add(l));
    const laneX = [...new Set(vertical.map((l) => Math.round(num(l, 'x1'))))].sort((a, b) => a - b);
    const laneTop = Math.min(...vertical.map((l) => Math.min(num(l, 'y1'), num(l, 'y2'))));
    const laneBottom = Math.max(...vertical.map((l) => Math.max(num(l, 'y1'), num(l, 'y2'))));
    const laneOf = (x) => {
        let best = 0, bd = Infinity;
        laneX.forEach((lx, i) => { const d = Math.abs(lx - x); if (d < bd) { bd = d; best = i; } });
        return bd <= 40 ? best : -1;
    };

    /* ── 底部圖例：lifeline 畫完以後的那一區，文字連同左邊的樣本線一起收進 legend ── */
    const legend = [];
    texts.filter((t) => !t.taken && t.y > laneBottom + 10).forEach((t) => {
        t.taken = true;
        const cands = lines.filter((l) => !used.has(l) &&
            near(num(l, 'y1'), t.y, 14) && near(num(l, 'y1'), num(l, 'y2'), 3) &&
            Math.max(num(l, 'x1'), num(l, 'x2')) <= t.x + 12);
        // 同一條水平線上可能並排好幾個樣本，取最靠近這段文字左邊的那一條
        cands.sort((a, b) => Math.max(num(b, 'x1'), num(b, 'x2')) - Math.max(num(a, 'x1'), num(a, 'x2')));
        const sample = cands[0];
        if (sample) used.add(sample);
        // 旁邊沒有線條樣本的就是純註腳，標成 text，畫的時候不配線
        const tone = sample ? (sample.getAttribute('stroke-dasharray') ? 'dash' : 'solid') : 'text';
        legend.push({ tone, text: t.s });
    });

    /* ── 參與者：lifeline 頂端以上、中心對齊的方框 ── */
    const parts = laneX.map((x, i) => {
        const box = rects.find((r) => !used.has(r) &&
            near(num(r, 'x') + num(r, 'width') / 2, x, 24) &&
            num(r, 'y') + num(r, 'height') <= laneTop + 8 && num(r, 'width') < W * 0.5);
        if (box) used.add(box);
        const label = texts.find((t) => !t.taken && near(t.x, x, 60) && t.y <= laneTop + 10);
        if (label) label.taken = true;
        return { id: String.fromCharCode(65 + i), name: label ? label.s : `參與者 ${i + 1}`, kind: 'object' };
    });

    /* ── 訊息：水平線 ── */
    const rows = [];
    lines.forEach((l) => {
        if (used.has(l)) return;
        const x1 = num(l, 'x1'), x2 = num(l, 'x2'), y1 = num(l, 'y1'), y2 = num(l, 'y2');
        if (!near(y1, y2, 3) || Math.abs(x2 - x1) < 20) {
            unknown.push({ what: 'line', why: '既不是 lifeline 也不是水平訊息', at: `(${Math.round(x1)},${Math.round(y1)})→(${Math.round(x2)},${Math.round(y2)})` });
            return;
        }
        const a = laneOf(x1), b = laneOf(x2);
        if (a < 0 || b < 0) {
            unknown.push({ what: 'line', why: '兩端對不到任何 lifeline', at: `y=${Math.round(y1)}` });
            return;
        }
        used.add(l);
        const dash = !!l.getAttribute('stroke-dasharray');
        rows.push({ y: y1, r: {
            id: nid('r'), kind: 'msg', from: parts[a].id, to: parts[b].id,
            type: dash ? 'return' : 'sync', tone: dash ? 'dash' : 'solid',
            text: pickText(texts, Math.min(x1, x2), Math.max(x1, x2), y1),
        } });
    });

    /* ── 自呼叫與 Note：看 path 的形狀 ── */
    paths.forEach((p) => {
        if (used.has(p) || p.closest('marker') || p.closest('defs')) return;
        const d = (p.getAttribute('d') || '').trim();
        const m = d.match(/^M\s*([\d.]+)[, ]\s*([\d.]+)\s*h\s*(-?[\d.]+)/i);
        if (m && /[vV]/.test(d) && Math.abs(parseFloat(m[3])) < 90) {
            const x = parseFloat(m[1]), y = parseFloat(m[2]), dir = parseFloat(m[3]) > 0 ? 1 : -1;
            const lane = laneOf(x);
            if (lane >= 0) {
                used.add(p);
                const t = texts.find((t) => !t.taken && near(t.y, y + 12, 22) &&
                    (dir > 0 ? t.x > x : t.x < x) && Math.abs(t.x - x) < 320);
                if (t) t.taken = true;
                rows.push({ y: y + 8, r: {
                    id: nid('r'), kind: 'msg', from: parts[lane].id, to: parts[lane].id,
                    type: 'self', tone: p.getAttribute('stroke-dasharray') ? 'dash' : 'solid',
                    text: t ? t.s : '（未命名）',
                } });
                return;
            }
        }
        if (/l\s*1[01][, ]\s*1[01]/.test(d)) {       // 右上角折角＝Note
            const mm = d.match(/^M\s*([\d.]+)[, ]\s*([\d.]+)/i);
            if (mm) {
                const x = parseFloat(mm[1]), y = parseFloat(mm[2]);
                const lane = laneOf(x - 16);
                if (lane >= 0) {
                    used.add(p);
                    const t = texts.find((t) => !t.taken && near(t.y, y + 22, 26) && t.x >= x - 4);
                    if (t) t.taken = true;
                    rows.push({ y: y + 15, r: { id: nid('r'), kind: 'note', at: parts[lane].id,
                        tone: 'solid', text: t ? t.s : '（未命名）' } });
                    return;
                }
            }
        }
        unknown.push({ what: 'path', why: '形狀不是自呼叫也不是 Note', at: d.slice(0, 46) });
    });

    /* ── 階段帶：橫跨大半張圖的方框 ── */
    rects.forEach((r) => {
        if (used.has(r) || r.closest('mask') || r.closest('defs')) return;
        const w = num(r, 'width'), h = num(r, 'height'), x = num(r, 'x'), y = num(r, 'y');
        if (w >= W * 0.96 && h >= H * 0.96) { used.add(r); return; }      // 背景
        if (w >= W * 0.55 && h <= 60) {
            used.add(r);
            const t = texts.find((t) => !t.taken && t.y >= y && t.y <= y + h + 4);
            if (t) t.taken = true;
            rows.push({ y: y + 6, r: { id: nid('r'), kind: 'phase', tone: 'solid', text: t ? t.s : '（未命名）' } });
            return;
        }
        unknown.push({ what: 'rect', why: '不是參與者框、階段帶、也不是背景', at: `${Math.round(w)}×${Math.round(h)} @(${Math.round(x)},${Math.round(y)})` });
    });

    rows.sort((a, b) => a.y - b.y);
    const out = rows.map((o) => o.r);
    if (!out.length) throw { msg: 'svgNoRows', detail: [`找到 ${laneX.length} 條 lifeline，但一條訊息都認不出來`] };

    const leftovers = texts.filter((t) => !t.taken).map((t) => t.s);

    return {
        diagram: { parts, rows: out, blocks: [], legend: legend.length ? legend : undefined },
        report: {
            native: false,
            lifelines: laneX.length,
            parts: parts.length,
            msgs: out.filter((r) => r.kind === 'msg' && r.from !== r.to).length,
            selfs: out.filter((r) => r.kind === 'msg' && r.from === r.to).length,
            notes: out.filter((r) => r.kind === 'note').length,
            phases: out.filter((r) => r.kind === 'phase').length,
            dashed: out.filter((r) => r.tone === 'dash').length,
            legend: legend.length,
            unknown,
            leftovers,
        },
    };
}

/* 訊息文字：在線段上方、水平落在兩端之間的那一個 */
function pickText(texts, xa, xb, y) {
    const mid = (xa + xb) / 2;
    const cands = texts.filter((t) => !t.taken && t.y <= y - 1 && t.y >= y - 26 &&
        t.x >= xa - 60 && t.x <= xb + 60);
    if (!cands.length) return '（未命名）';
    cands.sort((p, q) => (Math.abs(p.x - mid) + (y - p.y)) - (Math.abs(q.x - mid) + (y - q.y)));
    cands[0].taken = true;
    return cands[0].s;
}

function normalize(d) {
    d.rows.forEach((r) => {
        delete r.dy;
        if (!r.tone) r.tone = 'solid';
    });
    return { parts: d.parts, rows: d.rows, blocks: Array.isArray(d.blocks) ? d.blocks : [],
             legend: Array.isArray(d.legend) ? d.legend : undefined };
}
