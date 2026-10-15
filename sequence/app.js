// 時序圖工具的進入點。sequence.html 與 en/sequence.html 都載這一支，語言看 <html lang> 決定。
// 這裡做四件事：挑語言字串、載入示範圖、接工具列按鈕、處理導覽列自動收起。

import * as zh from './strings.zh.js';
import * as en from './strings.en.js';
import { S, setStrings, sampleDiagram, loadDiagram, loadSaved, push, touch, saveExtra } from './state.js';
import { render, resetSelKey, ZOOM, setZoom, sv, stage } from './render.js';
import { initKeys } from './keys.js';
import { toMermaid, fromMermaid, saveFile, saveSVG, readFile, exportPNG, isPuml, currentPuml } from './io.js';
import { detect, parseSeqPuml, toPumlSeq } from './puml.js';
import { A, setAct, setActText, newActStarter } from './act.js';

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
document.getElementById('grpZoom').textContent = L.hint.zoom;
document.getElementById('grpType').textContent = L.hint.type;
document.getElementById('rClose').textContent = L.msg.impClose;
const nameBox = document.getElementById('docName');
nameBox.placeholder = L.msg.namePlaceholder;
nameBox.title = L.msg.nameTip;
buildHelp();

/* 上次留在這台電腦上的圖優先，沒有才給示範圖 */
S.legend = L.legendInit.map((x) => ({ ...x }));
const saved = loadSaved();
loadDiagram(saved || sampleDiagram());
if (saved) {
    // PUML 來的時序圖：存的是當時的 PUML 全文，照它重建，匯出才會跟當時一模一樣
    if (saved.fmt === 'puml' && saved.pumlText) {
        try { loadDiagram({ ...parseSeqPuml(saved.pumlText), name: saved.name, legend: saved.legend, autonumber: saved.autonumber }); S.fmt = 'puml'; } catch { /* 壞了就用存的資料 */ }
    }
    if (saved.actText) setAct(saved.actText, 0);
    if (saved.type === 'act') S.type = 'act';
}
if (!A.text) setAct(L.act.starter.join('\n'), 0);
saveExtra.get = () => ({
    type: S.type, fmt: S.fmt, actText: A.text, autonumber: S.autonumber,
    ...(S.fmt === 'puml' ? { pumlText: toPumlSeq() } : {}),
});

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
            navigator.clipboard?.writeText(isPuml() ? currentPuml() : toMermaid());
            btn.dataset.busy = '1';
            btn.textContent = L.btn.copied;
            // 選單一按就收起來，回饋顯示在「匯出」那顆上
            const ex = document.getElementById('ddExport');
            ex.textContent = L.btn.copied;
            setTimeout(() => { delete btn.dataset.busy; ex.textContent = L.btn.export; render(); }, 1200);   // render 會依格式把字換回來
        }
        if (a === 'clear') {
            if (S.type === 'act') { newActStarter(); render(); return; }
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
    if (v !== 'diagram' && document.activeElement !== mmBox) mmBox.value = srcText();
    // 分割時畫布只剩一半寬，預設把整張圖縮進來；只看圖時回到原尺寸
    if (v === 'split') setZoom(1, true);
    else if (v === 'diagram') setZoom(1);
    else render();
}
document.querySelectorAll('[data-view]').forEach((b) => {
    b.addEventListener('click', () => setView(b.dataset.view));
});

/* 原始碼框現在該顯示什麼：活動圖給 PUML 原文，時序圖看當初從哪種格式進來 */
const srcText = () => (S.type === 'act' ? A.text : S.fmt === 'puml' ? toPumlSeq() : toMermaid());

/* 圖種切換：兩種圖各留各的資料，切過去就是上次的樣子 */
document.querySelectorAll('[data-type]').forEach((b) => {
    b.addEventListener('click', () => setType(b.dataset.type));
});
function setType(t) {
    if (S.type === t) return;
    S.type = t;
    resetSelKey();
    mmErr.textContent = '';
    report.hidden = true;
    touch();
    render();
    if (document.activeElement !== mmBox) mmBox.value = srcText();
}

/* 縮放。按鈕走固定的級距，一定會停在 100%；
   以畫面上某一點為中心縮放：重畫後量那一點實際跑到哪，差多少就捲多少 */
const LADDER = [0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const stepZoom = (d) => (d > 0 ? LADDER.find((x) => x > ZOOM + 0.001) ?? LADDER[LADDER.length - 1]
    : [...LADDER].reverse().find((x) => x < ZOOM - 0.001) ?? LADDER[0]);
function zoomAt(z, cx, cy) {
    const r = sv.getBoundingClientRect();
    const gx = (cx - r.left) / ZOOM, gy = (cy - r.top) / ZOOM;
    setZoom(z);
    const r2 = sv.getBoundingClientRect();
    const dx = r2.left + gx * ZOOM - cx, dy = r2.top + gy * ZOOM - cy;
    (document.body.classList.contains('view-split') ? stage : window).scrollBy(dx, dy);
}
const stageCenter = () => {
    const c = stage.getBoundingClientRect();
    return [c.left + Math.min(c.width, innerWidth) / 2, Math.max(c.top, 0) + Math.min(c.height, innerHeight) / 2];
};
document.querySelectorAll('[data-zoom]').forEach((b) => {
    b.addEventListener('click', () => {
        const k = b.dataset.zoom;
        if (k === 'fit') { setZoom(1, true); return; }
        if (k === 'reset') { setZoom(1); return; }
        zoomAt(stepZoom(k === 'in' ? 1 : -1), ...stageCenter());
    });
});
document.querySelectorAll('[data-zoom-set]').forEach((b) => {
    b.addEventListener('click', () => zoomAt(+b.dataset.zoomSet, ...stageCenter()));
});
// 按住 Ctrl（Mac 是 Cmd）滾滾輪：只在圖上攔下來，其他地方照瀏覽器原本的整頁縮放
stage.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    let z = ZOOM * (e.deltaY < 0 ? 1.1 : 1 / 1.1);
    if ((ZOOM < 1 && z > 1) || (ZOOM > 1 && z < 1)) z = 1;      // 滾過 100% 先停在 100%
    zoomAt(z, e.clientX, e.clientY);
}, { passive: false });
setView('diagram');

/* ── 下拉選單（類型、匯出、縮放比例）──
   點按鈕開關；鍵盤 Enter／↓ 打開、↑↓ 選、Enter 確定、Esc 關掉。
   選單裡的按鍵不往外傳，免得畫布的快捷鍵跟著動。點選單外面就收起來。 */
const dds = [...document.querySelectorAll('.seq-bar .dd')];
function closeDd(dd) {
    dd.querySelector('.dd-menu').hidden = true;
    dd.querySelector('.dd-btn').setAttribute('aria-expanded', 'false');
}
dds.forEach((dd) => {
    const btn = dd.querySelector('.dd-btn'), menu = dd.querySelector('.dd-menu');
    const items = () => [...menu.querySelectorAll('button')];
    const open = (focusItem) => {
        dds.forEach((o) => { if (o !== dd) closeDd(o); });
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        // 手機寬時往右展開會超出畫面，放不下就改成對齊按鈕右緣
        menu.style.left = ''; menu.style.right = '';
        if (menu.getBoundingClientRect().right > innerWidth - 8) { menu.style.left = 'auto'; menu.style.right = '0'; }
        if (focusItem) (items().find((b) => b.classList.contains('on')) || items()[0]).focus();
    };
    btn.addEventListener('click', () => (menu.hidden ? open(false) : closeDd(dd)));
    btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open(true); }
        else if (e.key === 'Escape') { e.stopPropagation(); closeDd(dd); }
    });
    menu.addEventListener('click', (e) => {
        if (!e.target.closest('button')) return;
        closeDd(dd);
        document.activeElement.blur();      // 焦點還給畫布，方向鍵接著操作圖
    });
    menu.addEventListener('keydown', (e) => {
        e.stopPropagation();
        const it = items(), k = it.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            it[(k + (e.key === 'ArrowDown' ? 1 : -1) + it.length) % it.length].focus();
        } else if (e.key === 'Escape') { e.preventDefault(); closeDd(dd); btn.focus(); }
        else if (e.key === 'Tab') closeDd(dd);
    });
});
document.addEventListener('pointerdown', (e) => dds.forEach((dd) => { if (!dd.contains(e.target)) closeDd(dd); }));

/* 開啟本機 .json。讀壞了就不動現有的圖，只在狀態列報錯。 */
filePick.addEventListener('change', async () => {
    const f = filePick.files && filePick.files[0];
    filePick.value = '';
    if (!f) return;
    try {
        const d = await readFile(f);
        if (typeof d.puml === 'string') { importPuml(d.puml, f.name); return; }
        push();
        loadDiagram(d);
        S.type = 'seq';
        S.fmt = 'mermaid';
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

/* PUML 進來：先判斷是哪一種圖，時序圖轉成工具資料、活動圖整份原文交給 act.js */
function importPuml(text, fname) {
    const det = detect(text, fname);
    if (det.type === 'other') { showFailure({ message: L.msg.pumlOther(det.name || '') }, fname); return; }
    let rep;
    if (det.type === 'act') {
        setActText(text);
        S.type = 'act';
        rep = A.report;
    } else {
        const o = parseSeqPuml(text);
        o.autonumber = /^\s*autonumber\b/im.test(text);       // PUML 的 autonumber 原文照留，這裡只負責畫編號
        push();
        loadDiagram(o);
        S.type = 'seq';
        S.fmt = 'puml';
        rep = o.report;
    }
    // 時序圖有 title 就用 title 當名字（改了名字匯出時 title 那行才會跟著變），沒有才用檔名
    const base = String(fname || '').replace(/[.][^.]+$/, '').trim();
    if (base && !(det.type === 'seq' && S.name && S.puml && S.puml.hasTitle)) S.name = base;
    nameBox.value = S.name || '';
    resetSelKey();
    mmErr.textContent = '';
    touch();
    render();
    if (document.activeElement !== mmBox) mmBox.value = srcText();
    showReport(rep, fname);
}

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
    if (r.kind === 'pumlSeq' || r.kind === 'pumlAct') {
        const bits = [`<b>${esc(name)}</b> — ${r.kind === 'pumlSeq' ? L.msg.impPumlSeq(r) : L.msg.impPumlAct(r)}`];
        if (r.unknown.length) bits.push(`<span class="warn">${L.msg.impKept(r.unknown.length)}</span>`);
        rSum.innerHTML = bits.join(' · ');
        if (r.unknown.length) {
            rBody.innerHTML = `<div><b>${L.msg.impDetail}</b></div>`
                + r.unknown.map((u) => `<div>${L.msg.lineNo(u.line)} — <code>${esc(u.text)}</code></div>`).join('');
        }
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

/* 原始碼框：邊打邊套用，Mermaid 與 PUML 都吃，貼進來的是哪一種用固定規則判斷。
   打到一半當然會解析失敗，那就只顯示訊息、不動圖。 */
let srcTimer = null, pasted = false;
mmBox.addEventListener('paste', () => { pasted = true; });
function applySrc() {
    const txt = mmBox.value;
    if (txt === srcText()) return;              // 沒改東西（例如只是點進去又點出來）
    const det = detect(txt);
    const wasPasted = pasted;
    pasted = false;
    try {
        if (det.type === 'other') {
            mmErr.textContent = det.fmt === 'puml' ? L.msg.pumlOther(det.name || '') : L.msg.mermaidOther(det.name || '');
            return;
        }
        if (det.fmt === 'puml') {
            const before = S.type + S.fmt;
            let rep;
            if (det.type === 'act') { setActText(txt); S.type = 'act'; rep = A.report; }
            else { const o = parseSeqPuml(txt); o.autonumber = /^\s*autonumber\b/im.test(txt); push(); loadDiagram(o); S.type = 'seq'; S.fmt = 'puml'; rep = o.report; }
            resetSelKey();
            mmErr.textContent = '';
            touch();
            render();
            // 貼上或換了圖種／格式才跳報告，邊打邊改不要一直跳
            if (wasPasted || before !== S.type + S.fmt) showReport(rep, L.msg.pasted);
            return;
        }
        const o = fromMermaid(txt);
        push();
        loadDiagram(o);
        S.type = 'seq';
        S.fmt = 'mermaid';
        resetSelKey();
        mmErr.textContent = '';
        touch();
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
    // 兩套說明都先放好，左上角「類型」選哪一種就只露出那一套（render 的 paintChrome 切換）
    document.getElementById('helpBody').innerHTML = `
      <div data-help="seq">
        <h3>${H.head}</h3>
        <p>${H.lead}</p>
        ${sec(H.secCross, H.secCrossNote, H.rows.cross)}
        ${sec(H.secRow, H.secRowNote, H.rows.row)}
        ${sec(H.secPoint, H.secPointNote, H.rows.point)}
        ${sec(H.secBlock, H.secBlockNote, H.rows.block)}
        ${sec(H.secPart, H.secPartNote, H.rows.part)}
        ${sec(H.secAdd, '', H.rows.add)}
        <div class="help-pin">${H.pin}</div>
      </div>
      <div data-help="act" hidden>
        <h3>${H.actHead}</h3>
        <p>${H.actLead}</p>
        ${H.actSecs.map(([t, note, rows]) => sec(t, note, rows)).join('')}
        <div class="help-pin">${H.actPin}</div>
      </div>`;
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
