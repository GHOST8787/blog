// 時序圖工具的進入點。sequence.html 與 en/sequence.html 都載這一支，語言看 <html lang> 決定。
// 這裡做四件事：挑語言字串、載入示範圖、接工具列按鈕、處理導覽列自動收起。

import * as zh from './strings.zh.js';
import * as en from './strings.en.js';
import { S, setStrings, sampleDiagram, loadDiagram, loadSaved, push, touch } from './state.js';
import { render, resetSelKey } from './render.js';
import { initKeys } from './keys.js';
import { toMermaid, fromMermaid, saveFile, saveSVG, readFile, exportPNG } from './io.js';

const L = document.documentElement.lang.toLowerCase().startsWith('zh') ? zh : en;
setStrings(L);

/* 文字先就位，再畫畫面 */
document.getElementById('seqTitle').textContent = L.title;
document.getElementById('seqSub').textContent = L.subtitle;
document.getElementById('mmHead').textContent = L.msg.mmHead;
document.querySelectorAll('[data-btn]').forEach((b) => { b.textContent = L.btn[b.dataset.btn]; });
document.querySelectorAll('[data-tip]').forEach((b) => { b.title = L.hint[b.dataset.tip]; });
document.getElementById('grpFile').textContent = L.hint.file;
document.getElementById('grpView').textContent = L.hint.view;
document.getElementById('rClose').textContent = L.msg.impClose;
const nameBox = document.getElementById('docName');
nameBox.placeholder = L.msg.namePlaceholder;
nameBox.title = L.msg.nameTip;
buildHelp();

/* 上次留在這台電腦上的圖優先，沒有才給示範圖 */
S.legend = L.legendInit.map((x) => ({ ...x }));
loadDiagram(loadSaved() || sampleDiagram());

/* 命名欄：打字就寫進資料，存檔與匯出都用它當檔名。
   畫面那一側由 render 的 paintName 回填，這裡只管使用者打進來的字。 */
nameBox.addEventListener('input', () => { S.name = nameBox.value; touch(); render(); });
nameBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); nameBox.blur(); }
    e.stopPropagation();          // 不要讓畫布的快捷鍵吃掉這裡的按鍵
});
initKeys();
render();

/* ── 工具列 ─────────────────────────────── */
const mmBox = document.getElementById('mm');
const mmErr = document.getElementById('mmErr');
const filePick = document.getElementById('filePick');

document.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
        const a = btn.dataset.act;
        if (a === 'save') saveFile();
        if (a === 'svg') saveSVG();
        if (a === 'open') filePick.click();
        if (a === 'png') exportPNG();
        if (a === 'copy') {
            navigator.clipboard?.writeText(toMermaid());
            btn.textContent = L.btn.copied;
            setTimeout(() => { btn.textContent = L.btn.copy; }, 1200);
        }
        if (a === 'clear') {
            push();
            S.rows = []; S.blocks = [];
            S.sel = { layer: 'row', i: 0, j: 0, end: 'to', bi: 0 };
            render();
        }
    });
});

/* 圖／分割／原始碼。切到看得到原始碼時先灌一次最新內容。 */
function setView(v) {
    document.body.classList.remove('view-diagram', 'view-split', 'view-source');
    document.body.classList.add('view-' + v);
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    if (v !== 'diagram' && document.activeElement !== mmBox) mmBox.value = toMermaid();
    render();
}
document.querySelectorAll('[data-view]').forEach((b) => {
    b.addEventListener('click', () => setView(b.dataset.view));
});
setView('diagram');

/* 開啟本機 .json。讀壞了就不動現有的圖，只在狀態列報錯。 */
filePick.addEventListener('change', async () => {
    const f = filePick.files && filePick.files[0];
    filePick.value = '';
    if (!f) return;
    try {
        const d = await readFile(f);
        push();
        loadDiagram(d);
        // 檔名就是使用者給這張圖的名字，優先採用；自動產生的那種日期檔名不算
        const base = f.name.replace(/[.][^.]+$/, '').trim();
        if (base && !/^sequence-\d{8}-\d{4}$/.test(base)) S.name = base;
        nameBox.value = S.name || '';     // 焦點還留在命名欄時 render 不會回填，這裡補上
        resetSelKey();
        mmErr.textContent = '';
        render();
        showReport(d.report, f.name);
    } catch (err) {
        showFailure(err, f.name);
    }
});

const report = document.getElementById('report');
const rSum = document.getElementById('rSum');
const rBody = document.getElementById('rBody');
document.getElementById('rClose').addEventListener('click', () => { report.hidden = true; });

const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function showReport(r, name) {
    if (!r) { report.hidden = true; return; }
    rBody.innerHTML = '';
    if (r.native) {
        rSum.innerHTML = `<b>${esc(name)}</b> — ${L.msg.impNative}`;
        report.hidden = false;
        return;
    }
    const bits = [`<b>${esc(name)}</b> — ${L.msg.impOk(r)}`];
    if (r.unknown.length) bits.push(`<span class="warn">${L.msg.impUnknown(r.unknown.length)}</span>`);
    if (r.leftovers.length) bits.push(`<span class="warn">${L.msg.impLeftover(r.leftovers.length)}</span>`);
    rSum.innerHTML = bits.join(' · ');
    if (r.unknown.length || r.leftovers.length) {
        const lines = [`<div><b>${L.msg.impDetail}</b></div>`];
        r.unknown.forEach((u) => lines.push(`<div>&lt;${esc(u.what)}&gt; ${esc(u.why)} — <code>${esc(u.at)}</code></div>`));
        r.leftovers.forEach((s) => lines.push(`<div>text — <code>${esc(s)}</code></div>`));
        rBody.innerHTML = lines.join('');
    }
    report.hidden = false;
}

/* 讀失敗：把原因寫清楚，不要只說「開不起來」 */
function showFailure(err, name) {
    const key = err && err.msg;
    const why = (key && L.msg[key]) || err.message || L.msg.errFile;
    rSum.innerHTML = `<span class="warn"><b>${esc(name)}</b> — ${esc(why)}</span>`;
    rBody.innerHTML = (err && err.detail || []).map((d) => `<div><code>${esc(d)}</code></div>`).join('');
    report.hidden = false;
    mmErr.textContent = why;
}

/* Mermaid 框：邊打邊套用。打到一半當然會解析失敗，那就只顯示訊息、不動圖。 */
let srcTimer = null;
function applySrc() {
    try {
        const o = fromMermaid(mmBox.value);
        push();
        loadDiagram(o);
        resetSelKey();
        mmErr.textContent = '';
        render();
    } catch (e) {
        mmErr.textContent = e.line ? L.msg.errLine(e.line, e.msg) : String(e.message || e);
    }
}
mmBox.addEventListener('input', () => {
    clearTimeout(srcTimer);
    srcTimer = setTimeout(applySrc, 400);
});
mmBox.addEventListener('blur', () => { clearTimeout(srcTimer); applySrc(); });

document.getElementById('helpBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('help').classList.toggle('pinned');
});

/* 主題切換後 SVG 的顏色要跟著翻，theme.js 改的是 <html data-theme> */
new MutationObserver(() => render())
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

addEventListener('resize', render);

/* ── 導覽列自動收起 ──────────────────────
   這一頁要整片畫布，站上那條固定導覽列放著會一直擋住。
   10 秒沒有任何操作就往上收，滑鼠在畫面頂端停一秒、或碰到它本身才滑回來。
   不綁任何鍵盤觸發：Esc 在這一頁是退回上一層，一綁就變成每退一層導覽列彈一次。 */
const HIDE_AFTER = 10000;
let navTimer = null;

function navEl() { return document.getElementById('navbar-placeholder'); }
function showNav() {
    const n = navEl();
    if (!n) return;
    n.classList.remove('nav-tucked');
    document.body.classList.remove('nav-tuck');
    clearTimeout(navTimer);
    navTimer = setTimeout(hideNav, HIDE_AFTER);
}
function hideNav() {
    const n = navEl();
    if (!n) return;
    if (n.matches(':hover')) { showNav(); return; }      // 滑鼠停在上面就不要收
    const ov = document.getElementById('mobile-overlay');
    // navbar.html 的 overlay class 同時寫著 hidden 與 flex，要看 hidden 在不在，不能看 flex
    if (ov && !ov.classList.contains('hidden')) return;
    n.classList.add('nav-tucked');
    document.body.classList.add('nav-tuck');
}

/* 滑鼠要在畫面最上緣「停滿一秒」才把導覽列叫回來。
   滑過去、捲動都不算，不然打字打到一半它就自己冒出來。 */
const PEEK_DELAY = 1000;
let peekTimer = null;
addEventListener('mousemove', (e) => {
    const n = navEl();
    if (!n) return;
    if (e.clientY <= 48) {
        if (n.classList.contains('nav-tucked') && !peekTimer) {
            peekTimer = setTimeout(() => { peekTimer = null; showNav(); }, PEEK_DELAY);
        }
    } else if (peekTimer) {
        clearTimeout(peekTimer); peekTimer = null;
    }
}, { passive: true });


/* navbar 是 main.js 之後才 fetch 進來的，等它出現再開始倒數 */
const navWait = setInterval(() => {
    if (!navEl()?.querySelector('nav')) return;
    clearInterval(navWait);
    navEl().addEventListener('mouseenter', showNav);
    showNav();
}, 120);
setTimeout(() => clearInterval(navWait), 8000);

/* ── 問號面板：從 strings 產生，中英共用同一份版型 ── */
function buildHelp() {
    const H = L.help;
    const sec = (name, note, rows) => `
        <section>
          <div class="sh">${name}${note ? ` <b>${note}</b>` : ''}</div>
          ${rows.map(([k, d]) => `
            <div class="help-row">
              <span class="k">${kbd(k)}</span>
              <span class="d">${d}</span>
            </div>`).join('')}
        </section>`;
    document.getElementById('helpBody').innerHTML = `
        <h3>${H.head}</h3>
        <p>${H.lead}</p>
        ${sec(H.secCross, H.secCrossNote, H.rows.cross)}
        ${sec(H.secRow, H.secRowNote, H.rows.row)}
        ${sec(H.secPoint, H.secPointNote, H.rows.point)}
        ${sec(H.secBlock, H.secBlockNote, H.rows.block)}
        ${sec(H.secPart, H.secPartNote, H.rows.part)}
        ${sec(H.secAdd, '', H.rows.add)}
        <div class="help-pin">${H.pin}</div>`;
}

/* 把 "Ctrl+←→" 這種字串排成鍵帽，純文字說明（例如「刪掉一欄」）就原樣輸出 */
function kbd(s) {
    return s.split(/(\+|\s\/\s|\s／\s)/).map((piece) => {
        const t = piece.trim();
        if (!t) return '';
        if (t === '+') return '<span class="sep">+</span>';
        if (t === '/' || t === '／') return '<span class="sep">/</span>';
        if (/[一-鿿]/.test(t) || t.length > 14) return `<span class="plain">${t}</span>`;
        return `<kbd>${t}</kbd>`;
    }).join('');
}
