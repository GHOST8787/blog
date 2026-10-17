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
const extraH = (r) => (textLines(padImg(r.kind === 'msg' ? shown(r) : r.text)).length - 1) * LINE_H;

/* PUML 的 Creole 文字格式（**粗** //斜// ""等寬"" __底線__ --刪除-- ~~波浪~~）與 <:名稱:> 表情符號。
   只在 PUML（時序圖或活動圖）時套用；Mermaid 沒有這套寫法，原文照畫。 */
const rich = () => S.type === 'act' || S.fmt === 'puml';
const EMOJI = {
    smile: '😄', grinning: '😀', joy: '😂', wink: '😉', heart: '❤️', thumbsup: '👍', '+1': '👍', thumbsdown: '👎', '-1': '👎',
    star: '⭐', fire: '🔥', warning: '⚠️', x: '❌', white_check_mark: '✅', heavy_check_mark: '✔️', question: '❓', exclamation: '❗',
    bulb: '💡', rocket: '🚀', umbrella: '☂️', sunny: '☀️', cloud: '☁️', zap: '⚡', snowflake: '❄️', coffee: '☕', computer: '💻',
    iphone: '📱', email: '📧', envelope: '✉️', lock: '🔒', unlock: '🔓', key: '🔑', bell: '🔔', hourglass: '⌛', alarm_clock: '⏰',
    calendar: '📅', memo: '📝', book: '📖', package: '📦', gear: '⚙️', wrench: '🔧', hammer: '🔨', bug: '🐛', tada: '🎉',
    eyes: '👀', wave: '👋', ok_hand: '👌', clap: '👏', pray: '🙏', cry: '😢', sob: '😭', angry: '😠', thinking: '🤔',
    sleeping: '😴', moneybag: '💰', chart_with_upwards_trend: '📈', house: '🏠', car: '🚗', airplane: '✈️', link: '🔗', mag: '🔍',
    file_folder: '📁', inbox_tray: '📥', outbox_tray: '📤', stop_sign: '🛑', no_entry: '⛔', recycle: '♻️', 100: '💯',
    arrow_right: '➡️', arrow_left: '⬅️', arrow_up: '⬆️', arrow_down: '⬇️', earth_asia: '🌏', globe_with_meridians: '🌐',
    cat: '🐱', dog: '🐶', fish: '🐟', apple: '🍎', pizza: '🍕', gift: '🎁', trophy: '🏆', lightning: '⚡', sparkles: '✨',
};
// 完整的名稱表放在 emoji.json（1913 個 GitHub 表情符號名稱，資料取自 emojibase-data 15.3.2，MIT 授權），
// 上面這幾十個常用的直接內建；第一次遇到不認得的名稱才載入完整表，載完重畫一次
let EMOJI_ALL = null, emojiLoading = false;
function loadEmoji() {
    if (emojiLoading) return;
    emojiLoading = true;
    fetch(new URL('./emoji.json', import.meta.url)).then((r) => r.json()).then((d) => { EMOJI_ALL = d; render(); }).catch(() => { EMOJI_ALL = {}; });
}
// <:1f600:> 是 Unicode 碼位；<:smile:> 是名稱，完整表裡也找不到的畫成 :名稱:
export const emojify = (s) => String(s).replace(/<:([0-9a-z_+-]+):>/gi, (m, k) => {
    if (/^[0-9a-f]{4,6}$/i.test(k) && !EMOJI[k]) return String.fromCodePoint(parseInt(k, 16));
    const key = k.toLowerCase();
    if (EMOJI[key]) return EMOJI[key];
    if (EMOJI_ALL) return EMOJI_ALL[key] || `:${k}:`;
    loadEmoji();
    return `:${k}:`;
});
const CREOLE = /(\*\*|\/\/|""|__|~~|--)(?=\S)(.+?)(?<=\S)\1/g;
// Creole 先換成對應的標籤，再跟 HTML 標籤（<b> <color:red> <back:yellow> <size:18>…）用同一套畫法
const CTAG = { '**': 'b', '//': 'i', '""': 'tt', __: 'u', '~~': 'w', '--': 's' };
const TAG_RE = /<(\/?)(b|i|u|s|strike|w|tt|color|back|size|font|sub|sup)\b(?::([^>]*)|\s+([^>]*))?>/gi;
// OpenIconic 圖示（<&name>）：223 個圖形放在 icons.json（open-iconic 1.1.1，MIT 授權），第一次用到才載入，載完重畫一次
let ICONS = null, iconLoading = false;
function loadIcons() {
    if (iconLoading) return;
    iconLoading = true;
    fetch(new URL('./icons.json', import.meta.url)).then((r) => r.json()).then((d) => { ICONS = d; render(); }).catch(() => { ICONS = {}; });
}
// 圖示與圖片在文字裡先換成私用區記號，畫字時留空白，字畫好之後再把圖疊上去（placeGlyphs）
const GLYPH_RE = /\uE002([^\uE003]*)\uE003|\uE004([^\uE005]*)\uE005/g;
const IMG_SZ = new Map();
const scaleOf = (rest) => { const m = String(rest || '').match(/scale\s*=\s*([\d.]+)/i); return m ? +m[1] || 1 : 1; };
function imgSize(mark) {
    const [u, sc] = String(mark).split('\uE006');
    if (!IMG_SZ.has(u)) {
        IMG_SZ.set(u, null);
        const im = new Image();
        im.onload = () => { IMG_SZ.set(u, { w: im.naturalWidth, h: im.naturalHeight }); render(); };
        im.src = u;
    }
    const z = IMG_SZ.get(u), k = +sc || 1;
    return z ? { u, w: z.w * k, h: z.h * k } : { u, w: 0, h: 0 };
}
// 有圖片的那一行，上面先墊幾行空行，讓行高、框高照圖片高度長（只用在畫圖與量版面，不動原文）
export function padImg(v) {
    const s = String(v == null ? '' : v);
    if (!rich() || !/<img/i.test(s)) return s;
    return s.split('\n').map((line) => {
        let h = 0;
        line.replace(/<img(?::|\s+src\s*=\s*"?)([^>"{\s]+)([^>]*)>/gi, (m, u, rest) => { h = Math.max(h, imgSize(`${u}\uE006${scaleOf(rest)}`).h); return m; });
        const n = h ? Math.max(0, Math.ceil((h - 4) / 15) - 1) : 0;
        return '\n'.repeat(n) + line;
    }).join('\n');
}
const imgEm = (mark) => { const z = imgSize(mark); return '\u2003'.repeat(z.w ? Math.max(1, Math.ceil(z.w / 12)) : 2); };
const icoMark = (k) => {
    if (!ICONS) { loadIcons(); return `\uE002${k}\uE003`; }
    return ICONS[k] ? `\uE002${k}\uE003` : '▪';
};
const richPrep = (s0) => {
    // ~ 後面接的格式符號照字面印，先換成暫存記號，格式處理完再換回來
    const keep = [];
    const s = String(s0).replace(/~(\*\*|\/\/|""|__|~~|--|<)/g, (m, x) => { keep.push(x); return `\uE000${keep.length - 1}\uE001`; });
    return emojify(s).replace(/<U\+([0-9a-f]{4,6})>/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/<&([\w-]+)>/g, (m, k) => icoMark(k))
        .replace(/<img(?::|\s+src\s*=\s*"?)([^>"{\s]+)([^>]*)>/gi, (m, u, rest) => `\uE004${u}\uE006${scaleOf(rest)}\uE005`)
        .replace(/<<\s*([^<>]*?)\s*>>/g, '«$1»')
        .replace(CREOLE, (m, d, inner) => `<${CTAG[d]}>${inner}</${CTAG[d]}>`)
        .replace(/\uE000(\d+)\uE001/g, (m, k) => keep[+k].replace('<', '\uFF1C')).replace(/\uFF1C/g, '<');
};
const colorArg = (v) => { const c = String(v || '').trim().split(/\s+/)[0]; return c ? cssColor(c.startsWith('#') ? c : '#' + c) : ''; };
function tagStyle(nm, arg) {
    if (nm === 'b') return { 'font-weight': 700 };
    if (nm === 'i') return { 'font-style': 'italic' };
    if (nm === 'u' || nm === 'w') return { 'text-decoration': 'underline' };
    if (nm === 's' || nm === 'strike') return { 'text-decoration': 'line-through' };
    if (nm === 'tt') return { 'font-family': 'ui-monospace, monospace' };
    if (nm === 'color') { const c = colorArg(arg); return c ? { fill: c } : {}; }
    if (nm === 'back') {   // 字的底色：用描邊墊在字後面
        const c = colorArg(arg);
        return c ? { stroke: c, 'stroke-width': '0.6em', 'stroke-opacity': .5, 'stroke-linejoin': 'round', 'paint-order': 'stroke' } : {};
    }
    if (nm === 'size') return /^\s*\d+\s*$/.test(arg || '') ? { 'font-size': String(arg).trim() } : {};
    if (nm === 'font') {
        // <font:monospaced>、<font color=red size=14>
        if (/^\s*[\w ]+\s*$/.test(arg || '') && !/=/.test(arg)) return { 'font-family': /mono/i.test(arg) ? 'ui-monospace, monospace' : String(arg).trim() };
        const c = String(arg || '').match(/color\s*=\s*"?([^"\s>]+)/i), z = String(arg || '').match(/size\s*=\s*"?(\d+)/i);
        return { ...(c ? { fill: colorArg(c[1]) } : {}), ...(z ? { 'font-size': z[1] } : {}) };
    }
    if (nm === 'sub' || nm === 'sup') return { 'baseline-shift': nm === 'sub' ? 'sub' : 'super', 'font-size': '75%' };
    return {};
}
export const plain = (s) => (rich() ? richPrep(s).replace(TAG_RE, '').replace(GLYPH_RE, (m, ic) => (ic !== undefined ? '\u2003' : imgEm(m.slice(1, -1)))) : String(s));
export function richInto(node, line) {
    if (!rich()) { node.textContent = line; return; }
    const s = richPrep(line), re = new RegExp(TAG_RE.source, 'gi'), stack = [];
    let last = 0, m;
    const put = (txt, extra) => {
        if (!txt) return;
        if (!stack.length && !extra) { node.appendChild(document.createTextNode(txt)); return; }
        const sp = el('tspan', Object.assign({}, ...stack.map((o) => o.st), extra || {}));
        sp.textContent = txt;
        node.appendChild(sp);
    };
    const emit = (txt) => {
        if (!txt) return;
        const gr = new RegExp(GLYPH_RE.source, 'g');
        let at = 0, g;
        while ((g = gr.exec(txt))) {
            put(txt.slice(at, g.index));
            if (g[1] !== undefined) put('\u2003', { 'data-ico': g[1] });
            else put(imgEm(g[2]), { 'data-img': g[2] });
            at = gr.lastIndex;
        }
        put(txt.slice(at));
    };
    while ((m = re.exec(s))) {
        emit(s.slice(last, m.index));
        last = re.lastIndex;
        const nm = m[2].toLowerCase();
        if (m[1]) { const k = stack.map((o) => o.nm).lastIndexOf(nm); if (k >= 0) stack.splice(k, 1); }
        else stack.push({ nm, st: tagStyle(nm, m[3] ?? m[4]) });
    }
    emit(s.slice(last));
}

/* 字畫好之後，把 <&icon> 圖示與 <img> 圖片疊在預留的空白上（位置要等字真的排好才量得到） */
export function placeGlyphs() {
    sv.querySelectorAll('tspan[data-ico], tspan[data-img]').forEach((sp) => {
        const t = sp.closest('text');
        if (!t || !t.parentNode || !sp.getNumberOfChars()) return;
        let p;
        try { p = sp.getStartPositionOfChar(0); } catch { return; }
        const cs = getComputedStyle(sp), fs = parseFloat(cs.fontSize) || 12;
        let g;
        if (sp.dataset.ico !== undefined) {
            const v = ICONS && ICONS[sp.dataset.ico];
            if (!v) return;
            const [d, tf] = Array.isArray(v) ? v : [v, ''];
            const z = fs * 0.85;
            g = el('svg', { x: p.x + (fs - z) / 2, y: p.y - z * 0.88, width: z, height: z, viewBox: '0 0 8 8', overflow: 'visible' });
            g.appendChild(el('path', Object.assign({ d, fill: cs.fill }, tf ? { transform: tf } : {})));
        } else {
            // 原始尺寸還沒載到時先縮在兩個字寬的格子裡，載到後照原尺寸（或 scale）畫，底邊貼齊這一行
            const z = imgSize(sp.dataset.img);
            const w = z.w || fs * 2, h = z.h || fs * 1.4;
            g = el('image', { x: p.x, y: z.h ? p.y + fs * 0.3 - h : p.y - h * 0.8, width: w, height: h, preserveAspectRatio: 'xMidYMid meet' });
            g.setAttribute('href', z.u);
        }
        const tr = t.getAttribute('transform');
        const w = tr ? el('g', { transform: tr }) : g;
        if (tr) w.appendChild(g);
        w.style.pointerEvents = 'none';
        t.parentNode.insertBefore(w, t.nextSibling);
    });
}

/* 訊息編號在畫之前先排好：%autonumber%、多層 1.1.1 與 inc A、中途重設起始值都在這裡算 */
let NUMS = [];
const fmtNum = (v, fmt) => {
    const f = String(fmt || '').replace(/<[^>]*>/g, '').trim();
    if (!f) return String(v);
    if (/0+/.test(f)) return f.replace(/0+/, (z) => String(v).padStart(z.length, '0'));
    return /#+/.test(f) ? f.replace(/#+/, String(v)) : `${f}${v}`;
};
function numberRows() {
    const AC = S.autoCfg || {};
    let v = AC.start ?? 1, step = AC.step ?? 1, fmt = AC.fmt || '', lv = AC.levels ? [...AC.levels] : null;
    NUMS = S.rows.map((r) => {
        if (r.kind !== 'msg') return '';
        const c = r.num;
        if (c && c.restart) { v = c.start; step = c.step; lv = c.levels ? [...c.levels] : null; if (c.fmt !== undefined) fmt = c.fmt; }
        else if (c && c.step) step = c.step;
        if (c && c.inc && lv) {
            const k = c.inc.charCodeAt(0) - 65;
            if (k >= 0 && k < lv.length) { lv[k]++; for (let j = k + 1; j < lv.length; j++) lv[j] = 1; }
        }
        if (r.noOff) return '';
        const out = fmtNum(lv ? lv.join('.') : v, fmt);
        if (lv) lv[lv.length - 1] += step; else v += step;
        return out;
    });
}
/* skinparam maxMessageSize：訊息字太寬就換行（有空白先在空白斷） */
function wrapLine(l, mx) {
    const out = [];
    let cur = '';
    for (const ch of l) {
        if (cur && measure(cur + ch, 12.5) > mx) {
            const sp = cur.lastIndexOf(' ');
            if (sp > 0 && ch !== ' ') { out.push(cur.slice(0, sp)); cur = cur.slice(sp + 1) + ch; }
            else { out.push(cur.trimEnd()); cur = ch === ' ' ? '' : ch; }
        } else cur += ch;
    }
    out.push(cur);
    return out;
}
/* 訊息畫出來的字：%autonumber% 換成編號、maxMessageSize 自動換行 */
function shown(r, i) {
    let s = String(r.text == null ? '' : r.text);
    if (r.kind !== 'msg' || !rich()) return s;
    if (i !== undefined) s = s.replace(/%autonumber%/gi, NUMS[i] || '');
    const mx = +(((S.pumlX || {}).skin || {}).maxmessagesize);
    if (mx > 0) s = s.split('\n').flatMap((l) => wrapLine(l, mx)).join('\n');
    return s;
}
// PUML 的 #red 是顏色名、#ff0000 才是色碼；漸層 #pink/blue 只取第一個
export const cssColor = (c) => {
    const x = String(c || '').split(/[/\\|-]/)[0];
    if (!x) return '';
    return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(x) ? x : x.replace(/^#/, '');
};

function setText(t, str0, x) {
    const str = padImg(str0), ls = textLines(str);
    if (ls.length === 1) { richInto(t, String(str)); return; }
    ls.forEach((line, k) => {
        const sp = el('tspan', { x, dy: k ? LINE_H : 0 });
        richInto(sp, line || ' ');   // 空的 tspan 不會套用 dy，空行放一個不換行空白
        t.appendChild(sp);
    });
}

/* 文字實際有多寬，用 canvas 量，不用字數猜（中英混排猜不準）。 */
let mctx = null;
export function measure(str, size, weight) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = `${weight || 400} ${size}px ${getComputedStyle(sv).fontFamily || 'sans-serif'}`;
    return Math.max(...textLines(str).map((s) => mctx.measureText(plain(s)).width));
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
            // 跟 noteX 同一套位置：左側、蓋在一個或兩個參與者上、右側（預設）
            const x = rel[Math.max(0, pIdx(r.at))] || 0;
            let w = Math.max(110, measure(r.text, 12) + 28) + (r.kw === 'ref' ? 36 : 0);
            if (r.pos === 'left') span(x - 16 - w, x);
            else if (r.pos === 'over' && r.at2 && pIdx(r.at2) >= 0) {
                const x2 = rel[pIdx(r.at2)] || 0;
                w = Math.max(w, Math.abs(x2 - x) + 60);
                span((x + x2) / 2 - w / 2, (x + x2) / 2 + w / 2);
            } else if (r.pos === 'over') span(x - w / 2, x + w / 2);
            else span(x + 16, x + 16 + w + 6);
            return;
        }
        const a = pIdx(r.from), b = pIdx(r.to), w = measure(shown(r), 12.5);
        if (r.ext) {
            const x = rel[Math.max(0, r.ext.inward ? b : a)] || 0, len = Math.max(90, w + 30);
            if (r.ext.side === 'L') span(x - len, x); else span(x, x + len);
            return;
        }
        if (a === b) {
            const x = rel[Math.max(0, a)] || 0;
            if (a === n - 1) span(x - SELF_W - 12 - w - 6, x);
            else span(x, x + SELF_W + 12 + w + 6);
            return;
        }
        const c = ((rel[a] || 0) + (rel[b] || 0)) / 2;
        span(c - w / 2 - 6, c + w / 2 + 6);
    });

    // {s} <-> {e} 時長：畫在最左邊那條生命線的左側
    const X = S.pumlX;
    if (X && X.durations.length) span(-(boxW[0] || BOX_W) / 2 - 40 - Math.max(...X.durations.map((d) => measure(d.text, 11))), 0);
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
        const r0 = S.rows[i];
        // & 與 / note：跟上一列同一高度，不另外佔一列
        if (r0.par && i > 0) {
            Y.push(Y[i - 1]);
            S.blocks.filter((b) => b.to === i).sort((a, b) => (a.to - a.from) - (b.to - b.from))
                .forEach((b, k) => { BBOT.set(b.id, Y[i] + 20 + k * BLK_FOOT); y += BLK_FOOT; });
            continue;
        }
        y += r0.gap || 0;          // ||45||：多空一段
        // alt 的 else 分界線：先讓出一條標籤的高度，記下線的位置
        S.blocks.forEach((b) => (b.elses || []).forEach((e) => { if (e.at === i && b.from < i) { ELSE_Y.set(e, y + 4); y += ELSE_H; } }));
        S.blocks.filter((b) => b.from === i).sort((a, b) => (b.to - b.from) - (a.to - a.from))
            .forEach((b) => { BTOP.set(b.id, y); y += BLK_HEAD; });
        const r = S.rows[i], ex = extraH(r);
        // 文字長在哪一邊，空間就留在哪一邊：訊息在線上方、Note 在框內往下、自呼叫置中
        if (r.kind === 'phase' && r.page && (S.pumlX || {}).ignoreNewpage) { y += 8; Y.push(y); y += 8; }
        else if (r.kind === 'phase') { y += 14 + ex / 2; Y.push(y + 20); y += PHASE_H + 10 + ex / 2; }
        else if (r.kind === 'note') { y += 24; Y.push(y); y += ROW_H - 24 + ex; }
        else if (r.from === r.to && !r.ext) { y += 24 + ex / 2; Y.push(y); y += ROW_H - 24 + ex / 2; }
        else { y += 24 + ex; Y.push(y); y += ROW_H - 24 + (r.slant || 0); }
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
    // !option handwritten true：整張圖換成手寫感的字型
    sv.style.fontFamily = S.type !== 'act' && S.pumlX && S.pumlX.handwritten ? "'Segoe Print', 'Comic Sans MS', 'Bradley Hand', cursive" : '';
    if (S.type === 'act') {
        renderAct();
        placeGlyphs();
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
    numberRows();
    const W = DOC_W = Math.max(560, placeLanes());
    const leg = legendLayout(W);
    const legTop = (leg.rows - 1) * LEG_H;
    const PX = S.pumlX || {};
    const footLH = S.footer ? S.footer.split('\n').length * 15 + 6 : 0;
    const footH = footLH + (PX.caption ? 22 : 0);    // caption 畫在頁尾上面
    // skinparam 與 <style>：名字不分大小寫；顏色、線粗、對齊、外形這些畫得出來的都照畫
    const SKN = PX.skin || {}, STY = PX.style || {};
    const skv = (...ks) => { for (const k of ks) { const v = SKN[k] ?? STY[k]; if (v != null && v !== '') return String(v); } return ''; };
    const skc = (...ks) => colorArg(skv(...ks));
    const C_ARROW = skc('sequencearrowcolor', 'arrowcolor', 'arrow.linecolor');
    const ARW_W = +skv('sequencearrowthickness', 'arrowthickness', 'arrow.linethickness') || 1.4;
    const C_PBG = skc('participantbackgroundcolor', 'sequenceparticipantbackgroundcolor', 'participant.backgroundcolor');
    const C_PBD = skc('participantbordercolor', 'sequenceparticipantbordercolor', 'participant.linecolor');
    const C_NBG = skc('notebackgroundcolor', 'sequencenotebackgroundcolor', 'note.backgroundcolor');
    const C_NBD = skc('notebordercolor', 'sequencenotebordercolor', 'note.linecolor');
    const C_LL = skc('sequencelifelinebordercolor', 'lifelinebordercolor', 'lifeline.linecolor');
    const C_BG = skc('backgroundcolor', 'document.backgroundcolor', 'root.backgroundcolor');
    const LL_SOLID = /^solid$/i.test(skv('lifelinestrategy', 'sequencelifelinestrategy')) || skv('lifeline.linestyle') === '0';
    // PUML 預設在最下面再畫一次參與者（footbox）；hide footbox 才不畫
    const FOOT = S.fmt === 'puml' && !PX.hideFootbox ? HEAD_H + 10 : 0;
    const H = Math.max(240, layout() + legTop + footH + FOOT);
    const endY = H - 32 - legTop - footH - FOOT;
    sv.textContent = '';
    applySize(W, H);

    const defs = el('defs');
    for (const [k, c] of [['n', C_OFF], ['s', C_ON], ['d', C_DASH], ...(C_ARROW ? [['a', C_ARROW]] : [])]) {
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
    // skinparam backgroundColor：淡淡鋪一層，深淺主題的字都還看得清楚
    if (C_BG) sv.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: C_BG, 'fill-opacity': .18 }));
    // mainframe：整張圖外面一個框，左上角標籤
    if (PX.mainframe) {
        const fw = measure(PX.mainframe, 11, 600) + 18;
        sv.appendChild(el('rect', { x: 3, y: 3, width: W - 6, height: H - 6, fill: 'none', stroke: rgb('--c-ink', '.45') }));
        sv.appendChild(el('path', { d: `M3,3 h${fw} v10 l-8,8 h-${fw - 8} z`, fill: rgb('--c-ink', '.08'), stroke: rgb('--c-ink', '.45') }));
        const t = el('text', { x: 10, y: 16, 'font-size': 11, 'font-weight': 600, 'font-family': 'inherit', fill: C_OFF });
        richInto(t, PX.mainframe);
        sv.appendChild(t);
    }

    const L = S.sel.layer;
    const [s0, s1] = selRange();

    if (L === 'row' || L === 'point') {
        for (let i = s0; i <= s1 && S.rows.length; i++) {
            sv.appendChild(el('rect', { x: 0, y: rowY(i) - 24, width: W, height: ROW_H - 8, fill: rgb('--c-purple', '.09') }));
            sv.appendChild(el('rect', { x: 0, y: rowY(i) - 24, width: 3, height: ROW_H - 8, fill: C_ON }));
        }
    }

    const maxD = Math.max(0, ...(S.boxes || []).map((bx) => bx.depth || 0));
    (S.boxes || []).forEach((bx) => {
        const ks = bx.ids.map(pIdx).filter((k) => k >= 0);
        if (!ks.length) return;
        const a = Math.min(...ks), b = Math.max(...ks), dp = bx.depth || 0, pad = 10 + (maxD - dp) * 9;
        const x1 = px(a) - boxWOf(a) / 2 - pad, x2 = px(b) + boxWOf(b) / 2 + pad;
        const c = bx.color ? bx.color.replace(/^#(?![0-9a-f]{3}$|[0-9a-f]{6}$)/i, '') : '';
        sv.appendChild(el('rect', { x: x1, y: 4, width: x2 - x1, height: endY - 4 + (FOOT ? FOOT - 4 : 0), rx: 6,
            fill: c || rgb('--c-ink', '.04'), 'fill-opacity': c ? .12 : 1, stroke: rgb('--c-ink', '.18') }));
        if (bx.label) {
            // 內層的標籤靠右，才不會跟外層置中的標籤疊在一起
            const t = el('text', { x: dp ? x2 - 8 : (x1 + x2) / 2, y: 17, 'text-anchor': dp ? 'end' : 'middle', 'font-size': 11, 'font-weight': 600, 'font-family': 'inherit', fill: cvar('--c-dim') });
            t.textContent = bx.label;
            sv.appendChild(t);
        }
    });
    // create：頂框畫在建立它的那一列；destroy：生命線在那一列結束，畫一個 ×
    const createdAt = new Map(), destroyedAt = new Map();
    S.rows.forEach((r, i) => {
        (r.creates || []).forEach((id) => { if (!createdAt.has(id)) createdAt.set(id, i); });
        (r.destroy || []).forEach((id) => { if (!destroyedAt.has(id)) destroyedAt.set(id, i); });
    });
    const headDy = (p) => (createdAt.has(p.id) ? rowY(createdAt.get(p.id)) - HEAD_Y - HEAD_H / 2 : 0);
    S.parts.forEach((p, i) => {
        const hot = S.drag && S.drag.lane === i;
        const yEnd = destroyedAt.has(p.id) ? rowY(destroyedAt.get(p.id)) : endY;
        if (destroyedAt.has(p.id)) {
            sv.appendChild(el('path', { d: `M${px(i) - 8},${yEnd - 8} L${px(i) + 8},${yEnd + 8} M${px(i) + 8},${yEnd - 8} L${px(i) - 8},${yEnd + 8}`,
                stroke: rgb('--c-ink', '.8'), 'stroke-width': 2 }));
        }
        sv.appendChild(el('line', {
            x1: px(i), y1: HEAD_Y + HEAD_H + headDy(p), x2: px(i), y2: yEnd,
            stroke: hot ? C_ON : C_LL || C_LINE, 'stroke-width': hot ? 1.6 : 1,
            'stroke-dasharray': hot || LL_SOLID ? 'none' : '4 5',
        }));
    });

    /* 執行長條（PUML 的 activate／deactivate、++／--、return） */
    paintBars(endY);

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
        const x1 = PX.teoz ? 14 + depth * 8 : Math.min(...xs) - pad, x2 = PX.teoz ? W - 14 - depth * 8 : Math.max(...xs) + pad;
        const y1 = BTOP.get(b.id) ?? (rowY(b.from) - 40), y2 = BBOT.get(b.id) ?? (rowY(b.to) + 22);
        // Mermaid 的 rect：只是一塊底色，沒有框、沒有標籤
        if (b.kind === 'rect') {
            const g = el('g', { 'data-block': bi, style: 'cursor:pointer' });
            g.appendChild(el('rect', { x: x1, y: y1, width: x2 - x1, height: y2 - y1, rx: 4, fill: b.label || rgb('--c-ink', '.06'),
                'fill-opacity': b.label && !/^(rgba|hsla)\(/i.test(b.label) ? .2 : 1, stroke: on ? C_ON : 'none', 'stroke-width': 1.6 }));
            sv.appendChild(g);
            return;
        }
        // PUML 的 alt#Gold #LightBlue：最後一個顏色當底色
        const bg = cssColor((String(b.deco || '').match(/#[^\s#]+/g) || []).pop());
        sv.appendChild(el('rect', { x: x1, y: y1, width: x2 - x1, height: y2 - y1, rx: 4, fill: bg || 'none', 'fill-opacity': .14, stroke: col, 'stroke-width': on ? 1.6 : 1, opacity: on ? 1 : .55 }));
        const tabW = Math.max(58, measure(b.kind, 11) + 14);    // partition 這種長的種類名，標籤底色跟著加寬
        sv.appendChild(el('path', { d: `M${x1},${y1} h${tabW} l10,16 h-${tabW + 10} z`, fill: col, opacity: on ? .22 : .14 }));
        const g = el('g', { 'data-block': bi, style: 'cursor:pointer' });
        const kt = el('text', { x: x1 + 8, y: y1 + 13, fill: col, 'font-size': 11, 'font-family': 'inherit' });
        kt.textContent = b.kind;
        const lt = el('text', { x: x1 + tabW + 16, y: y1 + 13, fill: col, 'font-size': 11, 'font-family': 'inherit', opacity: .85 });
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
    const actorStyle = skv('actorstyle').toLowerCase(), stBottom = /bottom/i.test(skv('stereotypeposition'));
    const drawHead = (p, i, on, foot) => {
        const g = el('g', foot ? { 'data-foot': i } : { 'data-part': i, style: 'cursor:grab' });
        if (foot) g.setAttribute('transform', `translate(0,${endY + 2 - HEAD_Y})`);
        else if (headDy(p)) g.setAttribute('transform', `translate(0,${headDy(p)})`);
        const pc = on ? '' : (p.color ? cssColor(p.color) : C_PBG);
        // 頂框底下先墊一層實色，上色的參與者才不會透出生命線
        if (pc) g.appendChild(el('rect', { x: px(i) - boxWOf(i) / 2, y: HEAD_Y, width: boxWOf(i), height: HEAD_H, rx: 7, fill: rgb('--c-bg') }));
        g.appendChild(el('rect', {
            x: px(i) - boxWOf(i) / 2, y: HEAD_Y, width: boxWOf(i), height: HEAD_H, rx: 7,
            fill: on ? rgb('--c-purple', '.14') : pc || rgb('--c-surface'), 'fill-opacity': pc ? .35 : 1,
            stroke: on ? C_ON : C_PBD || (p.kind === 'actor' ? rgb('--c-purple', '.45') : rgb('--c-ink', '.14')),
            'stroke-width': on ? 1.6 : 1,
        }));
        if (p.kind === 'actor') {
            // actorStyle：預設火柴人、awesome 實心、hollow 空心身體
            const ac = rgb('--c-purple', '.75'), ax = px(i) - boxWOf(i) / 2 + 16;
            if (actorStyle === 'awesome') {
                g.appendChild(el('circle', { cx: ax, cy: HEAD_Y + 16, r: 4.5, fill: ac }));
                g.appendChild(el('path', { d: `M${ax - 7},${HEAD_Y + 34} q7,-14 14,0 z`, fill: ac }));
            } else if (actorStyle === 'hollow') {
                g.appendChild(el('circle', { cx: ax, cy: HEAD_Y + 16, r: 4.5, fill: 'none', stroke: ac, 'stroke-width': 1.2 }));
                g.appendChild(el('rect', { x: ax - 5, y: HEAD_Y + 22.5, width: 10, height: 12, rx: 3, fill: 'none', stroke: ac, 'stroke-width': 1.2 }));
            } else {
                g.appendChild(el('circle', { cx: ax, cy: HEAD_Y + 17, r: 4.5, fill: 'none', stroke: ac, 'stroke-width': 1.2 }));
                g.appendChild(el('path', { d: `M${ax - 6},${HEAD_Y + 33} q6,-9 12,0`, fill: 'none', stroke: ac, 'stroke-width': 1.2 }));
            }
        } else shapeIcon(g, p.shape, px(i) - boxWOf(i) / 2 + 16, HEAD_Y + HEAD_H / 2, rgb('--c-cyan', '.8'));
        const tx = px(i) + (p.kind === 'actor' || ICON_SHAPES.includes(p.shape) ? 10 : 0);
        // stereotypePosition bottom：«刻板印象» 寫在名字下面
        const nl = textLines(padImg(p.name)).length, ty = HEAD_Y + 28 - (nl - 1) * 7 + (p.stereo ? (stBottom ? -5 : 6) : 0);
        if (p.stereo) {
            const sy = stBottom ? ty + 13 + (nl - 1) * LINE_H : ty - 15, label = `«${p.stereo}»`;
            const st = el('text', { x: tx, y: sy, 'text-anchor': 'middle', 'font-size': 9.5, 'font-family': 'inherit', fill: cvar('--c-dim') });
            st.textContent = label;
            g.appendChild(st);
            // << (C,#ADD1B2) Testable >>：前面畫一個帶字母的小圓
            if (p.spot) {
                const cx = tx - measure(label, 9.5) / 2 - 9;
                g.appendChild(el('circle', { cx, cy: sy - 3.5, r: 6.5, fill: cssColor(p.spot.color) || rgb('--c-cyan', '.6'), stroke: rgb('--c-ink', '.4'), 'stroke-width': .8 }));
                const sc = el('text', { x: cx, y: sy, 'text-anchor': 'middle', 'font-size': 8.5, 'font-weight': 700, 'font-family': 'inherit', fill: '#111' });
                sc.textContent = p.spot.ch;
                g.appendChild(sc);
            }
        }
        const t = el('text', { x: tx, y: ty, 'text-anchor': 'middle', 'font-size': 12.5, 'font-family': 'inherit', fill: on ? C_ON : C_OFF });
        setText(t, p.name, tx);
        g.appendChild(t);
        sv.appendChild(g);
    };
    S.parts.forEach((p, i) => drawHead(p, i, L === 'part' && S.sel.i === i, false));
    if (FOOT) S.parts.forEach((p, i) => { if (!destroyedAt.has(p.id)) drawHead(p, i, false, true); });

    /* 列 */
    // autonumber：訊息起點畫一個帶編號的小圓（編號在 numberRows 排好；stop 到 resume 之間是空的、不畫）
    const numBadge = (g, x, y, i) => {
        const s = NUMS[i];
        if (!s) return;
        if (s.length <= 2) g.appendChild(el('circle', { cx: x, cy: y, r: 8.5, fill: rgb('--c-ink', '.85') }));
        else {
            const w = measure(s, 9.5, 700) + 12;
            g.appendChild(el('rect', { x: x - w / 2, y: y - 8.5, width: w, height: 17, rx: 8.5, fill: rgb('--c-ink', '.85') }));
        }
        const t = el('text', { x, y: y + 3.5, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 700, 'font-family': 'inherit', fill: rgb('--c-bg') });
        t.textContent = s;
        g.appendChild(t);
    };
    S.rows.forEach((r, i) => {
        const y = rowY(i);
        const inSel = i >= s0 && i <= s1 && (L === 'row' || L === 'point');
        const dashed = r.tone === 'dash';
        const col = inSel ? C_ON : (dashed ? C_DASH : C_OFF);
        const mk = inSel ? 's' : (dashed ? 'd' : C_ARROW ? 'a' : 'n');
        const lc = inSel || dashed || !C_ARROW ? col : C_ARROW;    // skinparam ArrowColor 只換線，字照主題色
        const g = el('g', { 'data-row': i, style: 'cursor:pointer' });

        const ex = extraH(r);
        if (r.kind === 'phase' && r.page && PX.ignoreNewpage) {
            // ignore newpage：分頁不畫，選到時才標一下它在這裡
            if (inSel) g.appendChild(el('line', { x1: 16, y1: y, x2: W - 16, y2: y, stroke: C_ON, 'stroke-dasharray': '2 6' }));
        } else if (r.kind === 'phase' && r.page) {
            // newpage：一條橫跨整張圖的虛線，標題寫在線中間
            const lbl = r.text || 'newpage', tw = measure(lbl, 11.5, 600) + 20;
            g.appendChild(el('line', { x1: 16, y1: y - 2, x2: W - 16, y2: y - 2, stroke: inSel ? C_ON : rgb('--c-ink', '.4'), 'stroke-width': 1.2, 'stroke-dasharray': '10 6' }));
            g.appendChild(el('rect', { x: W / 2 - tw / 2, y: y - 13, width: tw, height: 22, rx: 11, fill: inSel ? rgb('--c-purple', '.14') : rgb('--c-surface'), stroke: inSel ? C_ON : rgb('--c-ink', '.25') }));
            const t = el('text', { x: W / 2, y: y + 2, 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 600, 'font-family': 'inherit', fill: inSel ? C_ON : cvar('--c-dim') });
            setText(t, lbl, W / 2);
            g.appendChild(t);
        } else if (r.kind === 'phase' && !r.delay) {
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
                const nf = inSel ? '' : (r.ncolor ? cssColor(r.ncolor) : C_NBG);
                const d = r.kw === 'hnote' ? `M${x + 8},${y - 15} H${x + w - 8} L${x + w},${y - 2 + ex / 2} L${x + w - 8},${y + 11 + ex} H${x + 8} L${x},${y - 2 + ex / 2} Z`
                    : r.kw === 'rnote' ? `M${x},${y - 15} h${w} v${26 + ex} h-${w} z`
                        : `M${x},${y - 15} h${w - 11} l11,11 v${26 + ex} h-${w} z`;
                g.appendChild(el('path', {
                    d, fill: nf || rgb('--c-warn', '.1'), 'fill-opacity': nf ? .3 : 1, stroke: inSel ? col : C_NBD || rgb('--c-warn', '.55'),
                }));
            }
            const tx = isRef ? x + 40 : x + 10;
            const t = el('text', { x: tx, y: y + 7, 'font-size': 12, 'font-family': 'inherit', fill: inSel ? col : isRef ? C_OFF : C_WARN });
            setText(t, r.text, tx);
            g.appendChild(t);
        } else if (r.from === r.to && !r.ext) {
            const last = pIdx(r.from) === n - 1;
            const x = pxOf(r.from), d = last ? -1 : 1, yy = y;
            g.appendChild(el('path', {
                d: `M${x},${yy - SELF_H / 2} h${d * SELF_W} v${SELF_H} h${-d * (SELF_W - 7)}`,
                fill: 'none', stroke: lc, 'stroke-width': ARW_W,
                'stroke-dasharray': dashed || r.type === 'return' ? '6 4' : 'none', 'marker-end': `url(#mk-solid-${mk})`,
            }));
            const tx = x + d * (SELF_W + 12);
            const t = el('text', { x: tx, y: yy + 4 - ex / 2, 'font-size': 12.5, 'font-family': 'inherit', 'text-anchor': last ? 'end' : 'start', fill: col });
            setText(t, shown(r, i), tx);
            g.appendChild(t);
            if (S.autonumber) numBadge(g, x, yy - SELF_H / 2, i);
            handle(g, x, yy - SELF_H / 2, i, 'from', inSel, C_ON);
        } else {
            let x1 = pxOf(r.from), x2 = pxOf(r.to);
            const y1 = y, y2 = y + (r.slant || 0);     // ->(10)：終點往下偏
            // 圖外箭頭：[ ] 從圖的邊緣、? 從參與者旁邊一小段
            if (r.ext) {
                const xp = pxOf(r.ext.inward ? r.to : r.from), len = Math.max(56, measure(r.text, 12.5) + 20);
                const edge = r.ext.side === 'L' ? (r.ext.q === '?' ? xp - len : 10) : (r.ext.q === '?' ? xp + len : W - 10);
                if (r.ext.inward) { x1 = edge; x2 = xp; } else { x1 = xp; x2 = edge; }
            }
            const dir = x2 > x1 ? 1 : -1;
            if ((r.creates || []).includes(r.to) && createdAt.get(r.to) === i) x2 -= dir * boxWOf(pIdx(r.to)) / 2;
            // 兩端各自處理：x＝打叉（取代那一頭的箭頭）、o＝小圓（畫在箭頭外面）；Mermaid 的 -> 沒有頭；<-> <<->> 兩頭都有
            const endHead = !(r.mark === 'x' || r.nohead || r.half), startHead = !!r.both && r.markFrom !== 'x';
            const lx2 = r.mark === 'x' ? x2 - dir * 6 : r.mark === 'o' ? x2 - dir * 10 : endHead ? x2 - dir * 7 : x2;
            const lx1 = r.markFrom === 'x' ? x1 + dir * 6 : r.markFrom === 'o' ? x1 + dir * 10 : startHead ? x1 + dir * 7 : x1;
            const ln = { x1: lx1, y1, x2: lx2, y2, stroke: lc, 'stroke-width': ARW_W,
                'stroke-dasharray': (dashed || r.type === 'return') ? '6 4' : 'none' };
            if (endHead) ln['marker-end'] = `url(#mk-${r.type === 'sync' ? 'solid' : 'open'}-${mk})`;
            if (startHead) ln['marker-start'] = `url(#mk-rev-${mk})`;
            g.appendChild(el('line', ln));
            const xMark = (cx, cy) => g.appendChild(el('path', { d: `M${cx - 5},${cy - 5} L${cx + 5},${cy + 5} M${cx + 5},${cy - 5} L${cx - 5},${cy + 5}`, stroke: lc, 'stroke-width': 1.8 }));
            const oMark = (cx, cy) => g.appendChild(el('circle', { cx, cy, r: 4.5, fill: 'none', stroke: lc, 'stroke-width': 1.4 }));
            if (r.mark === 'x') xMark(x2 - dir * 6, y2);
            if (r.mark === 'o') oMark(x2 - dir * 5, y2);
            if (r.markFrom === 'x') xMark(x1 + dir * 6, y1);
            if (r.markFrom === 'o') oMark(x1 + dir * 5, y1);
            // Mermaid 半箭頭：只畫上半或下半；stick 是一撇、不填滿；/|- 這類反向的畫在起點那一頭
            if (r.half) {
                const hx = r.rev ? lx1 : (r.mark === 'o' ? x2 - dir * 10 : x2), hd = r.rev ? -dir : dir, s = r.half === 'top' ? -1 : 1;   // 有小圓時畫在小圓外面
                const d = `M${hx},${y2} L${hx - hd * 10},${y2 + s * 6}`;
                g.appendChild(el('path', r.stick ? { d, stroke: lc, 'stroke-width': ARW_W, fill: 'none' } : { d: `${d} L${hx - hd * 10},${y2} Z`, fill: lc }));
            }
            // Mermaid 中央連接 ()：連到生命線正中的小圓點
            if (r.mmC) g.appendChild(el('circle', { cx: r.mmC === 'to' ? pxOf(r.to) : x1, cy: y2, r: 4, fill: col }));
            // sequenceMessageAlign left／right／center／direction；responseMessageBelowArrow：回傳的字寫在線下面
            const align = skv('sequencemessagealign').toLowerCase(), lo = Math.min(x1, x2), hi = Math.max(x1, x2);
            let tx = (x1 + x2) / 2, anc = 'middle';
            if (align === 'left') { tx = lo + 8; anc = 'start'; }
            else if (align === 'right') { tx = hi - 8; anc = 'end'; }
            else if (align === 'direction' || align === 'reversedirection') {
                const fx = align === 'direction' ? x1 : x2;
                tx = fx === lo ? lo + 8 : hi - 8; anc = fx === lo ? 'start' : 'end';
            }
            const below = r.type === 'return' && /^true$/i.test(skv('responsemessagebelowarrow'));
            const t = el('text', { x: tx, y: below ? Math.max(y1, y2) + 17 : Math.min(y1, y2) - 9 - ex, 'text-anchor': anc, 'font-size': 12.5, 'font-family': 'inherit', fill: col });
            setText(t, shown(r, i), tx);
            g.appendChild(t);
            if (S.autonumber) numBadge(g, x1, y1, i);
            // 圖外箭頭只有參與者那一頭有把手
            if (!r.ext || !r.ext.inward) handle(g, x1, y1, i, 'from', inSel, C_ON);
            if (!r.ext || r.ext.inward) handle(g, x2, y2, i, 'to', inSel, C_ON);
        }

        if (!exporting) {
            const hit = el('rect', { x: 0, y: y - 24 - ex, width: W, height: ROW_H - 8 + ex * 2, fill: 'transparent' });
            g.insertBefore(hit, g.firstChild);
        }
        sv.appendChild(g);
    });

    /* {s} <-> {e}：兩個錨點之間畫一條上下雙箭頭，字在左邊 */
    if (PX.durations && PX.durations.length) {
        const at = (nm) => S.rows.findIndex((r) => String(r.anchor || '').trim() === `{${nm}}`);
        const dx = px(0) - boxWOf(0) / 2 - 18;
        PX.durations.forEach((d, k) => {
            const a = at(d.a), b = at(d.b);
            if (a < 0 || b < 0) return;
            const xa = dx - k * 14, ya = rowY(Math.min(a, b)), yb = rowY(Math.max(a, b));
            sv.appendChild(el('line', { x1: xa, y1: ya + 6, x2: xa, y2: yb - 6, stroke: C_OFF, 'stroke-width': 1.2,
                'marker-start': 'url(#mk-rev-n)', 'marker-end': 'url(#mk-solid-n)' }));
            sv.appendChild(el('line', { x1: xa - 6, y1: ya, x2: xa + 6, y2: ya, stroke: C_OFF }));
            sv.appendChild(el('line', { x1: xa - 6, y1: yb, x2: xa + 6, y2: yb, stroke: C_OFF }));
            if (d.text) {
                const t = el('text', { x: xa - 6, y: (ya + yb) / 2 + 4, 'text-anchor': 'end', 'font-size': 11, 'font-family': 'inherit', fill: C_OFF });
                richInto(t, d.text);
                sv.appendChild(t);
            }
        });
    }
    if (PX.caption) {
        const t = el('text', { x: W / 2, y: H - 10 - footLH, 'text-anchor': 'middle', 'font-size': 11.5, 'font-style': 'italic', 'font-family': 'inherit', fill: cvar('--c-dim') });
        richInto(t, PX.caption);
        sv.appendChild(t);
    }

    /* 圖例 */
    const ly0 = H - 14 - legTop - footH;
    // %page%／%lastpage%：整張圖畫在一起，頁首算第 1 頁、頁尾算最後一頁
    const PAGES = PX.ignoreNewpage ? 1 : 1 + S.rows.filter((r) => r.kind === 'phase' && r.page).length;
    const pageVars = (s, pg) => String(s).replace(/%page%/gi, pg).replace(/%lastpage%/gi, PAGES);
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
        t.textContent = pageVars(S.header.split('\n').join('  '), 1);
        sv.appendChild(t);
    }
    if (S.footer) S.footer.split('\n').forEach((s, k, arr) => {
        const t = el('text', { x: W / 2, y: H - 6 - (arr.length - 1 - k) * 15, 'text-anchor': 'middle', 'font-size': 11, 'font-family': 'inherit', fill: cvar('--c-dim') });
        t.textContent = pageVars(s, PAGES);
        sv.appendChild(t);
    });
    paintFoot();
    paintName();
    placeGlyphs();
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
    else if (r.ext) w.textContent = `${span} · ${r.ext.inward ? `⋯ → ${nameOf(r.to)}` : `${nameOf(r.from)} → ⋯`} · ${T.typeLabel[r.type]}${tone}`;
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
        S.rows.filter((r) => r.kind === 'msg' && (r.from !== r.to || r.ext)).length,
        S.rows.filter((r) => r.kind === 'msg' && r.from === r.to && !r.ext).length,
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
    const start = (id, y, c) => { if (!open.has(id)) open.set(id, []); open.get(id).push({ y, c }); };
    const stop = (id, y) => { const a = open.get(id); if (a && a.length) { const o = a.pop(); segs.push({ id, y0: o.y, c: o.c, y1: y, d: a.length }); } };
    S.rows.forEach((r, i) => {
        if (r.kind !== 'msg') return;
        const y = rowY(i);
        if (r.ret) stop(r.from, y);
        if (r.auto === 'open') start(r.to, y);
        if (r.auto === 'close') stop(r.from, y);
        if (r.mod === '++') start(r.to, y);
        if (r.mod === '--++') { stop(r.from, y); start(r.to, y); }
        if (r.mod === '--') stop(r.from, y);
        (r.act || []).forEach((a) => (a.op === 'activate' ? start(a.id, y, a.color) : stop(a.id, y)));
    });
    open.forEach((a, id) => { while (a.length) { const o = a.pop(); segs.push({ id, y0: o.y, c: o.c, y1: yEnd - 6, d: a.length }); } });
    segs.forEach((g) => {
        const k = pIdx(g.id);
        if (k < 0) return;
        sv.appendChild(el('rect', {
            x: px(k) - 5 + g.d * 5, y: g.y0, width: 10, height: Math.max(8, g.y1 - g.y0),
            fill: g.c ? cssColor(g.c) : rgb('--c-surface'), 'fill-opacity': g.c ? .55 : 1, stroke: rgb('--c-ink', '.35'), 'stroke-width': 1,
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
