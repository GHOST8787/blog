// blog/stats.js — 站內流量儀表板。資料由 theme.js 的計數器寫進 Realtime DB 的 stats 節點。
// 只有站長帳號讀得到，訪客連讀都讀不到（規則見 docs 底下最新的 rules_merged_full.json）。
// 注意：根目錄那個 stats.json 是首頁四格數字，跟這頁無關，別搞混。
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
    getAuth, GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
    getDatabase, ref, query, orderByKey, startAt, endAt, get, remove
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCwjNQeSSKNJHkUSS4SnXAHq4E-xn4uAKc",
    authDomain: "blog8787-f2ace.firebaseapp.com",
    databaseURL: "https://blog8787-f2ace-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "blog8787-f2ace",
    storageBucket: "blog8787-f2ace.firebasestorage.app",
    messagingSenderId: "619380552537",
    appId: "1:619380552537:web:e235bc3f22f6e2da7ad248",
    measurementId: "G-XT1H58ZNZZ"
};

const ADMIN_UID = 'qIjxHkkrmhNjAe1On8JHxCnFIB42';
const GOOGLE_CLIENT_ID = '619380552537-c3lnr7vsaoabdllgt7begcsk3ldhj98t.apps.googleusercontent.com';
const RETAIN = 365;                  // 資料保存一年，更舊的整桶刪掉

// 跟 whiteboard 兩頁共用同一個 instance 名稱，登入態互通，不必每頁重登
const app = initializeApp(firebaseConfig, 'whiteboard');
const auth = getAuth(app);
const db = getDatabase(app);

const $ = (id) => document.getElementById(id);

/* ── 分類 ───────────────────────────────────────────
   資料庫只存路徑，分類在這裡算。改分類不用動已經存進去的資料。 */
const TOOLS = new Set(['meet.html', 'whiteboard.html', 'planet.html', 'quotes.html', 'audio_room.html']);

const CATS = [
    { key: 'article', name: '文章',   cvar: 'purple',
      dot: 'bg-accent-purple',  bar: 'bg-accent-purple' },
    { key: 'tool',    name: '小工具', cvar: 'cyan',
      dot: 'bg-accent-cyan',    bar: 'bg-accent-cyan' },
    { key: 'index',   name: '首頁',   cvar: 'blue',
      dot: 'bg-accent-blue',    bar: 'bg-accent-blue' },
    { key: 'other',   name: '其他',   cvar: 'success',
      dot: 'bg-accent-success', bar: 'bg-accent-success' }
];

function classify(base) {
    if (base === 'index.html') return 'index';
    if (/^EXP\/(article|project)_\d+\.html$/.test(base)) return 'article';
    if (TOOLS.has(base)) return 'tool';
    return 'other';                      // 列表頁、履歷、404、草稿都歸這裡
}

/* ── 日期：一律台北時間，跟 theme.js 的分桶對齊 ────────── */
function taipeiToday() {
    const d = new Date(Date.now() + 8 * 3600000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function dayKey(d) { return d.toISOString().slice(0, 10); }
function shift(d, n) { return new Date(d.getTime() + n * 86400000); }
function shortLabel(k) { const p = k.split('-'); return (+p[1]) + '/' + (+p[2]); }

function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function sum(a) { return a.reduce((x, y) => x + y, 0); }

/* ── 狀態 ──────────────────────────────────────────── */
let PAGEMETA = {};
let DAYS = 30, END = null;             // END = 區間最後一天（Date），null 代表今天
let days = [], data = {};

/* ── 讀資料 ─────────────────────────────────────────
   一次查一段 key 範圍，不整包拉。日期是 key，所以 orderByKey 就夠，不用索引。 */
async function load(fromKey, toKey) {
    const snap = await get(query(ref(db, 'stats'), orderByKey(), startAt(fromKey), endAt(toKey)));
    return snap.val() || {};
}

function aggregate(raw) {
    const idx = {};
    days.forEach((k, i) => { idx[k] = i; });

    const totals = {}, pages = {};
    CATS.forEach(c => { totals[c.key] = new Array(days.length).fill(0); });

    for (const dayk of Object.keys(raw)) {
        const i = idx[dayk];
        if (i === undefined) continue;
        for (const id of Object.keys(raw[dayk])) {
            const hit = raw[dayk][id];
            if (!hit || typeof hit.p !== 'string') continue;
            const en = hit.p.startsWith('en/');
            const base = en ? hit.p.slice(3) : hit.p;
            const cat = classify(base);
            totals[cat][i] += 1;
            const row = pages[base] || (pages[base] = { base, cat, zh: 0, en: 0 });
            if (en) row.en += 1; else row.zh += 1;
        }
    }

    data = {};
    CATS.forEach(c => {
        data[c.key] = {
            total: totals[c.key],
            rows: Object.values(pages).filter(r => r.cat === c.key)
                .map(r => ({
                    base: r.base, zh: r.zh, en: r.en, n: r.zh + r.en,
                    title: PAGEMETA[r.base] || PAGEMETA['en/' + r.base] || r.base
                }))
                .sort((a, b) => b.n - a.n)
        };
    });
}

/* ── 保存期限：超過一年的桶直接刪。開頁面就順手清，不需要排程 ── */
async function prune() {
    try {
        const token = await auth.currentUser.getIdToken();
        const url = firebaseConfig.databaseURL + '/stats.json?shallow=true&auth=' + encodeURIComponent(token);
        const res = await fetch(url);
        if (!res.ok) return 0;
        const all = await res.json();
        if (!all) return 0;
        const cutoff = dayKey(shift(taipeiToday(), -(RETAIN - 1)));
        const old = Object.keys(all).filter(k => k < cutoff);
        for (const k of old) await remove(ref(db, 'stats/' + k));
        return old.length;
    } catch (e) {
        console.warn('[stats] 清理舊資料失敗', e);
        return 0;
    }
}

/* ── 畫面 ──────────────────────────────────────────── */
function trend(v) {
    const half = Math.floor(v.length / 2);
    const a = sum(v.slice(0, half)), b = sum(v.slice(half));
    if (!a) return { text: '—', cls: 'text-gray-600' };
    const p = Math.round((b - a) / a * 100);
    if (p > 0) return { text: '+' + p + '%', cls: 'text-accent-success' };
    if (p < 0) return { text: p + '%', cls: 'text-accent-danger' };
    return { text: '持平', cls: 'text-gray-500' };
}

function mini(values, cvar) {
    const w = 100, h = 22, max = Math.max(...values, 1);
    const step = values.length > 1 ? w / (values.length - 1) : w;
    const pts = values.map((v, i) =>
        (i * step).toFixed(1) + ',' + (h - (v / max) * (h - 2) - 1).toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="w-full h-5 mt-2">`
        + `<polygon points="0,${h} ${pts} ${w},${h}" fill="rgb(var(--c-${cvar}) / 0.14)"/>`
        + `<polyline points="${pts}" fill="none" stroke="rgb(var(--c-${cvar}))" stroke-width="1.4"/></svg>`;
}

function renderCards() {
    $('s-cards').innerHTML = CATS.map(c => {
        const t = data[c.key].total, tr = trend(t);
        return `<button data-jump="${c.key}" class="text-left bg-surface border border-white/10 hover:border-accent-purple/40 rounded-xl px-4 py-3 transition-colors">`
            + '<div class="flex items-center gap-1.5">'
            +   `<span class="w-1.5 h-1.5 rounded-full ${c.dot}"></span>`
            +   `<span class="text-[11px] font-mono text-gray-400">${c.name}</span>`
            +   '<i class="fa-solid fa-arrow-up-right-from-square text-gray-700 text-[9px] ml-auto"></i>'
            + '</div>'
            + '<div class="flex items-baseline gap-1.5 mt-1.5">'
            +   `<span class="text-2xl font-bold text-white leading-none">${sum(t).toLocaleString()}</span>`
            +   `<span class="text-[11px] font-mono ${tr.cls}">${tr.text}</span>`
            + '</div>'
            + mini(t, c.cvar)
            + '</button>';
    }).join('');
}

function renderLegend() {
    $('s-legend').innerHTML = CATS.map(c =>
        `<span class="flex items-center gap-1.5 text-gray-400"><span class="w-2 h-2 rounded-sm ${c.dot}"></span>${c.name}</span>`
    ).join('');
}

function renderChart() {
    const W = 700, H = 150, PAD = 4, n = days.length;
    let max = 1;
    for (let i = 0; i < n; i++) {
        for (const c of CATS) max = Math.max(max, data[c.key].total[i]);
    }
    const step = n > 1 ? W / (n - 1) : W;
    const lines = CATS.map(c => {
        const pts = data[c.key].total.map((v, j) =>
            (j * step).toFixed(1) + ',' + (H - (v / max) * (H - PAD * 2) - PAD).toFixed(1)).join(' ');
        return `<polyline points="${pts}" fill="none" stroke="rgb(var(--c-${c.cvar}))" `
            + 'stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
    }).join('');
    const grid = [0.25, 0.5, 0.75].map(f =>
        `<line x1="0" y1="${(H * f).toFixed(1)}" x2="${W}" y2="${(H * f).toFixed(1)}" `
        + 'stroke="rgb(var(--c-ink) / 0.06)" stroke-width="1" vector-effect="non-scaling-stroke"/>').join('');

    $('s-chart').innerHTML =
        `<svg id="s-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="w-full h-40 lg:h-56 cursor-crosshair">`
        + grid + lines
        + `<line id="s-cursor" x1="0" y1="0" x2="0" y2="${H}" stroke="rgb(var(--c-ink) / 0.25)" `
        + 'stroke-width="1" vector-effect="non-scaling-stroke" style="display:none"/></svg>'
        + '<div class="flex justify-between text-[10px] font-mono text-gray-700 mt-1">'
        +   `<span>${shortLabel(days[0])}</span><span>${shortLabel(days[Math.floor(n / 2)])}</span>`
        +   `<span>${shortLabel(days[n - 1])}</span></div>`;

    const svg = $('s-svg'), cursor = $('s-cursor'), out = $('s-readout');
    svg.addEventListener('mousemove', (e) => {
        const r = svg.getBoundingClientRect();
        let i = Math.round((e.clientX - r.left) / r.width * (n - 1));
        i = Math.max(0, Math.min(n - 1, i));
        cursor.style.display = '';
        cursor.setAttribute('x1', (i * step).toFixed(1));
        cursor.setAttribute('x2', (i * step).toFixed(1));
        out.textContent = shortLabel(days[i]) + '　'
            + CATS.map(c => c.name + ' ' + data[c.key].total[i]).join('　');
    });
    svg.addEventListener('mouseleave', () => { cursor.style.display = 'none'; out.textContent = ''; });
}

function renderTop() {
    const rows = CATS.flatMap(c => data[c.key].rows.map(r => ({ ...r, cat: c })))
        .sort((a, b) => b.n - a.n).slice(0, 8);
    if (!rows.length) {
        $('s-top').innerHTML = '<li class="text-xs text-gray-600">這段期間還沒有紀錄</li>';
        return;
    }
    const max = rows[0].n || 1;
    $('s-top').innerHTML = rows.map((r, i) =>
        '<li class="flex items-start gap-2">'
        + `<span class="text-[10px] font-mono text-gray-700 w-4 shrink-0 pt-0.5">${i + 1}</span>`
        + '<span class="flex-1 min-w-0">'
        +   '<span class="flex items-baseline gap-2">'
        +     `<span class="text-xs text-white truncate">${esc(r.title)}</span>`
        +     `<span class="ml-auto text-xs font-mono text-gray-300 shrink-0">${r.n}</span>`
        +   '</span>'
        +   '<span class="block h-1 rounded-full bg-white/5 mt-1 overflow-hidden">'
        +     `<span class="block h-full rounded-full ${r.cat.bar}" style="width:${(r.n / max * 100).toFixed(1)}%"></span>`
        +   '</span>'
        + '</span></li>').join('');
}

function renderDetails() {
    $('s-details').innerHTML = CATS.map(c => {
        const rows = data[c.key].rows;
        const body = rows.length ? rows.map(r =>
            '<tr class="border-t border-white/5">'
            + `<td class="py-1.5 pr-3 text-xs text-white">${esc(r.title)}</td>`
            + `<td class="py-1.5 pr-3 text-[10px] font-mono text-gray-600 hidden sm:table-cell">${esc(r.base)}</td>`
            + `<td class="py-1.5 pr-3 text-xs font-mono text-gray-400 text-right">${r.zh}</td>`
            + `<td class="py-1.5 pr-3 text-xs font-mono text-gray-400 text-right">${r.en}</td>`
            + `<td class="py-1.5 text-xs font-mono text-white text-right">${r.n}</td></tr>`
        ).join('') : '<tr class="border-t border-white/5"><td colspan="5" class="py-2 text-xs text-gray-600">這段期間沒有紀錄</td></tr>';

        return `<details class="drill" id="drill-${c.key}">`
            + '<summary class="flex items-center gap-2 px-4 py-2.5">'
            +   '<i class="fa-solid fa-chevron-right drill-caret text-gray-600 text-[10px]"></i>'
            +   `<span class="w-1.5 h-1.5 rounded-full ${c.dot}"></span>`
            +   `<span class="text-xs text-white">${c.name}</span>`
            +   `<span class="text-[11px] font-mono text-gray-600">${rows.length} 頁</span>`
            +   `<span class="ml-auto text-xs font-mono text-gray-300">${sum(data[c.key].total).toLocaleString()}</span>`
            + '</summary>'
            + '<div class="px-4 pb-3 overflow-x-auto"><table class="w-full">'
            +   '<thead><tr class="text-[10px] font-mono text-gray-600">'
            +     '<th class="text-left font-normal pb-1">頁面</th>'
            +     '<th class="text-left font-normal pb-1 hidden sm:table-cell">路徑</th>'
            +     '<th class="text-right font-normal pb-1 pr-3">中</th>'
            +     '<th class="text-right font-normal pb-1 pr-3">英</th>'
            +     '<th class="text-right font-normal pb-1">合計</th>'
            +   '</tr></thead><tbody>' + body + '</tbody></table></div></details>';
    }).join('');
}

$('s-cards').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-jump]');
    if (!b) return;
    const d = $('drill-' + b.dataset.jump);
    d.open = true;
    d.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

async function render() {
    const last = END || taipeiToday();
    days = [];
    for (let i = DAYS - 1; i >= 0; i--) days.push(dayKey(shift(last, -i)));

    $('s-rangelabel').textContent = '讀取中…';
    let raw;
    try {
        raw = await load(days[0], days[days.length - 1]);
    } catch (err) {
        $('s-rangelabel').textContent = '讀取失敗：' + err.message;
        return;
    }
    aggregate(raw);
    renderCards(); renderLegend(); renderChart(); renderTop(); renderDetails();

    const all = CATS.reduce((n, c) => n + sum(data[c.key].total), 0);
    $('s-rangelabel').textContent =
        `${shortLabel(days[0])} 到 ${shortLabel(days[days.length - 1])}，共 ${DAYS} 天 · ${all.toLocaleString()} 次瀏覽`;
}

/* ── 區間控制 ───────────────────────────────────────── */
const $range = $('s-range'), $custom = $('s-custom');
const $from = $('s-from'), $to = $('s-to'), $msg = $('s-custom-msg');

function markActive(btn) {
    $range.querySelectorAll('button').forEach(b => {
        b.className = 'px-2.5 py-1 rounded text-[11px] font-mono transition-colors '
            + (b === btn ? 'bg-accent-purple/15 text-white' : 'text-gray-400 hover:text-white');
    });
}

$range.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    markActive(btn);

    if (btn.hasAttribute('data-custom')) {
        const today = taipeiToday();
        $from.min = $to.min = dayKey(shift(today, -(RETAIN - 1)));
        $from.max = $to.max = dayKey(today);
        if (!$to.value) $to.value = dayKey(END || today);
        if (!$from.value) $from.value = dayKey(shift(new Date($to.value + 'T00:00:00Z'), -(DAYS - 1)));
        $custom.classList.remove('hidden');
        $custom.classList.add('flex');
        return;
    }

    $custom.classList.add('hidden');
    $custom.classList.remove('flex');
    DAYS = parseInt(btn.dataset.days, 10);
    END = null;
    render();
});

$('s-apply').addEventListener('click', () => {
    if (!$from.value || !$to.value) { $msg.textContent = '兩個日期都要填'; return; }
    const f = new Date($from.value + 'T00:00:00Z'), t = new Date($to.value + 'T00:00:00Z');
    if (f > t) { $msg.textContent = '開始日期不能晚於結束日期'; return; }
    const today = taipeiToday();
    if (t > today) { $msg.textContent = '結束日期不能是未來'; return; }
    const n = Math.round((t - f) / 86400000) + 1;
    if (n > RETAIN) { $msg.textContent = `資料只保存一年，最多選 ${RETAIN} 天`; return; }
    if (shift(today, -(RETAIN - 1)) > f) { $msg.textContent = `超出保存期限，最早只能選到 ${RETAIN} 天前`; return; }
    $msg.textContent = '資料保存一年，最早只能選到一年前';
    DAYS = n; END = t;
    render();
});

/* ── 登入：沿用 whiteboard-admin 那一套 GIS 頁內登入 ────── */
$('s-logout').addEventListener('click', () => signOut(auth));

function onGoogleCredential(response) {
    $('s-login-err').textContent = '';
    signInWithCredential(auth, GoogleAuthProvider.credential(response.credential))
        .catch(err => { $('s-login-err').textContent = err.message; });
}

function initGoogleSignIn() {
    if (!(window.google && google.accounts && google.accounts.id)) {
        setTimeout(initGoogleSignIn, 150);
        return;
    }
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogleCredential });
    const slot = $('s-gis-btn');
    if (slot) google.accounts.id.renderButton(slot,
        { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'zh_TW' });
}
initGoogleSignIn();

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        $('s-login').classList.remove('hidden');
        $('s-body').classList.add('hidden');
        $('s-who').textContent = '未登入';
        return;
    }
    if (user.uid !== ADMIN_UID) {
        $('s-login-err').textContent = `這個帳號沒有權限（UID ${user.uid.slice(0, 8)}…）`;
        signOut(auth);
        return;
    }
    $('s-login').classList.add('hidden');
    $('s-body').classList.remove('hidden');
    $('s-who').textContent = user.email;

    try {
        PAGEMETA = await (await fetch('data/pagemeta.json')).json();
    } catch (e) {
        PAGEMETA = {};              // 拿不到標題就顯示路徑，不擋畫面
    }
    await render();
    const n = await prune();
    if (n) console.log('[stats] 清掉超過一年的資料 ' + n + ' 天');
});
