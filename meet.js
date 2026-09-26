// blog/meet.js
// 會議時間投票工具。命名 instance 'meet'，避免跟 main.js / whiteboard.js 的 instance 衝突。
// 資料結構與 Security Rules：jesus8745/docs/20260924_meet_firebase_spec.md

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
    getDatabase, ref, onValue, push, update, set, get, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";
import {
    getAuth, GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged,
    signInAnonymously, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

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

const app = initializeApp(firebaseConfig, 'meet');
const db = getDatabase(app);
const auth = getAuth(app);
const GOOGLE_CLIENT_ID = '619380552537-c3lnr7vsaoabdllgt7begcsk3ldhj98t.apps.googleusercontent.com';

const MAX_POLLS = 10;
const LANG = 'zh';
const T = {
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    states: { yes: '可以', notice: '需要先通知', no: '不可', pend: '還沒回' },
    loading: '載入中...',
    denied: '沒有權限讀這場會議。確認你登入的是收到邀請的那個 Google 帳號。',
    minutes: '分鐘',
    deadlineLabel: '截止',
    noDeadline: '無截止時間',
    repliedFmt: (a, b) => `${a} / ${b} 人已回覆`,
    titleRequired: '會議名稱不能空白',
    slotRequired: '至少要一個候選時段',
    quotaFull: `你同時進行中的會議已經有 ${MAX_POLLS} 場，關掉一場再開新的。`,
    createFailed: '建立失敗：',
    voteFailed: '送出失敗：',
    closed: '已結束',
    open: '收票中',
    lockedBadge: '定案',
    bestBadge: '最多人可以',
    proposedBy: (n) => `${n} 提議`,
    youProposed: '你提議',
    otherProposed: '其他人提議',
    yesCount: (a, b) => `${a}/${b} 可以`,
    answeredFmt: (a, b) => `你回覆了 ${a} / ${b} 個時段`,
    myYes: '你選「可以」的：',
    nothingPicked: '尚未選',
    lockedNote: '發起人已定案，行事曆邀請會另外寄給你。',
    verdictBest: '目前最多人可以',
    verdictLocked: '已定案',
    lockBtn: '暫停統計',
    unlockBtn: '取消定案',
    closeBtn: '刪除投票',
    reopenBtn: '重新開放',
    deleteConfirm: '再按一次刪除',
    deleteFailed: '刪除失敗：',
    deleteBtn: '刪除',
    copyBtn: '網址',
    copyShare: '複製分享網址',
    codeEmpty: '先貼上時段碼。',
    codeOk: n => `帶入 ${n} 個時段。`,
    codeError: { format: '這串不是時段碼（要 MT1. 開頭）。', signature: '簽章不符，可能複製不完整或被改過。', payload: '內容解不開，請重新產生一次。', empty: '這串碼裡面沒有時段。' },
    noteSaved: '已儲存',
    noteFailed: '存不起來：',
    leadFmt: r => `目前預計 ${r}`,
    lockedFmt: r => `已定案 ${r}`,
    leadNone: '目前預計：還沒有人回覆',
    dupSlot: '這個時段已經有了，換一個。',
    delSlot: '刪除這個時段',
    delSlotConfirm: '再按一次刪除',
    delSlotFailed: '刪不掉：',
    removeVoter: '移除',
    removeConfirm: '再按一次',
    removeFailed: '刪不掉',
    repliedSlots: n => `已回 ${n} 個時段`,
    notRepliedYet: '還沒回',
    noVoters: '還沒有人開過這個連結。',
    copyManual: '自動複製被瀏覽器擋住，請手動複製這個網址：',
    copied: '已複製',
    openPoll: '看結果',
    votingClosed: '這場會議已經結束收票。',
    deadlinePassed: '已經過了投票截止時間。',
    confirmDelete: '刪除這場會議與所有回覆，確定？',
    noPolls: '還沒有開過會議。',
    submitBtn: '送出',
    resubmitBtn: '更新我的回覆',
    submitting: '送出中…',
    pickSomething: '選好之後按送出',
    unsaved: '有還沒送出的修改',
    submittedAt: (t) => `已於 ${t} 送出`,
    canEdit: '已送出。你可以改完再按一次更新。',
    tallyFmt: (y, n, x) => `${y} 可以 · ${n} 需提前通知 · ${x} 不行`,
    joinedNone: '還沒回過任何會議。',
    joinedDeleted: '這場已經被刪掉',
    nobody: '無',
    andMore: (n) => ` …共 ${n} 人`,
    totalPeople: '人',
    defaultPlace: 'Microsoft Teams',
    homeDenied: '讀不到你的會議清單。Firebase 規則可能還沒發布。',
    guest: '訪客',
    guestBadge: '訪客',
    notSignedIn: '（未登入）',
    nameSaved: '已更新',
    nameFailed: '更新失敗：',
    anonFailed: '匿名投票啟用失敗：',
    anonNeedsConsole: '匿名投票還沒啟用：Firebase Console → Authentication → Sign-in method → 匿名 → 啟用。',
    anonCannotCreate: '匿名身分只能投票。要開會議請用 Google 登入。'
};

const STATES = ['yes', 'notice', 'no'];
const ICONS = { yes: 'fa-solid fa-check', notice: 'fa-solid fa-bell', no: 'fa-solid fa-xmark' };
const SEGCLS = { yes: 'seg-yes', notice: 'seg-notice', no: 'seg-no', pend: 'seg-pend' };
const SEGCOLOR = { yes: '#4ADE80', notice: '#FBBF24', no: '#6B7280', pend: 'rgba(255,255,255,.12)' };

// === DOM ===
const $ = (id) => document.getElementById(id);
const $state = $('mt-state');
const $home = $('view-home');
const $poll = $('view-poll');

// === 狀態 ===
const pollId = new URLSearchParams(location.search).get('id');
let me = null;
let meta = null, slots = {}, votes = {}, participants = {}, slotOwners = {}, tally = {};
let pinned = null;
// 參與者按了但還沒送出的選擇。送出之前只動這裡，不寫資料庫。
let draft = {};
// 這個身分在這場已經送出過（匿名送出後就不能再改）
let submittedOnce = false;

// === 小工具 ===
function esc(s) {
    return String(s === undefined || s === null ? '' : s)
        .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtRange(start, end) {
    const a = new Date(start), b = new Date(end);
    const mm = String(a.getMonth() + 1).padStart(2, '0');
    const dd = String(a.getDate()).padStart(2, '0');
    const hm = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return { day: `${mm}/${dd} (${T.weekdays[a.getDay()]})`, time: `${hm(a)}–${hm(b)}` };
}
function fmtDate(ms) {
    const d = new Date(ms);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
function sortedSlots() {
    return Object.entries(slots)
        .map(([id, s]) => ({ id, ...s }))
        .sort((a, b) => a.start - b.start);
}
function displayName(uid) {
    if (participants[uid] && participants[uid].name) {
        return participants[uid].name + (participants[uid].anon ? T.notSignedIn : '');
    }
    if (meta && uid === meta.organizer) return meta.organizerName || 'Organizer';
    return uid.slice(0, 6);
}
function voterUids() {
    const set = new Set(Object.keys(participants));
    Object.keys(votes).forEach(u => set.add(u));
    if (meta) set.delete(meta.organizer);   // 發起人不投票，統計一律不算他
    return [...set];
}
function voteOf(uid, slotId) {
    return (votes[uid] && votes[uid][slotId]) || null;
}
function isOrganizer() {
    return !!(me && meta && me.uid === meta.organizer);
}
function votingOpen() {
    if (!meta) return false;
    if (meta.state !== 'open') return false;
    if (meta.lockedSlot) return false;
    if (meta.deadline && meta.deadline > 0 && meta.deadline < Date.now()) return false;
    return true;
}
function showState(msg) {
    $state.textContent = msg;
    $state.classList.toggle('hidden', !msg);
}

// === 登入 ===
onAuthStateChanged(auth, (user) => {
    me = user;
    const logged = !!user;
    $('mt-login-prompt').classList.toggle('hidden', logged || !!pollId);
    $('mt-login-prompt').classList.toggle('flex', !logged && !pollId);
    $('mt-user-badge').classList.toggle('hidden', !logged);
    $('mt-user-badge').classList.toggle('flex', logged);
    if (logged) {
        $('mt-user-email').textContent = user.isAnonymous
            ? T.guestBadge
            : (user.email || user.displayName || user.uid.slice(0, 8));
    }
    authResolved = true;
    boot();
});

$('mt-logout-btn').addEventListener('click', () => {
    if (me) dropCache(me.uid);   // 換人登入不要看到上一個人的清單
    signOut(auth);
});

function onGoogleCredential(response) {
    const cred = GoogleAuthProvider.credential(response.credential);
    signInWithCredential(auth, cred).catch(err => {
        console.error('[meet] signInWithCredential failed', err);
        showState('登入失敗：' + err.message);
    });
}
function initGoogleSignIn() {
    if (!(window.google && google.accounts && google.accounts.id)) {
        setTimeout(initGoogleSignIn, 150);
        return;
    }
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogleCredential });
    const opts = { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'zh_TW' };
    if ($('mt-gis-btn')) google.accounts.id.renderButton($('mt-gis-btn'), opts);
    if ($('mt-gis-btn-gate')) google.accounts.id.renderButton($('mt-gis-btn-gate'), opts);
}
initGoogleSignIn();

// 匿名投票：身分留在這台裝置的瀏覽器裡，之後回來還是同一個訪客、可以改自己的票。
// 原本是 in-memory、關分頁即蒸發——投完隔天想改時間就變成一筆沒人動得了的幽靈票。
async function anonSignIn() {
    try {
        await setPersistence(auth, browserLocalPersistence);
        await signInAnonymously(auth);
    } catch (err) {
        console.error('[meet] anonymous sign-in failed', err);
        showState(((err.code === 'auth/operation-not-allowed' || err.code === 'auth/admin-restricted-operation') ? T.anonNeedsConsole : T.anonFailed + err.message));
    }
}
// 入口畫面的「訪客」選項：本頁唯一的匿名入口
$('mt-gate-guest').addEventListener('click', anonSignIn);

// === 啟動 ===
let booted = false;
let authResolved = false;   // 第一次 auth 回呼後才分得出「沒登入」和「還沒回來」
function boot() {
    if (!me) {
        $home.classList.add('hidden');
        // 投票頁：沒有身分就停在入口畫面（問卷名稱＋選「登入」或「訪客」）
        if (pollId) decidePollView();
        else showState('');
        return;
    }
    if (!pollId && me.isAnonymous) {
        // 匿名身分只能投票，開會議一定要 Google 帳號
        $home.classList.add('hidden');
        showState(T.anonCannotCreate);
        return;
    }
    if (pollId) {
        // 有身分了：關入口畫面、進投票畫面。規則被拒過的話 attachPublic 在這裡重試。
        attachPublic();
        decidePollView();
        return;
    }
    if (booted) return;
    booted = true;
    startHome();
}

/* ===================== A. 我的會議 ===================== */
function startHome() {
    $home.classList.remove('hidden');
    showState('');
    renderCreateSlots();

    // 先把上次看到的畫出來，畫面立刻有東西，同時標「更新中」
    const cached = readCache(me.uid);
    if (cached) {
        paintQuota(cached.active || 0);
        paintPolls(cached.list);
        setStale(true);
    } else {
        // 沒有這個帳號的快取。inline script 可能已經照上一個帳號畫了東西，先清掉。
        $('mt-my-polls').innerHTML = '';
        setStale(false);
    }

    let liveActive = cached ? (cached.active || 0) : 0;
    onValue(ref(db, `meet/users/${me.uid}/activeCount`), snap => {
        liveActive = snap.val() || 0;
        paintQuota(liveActive);
    });

    onValue(ref(db, `meet/users/${me.uid}/polls`), async snap => {
        showState('');            // 讀得到就把先前的權限錯誤訊息清掉
        const ids = Object.keys(snap.val() || {});
        // 三筆資料同時發，不要一筆等完再發下一筆（原本三個連續 await＝三趟往返）
        const rows = await Promise.all(ids.map(async id => {
            let m, v, s;
            try {
                const r = await Promise.all([
                    get(ref(db, `meet/polls/${id}/meta`)),
                    get(ref(db, `meet/polls/${id}/votes`)),
                    get(ref(db, `meet/polls/${id}/slots`)),
                ]);
                m = r[0].val(); v = r[1].val() || {}; s = r[2].val() || {};
            } catch (e) {
                return null;      // 這一場讀不到就跳過，不要讓整份清單跟著失敗
            }
            return m ? { id, meta: m, voters: Object.keys(v).length, slots: Object.keys(s).length,
                         lead: leadingSlot(s, v, m.lockedSlot, m.organizer) } : null;
        }));
        const list = rows.filter(Boolean).sort((a, b) => (b.meta.createdAt || 0) - (a.meta.createdAt || 0));
        paintPolls(list);
        setStale(false);
        writeCache(me.uid, list, liveActive);
    }, err => { setStale(false); showState(T.homeDenied + ' (' + err.code + ')'); });

    // 清單要按了才載入。回過的會議可能很多，每一場都要讀一次 meta，
    // 一進首頁就全抓會拖慢頁面，也讀了使用者當下沒有要看的東西。
    const jb = $('mt-joined-btn');
    if (jb) jb.classList.toggle('hidden', !!me.isAnonymous);
}

// 我回過的會議：從 users/<uid>/joined 拿場次，會議被刪掉的不列
let joinedAttached = false;
async function renderJoined() {
    const wrap = $('mt-joined-wrap');
    if (!wrap || me.isAnonymous || joinedAttached) return;
    joinedAttached = true;      // 匿名 uid 每次都不同，留紀錄沒有意義
    onValue(ref(db, `meet/users/${me.uid}/joined`), async snap => {
        wrap.classList.remove('hidden');
        const entries = Object.entries(snap.val() || {});
        if (!entries.length) { $('mt-joined').innerHTML = emptyJoined(); return; }
        const rows = await Promise.all(entries.map(async ([id, at]) => {
            const m = (await get(ref(db, `meet/polls/${id}/meta`))).val();
            if (!m) {
                // 會議已經被刪掉，順手把自己這筆參加紀錄清掉，免得列表點下去是死連結
                update(ref(db), { [`meet/users/${me.uid}/joined/${id}`]: null }).catch(() => {});
                return null;
            }
            return { id, meta: m, at: typeof at === 'number' ? at : 0 };
        }));
        const list = rows.filter(Boolean).sort((a, b) => b.at - a.at);
        $('mt-joined').innerHTML = list.length ? list.map(renderJoinedRow).join('') : emptyJoined();
    }, err => console.warn('[meet] joined list failed', err.code));
}

function emptyJoined() {
    return `<div class="mt-card rounded-xl px-5 py-4 font-mono text-[11px] text-gray-600">${T.joinedNone}</div>`;
}

// 按鈕在使用者資訊列右邊：第一次按才去讀資料並展開，之後純開合
$('mt-joined-btn').addEventListener('click', () => {
    const wrap = $('mt-joined-wrap');
    if (wrap.classList.contains('hidden')) {
        renderJoined();
        wrap.classList.remove('hidden');
        wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        wrap.classList.add('hidden');
    }
});

function renderJoinedRow(p) {
    const done = p.meta.state !== 'open';
    const cls = done
        ? 'bg-accent-success/15 text-accent-success border border-accent-success/30'
        : 'bg-accent-purple/15 text-accent-purple border border-accent-purple/30';
    const when = p.at
        ? `${fmtDate(p.at)} ${new Date(p.at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`
        : '—';
    return `<a href="meet.html?id=${encodeURIComponent(p.id)}" class="block mt-card rounded-xl p-4 sm:p-5 hover:border-white/10 transition">
        <div class="flex items-center gap-2 mb-1.5">
            <span class="font-mono text-[10px] text-gray-600">#${esc(p.id.slice(-6))}</span>
            <span class="font-mono text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap ${cls}">${done ? T.closed : T.open}</span>
        </div>
        <div class="text-white font-medium mb-1">${esc(p.meta.title)}</div>
        <div class="font-mono text-[11px] text-gray-500">${esc(p.meta.organizerName || '')} · ${T.submittedAt(when)}</div>
    </a>`;
}

/* ===== 首頁卡片用的「目前預計時間」：票最多的時段，定案了就顯示定案那個 ===== */
/* ---- 首頁清單快取 ----
   RTDB 的 Web SDK 沒有磁碟快取（persistence 只有 Android／iOS 有），
   分頁一關記憶體快取就沒了，所以自己留一份最後看到的清單：
   下次進來先把它畫出來，伺服器資料回來再整份覆蓋。 */
const CACHE_VER = 2;                       // 改過快取格式就加一，舊的自然失效
const cacheKey = uid => `mt-home-v${CACHE_VER}-${uid}`;
const LAST_UID_KEY = 'mt-last-uid';        // meet.html 的 inline script 靠這個知道要讀誰的快取

function readCache(uid) {
    try {
        const o = JSON.parse(localStorage.getItem(cacheKey(uid)) || 'null');
        return o && Array.isArray(o.list) ? o : null;
    } catch (e) { return null; }   // 存壞了就當作沒有，不擋畫面
}
function writeCache(uid, list, active) {
    // html 是給 inline script 用的：它沒有 renderPollRow，只能直接塞現成的字串
    try {
        localStorage.setItem(LAST_UID_KEY, uid);
        localStorage.setItem(cacheKey(uid), JSON.stringify({
            at: Date.now(), list, active, html: list.map(renderPollRow).join('')
        }));
    }
    catch (e) { /* 無痕視窗或配額滿，快取只是加速，失敗不影響功能 */ }
}
function dropCache(uid) {
    try {
        localStorage.removeItem(cacheKey(uid));
        // 也要清掉 last-uid，否則登出後 inline script 還會畫上一個人的清單
        if (localStorage.getItem(LAST_UID_KEY) === uid) localStorage.removeItem(LAST_UID_KEY);
    } catch (e) { }
}
/* 刪掉一場之後立刻把它從快取拿掉，
   免得下次進來又從快取閃一下已經不存在的會議 */
function forgetFromCache(uid, pollId) {
    const c = readCache(uid);
    if (!c) return;
    writeCache(uid, c.list.filter(p => p.id !== pollId), Math.max(0, (c.active || 0) - 1));
}

function setStale(on) {
    const el = $('mt-stale');
    if (el) el.classList.toggle('hidden', !on);
}
function paintPolls(list) {
    $('mt-my-polls').innerHTML = list.length
        ? list.map(renderPollRow).join('')
        : `<div class="text-center text-gray-600 font-mono text-sm py-8">${T.noPolls}</div>`;
}
function paintQuota(n) {
    $('mt-quota-used').textContent = n;
    $('mt-quota-bar').style.width = Math.min(100, n / MAX_POLLS * 100) + '%';
}

function leadingSlot(slotsObj, votesObj, lockedId, organizerUid) {
    const ids = Object.keys(slotsObj || {});
    if (!ids.length) return null;
    if (lockedId && slotsObj[lockedId]) return { slot: slotsObj[lockedId], locked: true };
    const voters = Object.entries(votesObj || {}).filter(e => e[0] !== organizerUid).map(e => e[1]);
    let bestId = null, by = -1, bn = -1;
    ids.sort((a, b) => slotsObj[a].start - slotsObj[b].start).forEach(id => {
        let y = 0, n = 0;
        voters.forEach(v => { if (v[id] === 'yes') y++; else if (v[id] === 'notice') n++; });
        if (y > by || (y === by && n > bn)) { by = y; bn = n; bestId = id; }
    });
    if (by <= 0 && bn <= 0) return null;
    return { slot: slotsObj[bestId], locked: false };
}

function renderPollRow(p) {
    const done = p.meta.state !== 'open';
    const cls = done
        ? 'bg-accent-success/15 text-accent-success border border-accent-success/30'
        : 'bg-accent-purple/15 text-accent-purple border border-accent-purple/30';
    const dl = p.meta.deadline ? `${T.deadlineLabel} ${fmtDate(p.meta.deadline)}` : T.noDeadline;
    const lead = p.lead
        ? (() => { const r = fmtRange(p.lead.slot.start, p.lead.slot.end); const txt = `${r.day} ${r.time}`;
                   return `<div class="font-mono text-[11px] ${p.lead.locked ? 'text-accent-success' : 'text-accent-purple'}"><i class="fa-regular fa-calendar-check mr-1.5"></i>${p.lead.locked ? T.lockedFmt(txt) : T.leadFmt(txt)}</div>`; })()
        : `<div class="font-mono text-[11px] text-gray-600"><i class="fa-regular fa-calendar mr-1.5"></i>${T.leadNone}</div>`;
    return `<div class="js-row cursor-pointer mt-card rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 hover:border-white/10 transition" data-id="${p.id}">
        <div class="min-w-[180px]">
            <div class="flex items-center gap-2 mb-1.5">
                <span class="font-mono text-[10px] text-gray-600">#${esc(p.id.slice(-6))}</span>
                <span class="font-mono text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap ${cls}">${done ? T.closed : T.open}</span>
            </div>
            <div class="text-white font-medium mb-1">${esc(p.meta.title)}</div>
            ${lead}
        </div>
        <div class="flex flex-col items-start sm:items-end gap-2 shrink-0">
            <div class="flex items-center gap-2">
            <button class="js-copy px-3 py-2 rounded-lg border border-white/10 text-[11px] font-mono text-gray-400 hover:text-white transition" data-id="${p.id}"><i class="fa-regular fa-copy mr-1"></i>${T.copyBtn}</button>
            <button class="js-del px-3 py-2 rounded-lg border border-white/10 text-[11px] font-mono text-gray-600 hover:text-red-400 transition" data-id="${p.id}"><i class="fa-regular fa-trash-can"></i></button>
            </div>
            <div class="font-mono text-[11px] text-gray-500">${p.voters} 人回覆 · ${p.slots} 個時段 · ${dl}</div>
        </div>
    </div>`;
}

// 刪一場會議要動三個地方：會議本體、我的會議清單、還在開放中的話把 activeCount 減一。
// activeCount 的規則是「只准跟現值差 ±1」，基準一定要現讀，不能拿畫面上的。
async function deletePollPayload(id) {
    const m = (await get(ref(db, `meet/polls/${id}/meta`))).val();
    const cur = (await get(ref(db, `meet/users/${me.uid}/activeCount`))).val() || 0;
    const payload = {
        [`meet/polls/${id}`]: null,
        [`meet/users/${me.uid}/polls/${id}`]: null
    };
    if (m && m.state === 'open' && cur > 0) payload[`meet/users/${me.uid}/activeCount`] = cur - 1;
    return payload;
}

$('mt-my-polls').addEventListener('click', async e => {
    const copy = e.target.closest('.js-copy');
    if (copy) {
        const url = `${location.origin}${location.pathname}?id=${copy.dataset.id}`;
        try { await navigator.clipboard.writeText(url); copy.innerHTML = T.copied; }
        catch { window.prompt('複製這個網址：', url); }
        setTimeout(() => { copy.innerHTML = `<i class="fa-regular fa-copy mr-1"></i>${T.copyBtn}`; }, 1600);
        return;
    }
    const del = e.target.closest('.js-del');
    if (del) {
        if (!window.confirm(T.confirmDelete)) return;
        const id = del.dataset.id;
        try {
            await update(ref(db), await deletePollPayload(id));
            forgetFromCache(me.uid, id);
        }
        catch (err) { window.alert('刪除失敗：' + err.message); }
        return;   // 刪掉就停在首頁，不要再往下掉進 js-row 跳進剛刪掉的會議
    }
    const row = e.target.closest('.js-row');
    if (row) location.href = `meet.html?id=${encodeURIComponent(row.dataset.id)}`;
});

// --- 建立會議 ---
$('mt-new-btn').addEventListener('click', () => {
    $('mt-create').classList.toggle('hidden');
    if (!$('mt-create').classList.contains('hidden')) $('c-title').focus();
});
$('c-cancel').addEventListener('click', () => $('mt-create').classList.add('hidden'));

function addMinutes(hhmm, mins) {
    const [h, m] = hhmm.split(':').map(Number);
    const t = (h * 60 + m + mins) % 1440;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}
function slotRowHtml(date, start, end) {
    return `<div class="flex flex-wrap items-center gap-2 js-slot-row">
        <input type="date" value="${date}" class="mt-input rounded-lg px-3 py-2 text-sm font-mono js-sd">
        <input type="time" value="${start}" class="mt-input rounded-lg px-3 py-2 text-sm font-mono js-st">
        <span class="text-gray-600 font-mono text-sm">到</span>
        <input type="time" value="${end}" class="mt-input rounded-lg px-3 py-2 text-sm font-mono js-se">
        <button class="js-rm w-9 h-9 rounded-lg border border-white/10 text-gray-600 hover:text-red-400 transition text-xs"><i class="fa-regular fa-trash-can"></i></button>
    </div>`;
}
function renderCreateSlots() {
    const d = new Date(Date.now() + 86400000);
    const iso = d.toISOString().slice(0, 10);
    const dur = Number($('c-duration').value) || 60;
    $('c-slots').innerHTML = slotRowHtml(iso, '10:00', addMinutes('10:00', dur))
                           + slotRowHtml(iso, '14:00', addMinutes('14:00', dur));
}
$('c-add-slot').addEventListener('click', () => {
    const last = $('c-slots').querySelector('.js-slot-row:last-child .js-sd');
    const d = last ? last.value : new Date().toISOString().slice(0, 10);
    const dur = Number($('c-duration').value) || 60;
    $('c-slots').insertAdjacentHTML('beforeend', slotRowHtml(d, '16:00', addMinutes('16:00', dur)));
});

// 改開始時間 → 結束時間跟著往後推一個會議長度；改長度 → 全部重算
$('c-slots').addEventListener('change', e => {
    const st = e.target.closest('.js-st');
    if (!st) return;
    const row = st.closest('.js-slot-row');
    row.querySelector('.js-se').value = addMinutes(st.value, Number($('c-duration').value) || 60);
});
$('c-duration').addEventListener('change', () => {
    const dur = Number($('c-duration').value) || 60;
    $('c-slots').querySelectorAll('.js-slot-row').forEach(row => {
        row.querySelector('.js-se').value = addMinutes(row.querySelector('.js-st').value, dur);
    });
});
$('c-slots').addEventListener('click', e => {
    const rm = e.target.closest('.js-rm');
    if (rm && $('c-slots').querySelectorAll('.js-slot-row').length > 1) rm.closest('.js-slot-row').remove();
});

$('c-submit').addEventListener('click', async () => {
    const btn = $('c-submit');
    const err = $('c-error');
    err.textContent = '';

    const title = $('c-title').value.trim();
    if (!title) { err.textContent = T.titleRequired; return; }

    const durationMin = Number($('c-duration').value);
    const rows = [...$('c-slots').querySelectorAll('.js-slot-row')];
    const slotsObj = {};
    const seen = new Set();
    for (const r of rows) {
        const d = r.querySelector('.js-sd').value;
        const t = r.querySelector('.js-st').value;
        const te = r.querySelector('.js-se').value;
        if (!d || !t || !te) continue;
        const start = new Date(`${d}T${t}`).getTime();
        let end = new Date(`${d}T${te}`).getTime();
        if (end <= start) end += 86400000;   // 跨午夜
        const sig = `${start}-${end}`;
        if (seen.has(sig)) { err.textContent = T.dupSlot; btn.disabled = false; return; }
        seen.add(sig);
        const key = push(ref(db, 'meet/tmp')).key;
        slotsObj[key] = { start, end, createdAt: serverTimestamp() };
    }
    if (!Object.keys(slotsObj).length) { err.textContent = T.slotRequired; return; }

    btn.disabled = true;
    let cur = 0;
    try {
        cur = (await get(ref(db, `meet/users/${me.uid}/activeCount`))).val() || 0;
    } catch (e1) {
        console.error('[meet] read activeCount failed', e1);
        err.textContent = T.createFailed + e1.message;
        btn.disabled = false;
        return;
    }
    if (cur >= MAX_POLLS) { err.textContent = T.quotaFull; btn.disabled = false; return; }

    const dlv = $('c-deadline').value;
    const newId = push(ref(db, 'meet/polls')).key;
    const payload = {
        [`meet/polls/${newId}/meta`]: {
            organizer: me.uid,
            organizerName: me.displayName || (me.email || '').split('@')[0] || 'Organizer',
            title,
            note: $('c-note').value.trim(),
            place: $('c-place').value.trim() || T.defaultPlace,
            durationMin,
            deadline: dlv ? new Date(`${dlv}T23:59`).getTime() : 0,
            allowGuestSlots: $('c-guest-slots').checked,
            state: 'open',
            createdAt: serverTimestamp()
        },
        [`meet/polls/${newId}/slots`]: slotsObj,
        [`meet/polls/${newId}/private/organizerNote`]: $('c-private').value.trim(),
        [`meet/users/${me.uid}/activeCount`]: cur + 1,
        [`meet/users/${me.uid}/polls/${newId}`]: true
    };

    try {
        await update(ref(db), payload);
        location.href = `meet.html?id=${newId}`;
    } catch (e2) {
        console.error('[meet] create failed', e2);
        err.textContent = T.createFailed + e2.message;
        btn.disabled = false;
    }
});

// 參與者自己改要顯示的名字（發起人看到的就是這個）
$('mt-name-save').addEventListener('click', async () => {
    const name = $('mt-name').value.trim();
    if (!name || !me || !pollId) return;
    try {
        await update(ref(db, `meet/polls/${pollId}/private/participants/${me.uid}`), participantRecord(name));
        $('mt-name-msg').textContent = T.nameSaved;
        setTimeout(() => { $('mt-name-msg').textContent = ''; }, 1600);
    } catch (err) {
        $('mt-name-msg').textContent = T.nameFailed + err.message;
    }
});

/* ===================== B. 投票頁 ===================== */
let publicAttached = false;
let loadTimer = null;
let metaLoaded = false;


// meta / slots / tally 的規則是「拿到連結就能讀」（連結 id 不可猜＝入場券），
// 所以不等登入就先把內容畫出來。votes 與 private 仍受保護，由 attachRole() 依身分掛。
function attachPublic() {
    if (publicAttached) return;
    publicAttached = true;

    // 超過 3 秒還沒有結果才顯示提示，不要一進頁面就閃一次「載入中」
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => { if (!meta) showState(T.loading); }, 3000);

    onValue(ref(db, `meet/polls/${pollId}/meta`), snap => {
        clearTimeout(loadTimer);
        meta = snap.val();
        metaLoaded = true;
        decidePollView();
    }, err => {
        // 未登入而且被拒＝規則還沒開放公開讀，不報錯，登入後由 boot() 重掛；
        // 已登入還被拒才是真的權限問題
        clearTimeout(loadTimer);
        showState('');   // 3 秒提示可能已經冒出來了，安靜等登入時不要讓它掛著
        publicAttached = false;
        if (!me) return;
        console.error('[meet] meta read failed', err);
        showState(T.denied + ' (' + err.code + ')');
    });

    onValue(ref(db, `meet/polls/${pollId}/slots`), snap => {
        slots = snap.val() || {};
        // 發起人刪掉的時段要從草稿裡拿掉。留著的話 hasUnsaved() 永遠是 true，
        // 送出時又會寫一張指向不存在時段的票，被 .validate 整包退掉。
        Object.keys(draft).forEach(id => { if (!slots[id]) delete draft[id]; });
        renderAll();
    }, () => {});

    // 統計原本掛在 attachParticipant 裡，公開之後看的人不需要身分
    onValue(ref(db, `meet/polls/${pollId}/tally`), s => { tally = s.val() || {}; renderAll(); }, () => {});
}

function attachRole() {
    if (!me || !meta) return;
    if (isOrganizer()) attachOrganizer(); else attachParticipant();
}

// 投票頁只有三種畫面，由「問卷還在不在 × 有沒有身分」決定，選定就停住不反覆跳：
// 問卷沒了 → 已被移除；沒身分 → 入口畫面（問卷名稱＋選登入或訪客）；有身分 → 投票畫面
function decidePollView() {
    if (!metaLoaded || !authResolved) return;   // 兩邊都回來才決定，避免畫面先跳一種再換
    const $gate = $('mt-gate');
    if (!meta) {
        showState('');
        $poll.classList.add('hidden');
        $gate.classList.add('hidden');
        $('mt-gone').classList.remove('hidden');
        return;
    }
    showState('');
    $('mt-gone').classList.add('hidden');
    if (!me) {
        $('mt-gate-title').textContent = meta.title || '';
        $('mt-gate-org').textContent = meta.organizerName ? '發起人：' + meta.organizerName : '';
        $poll.classList.add('hidden');
        $gate.classList.remove('hidden');
        return;
    }
    $gate.classList.add('hidden');
    $poll.classList.remove('hidden');
    attachRole();
    renderPollHeader();
    renderAll();
}

let attached = null;
function attachOrganizer() {
    if (attached === 'org') return;
    attached = 'org';
    onValue(ref(db, `meet/polls/${pollId}/votes`), s => {
        votes = s.val() || {};
        renderAll();
        syncTally();          // 發起人看得到全量票，順便把統計節點校正回真值
    });
    onValue(ref(db, `meet/polls/${pollId}/private/organizerNote`), s => {
        if (orgNoteLoaded) return;
        orgNoteLoaded = true;
        $('org-note').value = s.val() || '';
    }, () => {});
    onValue(ref(db, `meet/polls/${pollId}/private/participants`), s => { participants = s.val() || {}; renderAll(); });
    onValue(ref(db, `meet/polls/${pollId}/private/slotOwners`), s => { slotOwners = s.val() || {}; renderAll(); });
}
// 參與者那筆記錄的完整內容。匿名的人第一次寫進去就是整包，不會只有半筆。
function participantRecord(name) {
    return { name, email: me.email || '', anon: !!me.isAnonymous };
}

function attachParticipant() {
    if (attached === 'part') return;
    attached = 'part';
    // 匿名訪客先不登記。只點進來看一眼的人不該出現在發起人的名單上，
    // 等他按了「儲存名字」或按了「送出」才建立這筆。登入身分有真名，照舊即時登記。
    const initialName = me.isAnonymous
        ? `${T.guest}${me.uid.slice(0, 4)}`
        : (me.displayName || (me.email || '').split('@')[0] || T.guest);
    if (!me.isAnonymous) {
        update(ref(db, `meet/polls/${pollId}/private/participants/${me.uid}`), participantRecord(initialName))
            .catch(err => console.warn('[meet] register participant failed', err.code));
    }
    $('mt-name').value = initialName;
    $('mt-identity').classList.remove('hidden');
    $('mt-identity').classList.add('flex');
    onValue(ref(db, `meet/polls/${pollId}/votes/${me.uid}`), s => {
        const mine = s.val() || {};
        votes = { [me.uid]: mine };
        // 資料庫裡已經有票，代表送出過；草稿以資料庫為準重新鋪一次
        submittedOnce = Object.keys(mine).length > 0;
        draft = { ...mine };
        renderAll();
    });
}

// 草稿跟已送出的差異，換算成 tally 每個時段的加減
function tallyDelta() {
    if (!me) return {};
    const committed = (votes[me.uid] || {});
    const delta = {};
    const bump = (slotId, key, n) => {
        if (!delta[slotId]) delta[slotId] = { yes: 0, notice: 0, no: 0 };
        delta[slotId][key] += n;
    };
    new Set([...Object.keys(committed), ...Object.keys(draft)]).forEach(slotId => {
        const before = committed[slotId] || null;
        const after = draft[slotId] || null;
        if (before === after) return;
        if (before) bump(slotId, before, -1);
        if (after) bump(slotId, after, +1);
    });
    return delta;
}

function hasUnsaved() {
    if (!me) return false;
    const committed = (votes[me.uid] || {});
    const keys = new Set([...Object.keys(committed), ...Object.keys(draft)]);
    for (const k of keys) {
        if ((committed[k] || null) !== (draft[k] || null)) return true;
    }
    return false;
}

// 會議頁右下角的紫色分享鈕
$('p-copy').addEventListener('click', async () => {
    const btn = $('p-copy');
    const url = `${location.origin}${location.pathname}?id=${pollId}`;
    try { await navigator.clipboard.writeText(url); btn.innerHTML = T.copied; }
    catch { window.prompt(T.copyManual, url); return; }
    setTimeout(() => { btn.innerHTML = `<i class="fa-regular fa-copy mr-1.5"></i>${T.copyShare}`; }, 1600);
});

/* ===== 公司端時段碼（MT1）：驗簽 → 還原候選時段 ===== */
const SLOT_CODE_SECRET = 'MTv1-ghost-ouo-slot-bridge';
const b64urlToBytes = s => {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
};
const bytesToB64url = b => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function decodeSlotCode(raw) {
    const parts = String(raw).trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'MT1') throw new Error('format');
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(SLOT_CODE_SECRET),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const full = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(parts[1])));
    if (bytesToB64url(full.slice(0, 16)) !== parts[2]) throw new Error('signature');
    let data;
    try { data = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))); }
    catch { throw new Error('payload'); }
    if (!Array.isArray(data.s) || !data.s.length) throw new Error('empty');
    return data.s.slice(0, 20).map(p => ({ start: p[0] * 1000, end: p[1] * 1000 }));
}

const two = n => String(n).padStart(2, '0');
const dateVal = ms => { const d = new Date(ms); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
const timeVal = ms => { const d = new Date(ms); return `${two(d.getHours())}:${two(d.getMinutes())}`; };

$('c-code-apply').addEventListener('click', async () => {
    const msg = $('c-code-msg');
    const raw = $('c-code').value.trim();
    msg.className = 'font-mono text-[10px] mt-2 text-red-400';
    if (!raw) { msg.textContent = T.codeEmpty; return; }
    let list;
    try { list = await decodeSlotCode(raw); }
    catch (err) { msg.textContent = T.codeError[err.message] || T.codeError.format; return; }
    $('c-slots').innerHTML = list.map(s => slotRowHtml(dateVal(s.start), timeVal(s.start), timeVal(s.end))).join('');
    msg.className = 'font-mono text-[10px] mt-2 text-accent-success';
    msg.textContent = T.codeOk(list.length);
});

/* ===== 發起人私人備註（存在 private/，參與者讀不到） ===== */
let orgNoteLoaded = false;
$('org-note-save').addEventListener('click', async () => {
    const msg = $('org-note-msg');
    msg.textContent = '';
    try {
        await set(ref(db, `meet/polls/${pollId}/private/organizerNote`), $('org-note').value.trim());
        msg.textContent = T.noteSaved;
    } catch (err) {
        msg.textContent = T.noteFailed + err.message;
    }
    setTimeout(() => { msg.textContent = ''; }, 2500);
});

function renderPollHeader() {
    $('p-id').textContent = 'POLL #' + pollId.slice(-6).toUpperCase();
    $('p-title').textContent = meta.title || '';
    $('p-note').textContent = meta.note || '';
    const on = meta.organizerName || 'Organizer';
    $('p-org-name').textContent = on;
    $('p-org-avatar').textContent = on.slice(0, 1);
    $('p-duration').innerHTML = meta.durationMin
        ? `<i class="fa-regular fa-clock mr-1.5"></i>${meta.durationMin} ${T.minutes}` : '';
    $('p-place').innerHTML = meta.place
        ? `<i class="fa-solid fa-location-dot mr-1.5"></i>${esc(meta.place)}` : '';
    $('p-deadline').innerHTML = meta.deadline
        ? `<i class="fa-regular fa-calendar-xmark mr-1.5"></i>${T.deadlineLabel} ${fmtDate(meta.deadline)}`
        : `<i class="fa-regular fa-calendar mr-1.5"></i>${T.noDeadline}`;
}

function renderAll() {
    if (!meta) return;
    const org = isOrganizer();
    $('organizer-view').classList.toggle('hidden', !org);
    $('participant-view').classList.toggle('hidden', org);
    $('mt-role-badge').textContent = org ? '發起人' : ((me && me.isAnonymous) ? T.guestBadge : '參與者');

    const canAdd = votingOpen() && (org || meta.allowGuestSlots === true);
    $('add-slot-card').classList.toggle('hidden', !canAdd);

    const uids = voterUids();
    const replied = uids.filter(u => votes[u] && Object.keys(votes[u]).length).length;
    $('p-replied').innerHTML = org
        ? `<i class="fa-regular fa-user mr-1.5"></i>${T.repliedFmt(replied, uids.length)}`
        : '';

    $('p-copy').classList.toggle('hidden', !org);
    $('org-note-card').classList.toggle('hidden', !org);   // 分享網址只有發起人能複製
    if (org) { renderBars(); renderVoters(); } else renderCards();
    renderVerdict();
}

// --- 發起人：比例橫條 ---
function countBy(slotId, state) { return listBy(slotId, state).length; }
function listBy(slotId, state) {
    return voterUids().filter(u => (voteOf(u, slotId) || 'pend') === state);
}
function bestSlotId() {
    let best = null, ty = -1, tn = -1;
    sortedSlots().forEach(s => {
        const y = countBy(s.id, 'yes'), n = countBy(s.id, 'notice');
        if (y > ty || (y === ty && n > tn)) { ty = y; tn = n; best = s.id; }
    });
    return best;
}

// 刪掉一個候選時段要一起清乾淨：時段本身、提議人、統計、以及所有人對這個時段的票。
// 定案在這個時段的話同時取消定案。
function deleteSlotPayload(slotId) {
    const payload = {
        [`meet/polls/${pollId}/slots/${slotId}`]: null,
        [`meet/polls/${pollId}/private/slotOwners/${slotId}`]: null,
        [`meet/polls/${pollId}/tally/${slotId}`]: null
    };
    Object.keys(votes).forEach(uid => {
        if (votes[uid] && votes[uid][slotId]) {
            payload[`meet/polls/${pollId}/votes/${uid}/${slotId}`] = null;
        }
    });
    if (meta && meta.lockedSlot === slotId) {
        payload[`meet/polls/${pollId}/meta/lockedSlot`] = null;
    }
    return payload;
}

function renderBars() {
    const headcount = voterUids().length;
    const total = headcount || 1;   // 寬度用的分母保底 1，顯示的分母用真實人數
    const best = bestSlotId();
    $('slot-bars').innerHTML = sortedSlots().map(s => {
        const c = { yes: countBy(s.id, 'yes'), notice: countBy(s.id, 'notice'), no: countBy(s.id, 'no'), pend: countBy(s.id, 'pend') };
        const isBest = s.id === best && !meta.lockedSlot;
        const isLocked = s.id === meta.lockedSlot;
        const r = fmtRange(s.start, s.end);

        const segs = ['yes', 'notice', 'no', 'pend'].filter(k => c[k] > 0).map(k =>
            `<div class="seg ${SEGCLS[k]}" style="width:${c[k] / total * 100}%" data-slot="${s.id}" data-state="${k}"></div>`
        ).join('');

        const badge = isLocked
            ? `<span class="ml-2 font-mono text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap bg-accent-success/15 text-accent-success border border-accent-success/30">${T.lockedBadge}</span>`
            : (isBest ? `<span class="ml-2 font-mono text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap bg-accent-purple/15 text-accent-purple border border-accent-purple/30">${T.bestBadge}</span>` : '');

        const owner = slotOwners[s.id];
        const by = (owner && owner !== meta.organizer)
            ? `<span class="font-mono text-[9px] text-gray-600 ml-2">${esc(T.proposedBy(displayName(owner)))}</span>` : '';

        const num = k => `<span class="whitespace-nowrap" data-slot="${s.id}" data-state="${k}">
            <span class="inline-block w-2 h-2 rounded-sm align-middle mr-1" style="background:${SEGCOLOR[k]}"></span>${c[k]}</span>`;

        return `<div class="slot-row px-5 py-4 ${isBest ? 'is-best' : ''} ${isLocked ? 'is-locked' : ''}">
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2.5">
                <div><span class="text-sm text-white font-medium">${r.day}</span>
                    <span class="font-mono text-[11px] text-gray-500 ml-2">${r.time}</span>${by}${badge}</div>
                <div class="flex items-center gap-3">
                    <div class="font-mono text-sm ${isLocked ? 'text-accent-success' : (isBest ? 'text-accent-purple' : 'text-gray-400')}">${T.yesCount(c.yes, headcount)}</div>
                    <button type="button" class="js-del-slot shrink-0 px-2 py-1 rounded-full border border-white/10 text-[10px] font-mono text-gray-600 hover:text-red-300 hover:border-red-400/30 transition" data-slot="${s.id}" title="${T.delSlot}"><i class="fa-regular fa-trash-can"></i></button>
                </div>
            </div>
            <div class="bar mb-2">${segs}</div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-gray-500">
                ${num('yes')}${num('notice')}${num('no')}${num('pend')}
            </div>
        </div>`;
    }).join('');
}

// --- 名單浮層 ---
const tip = $('tip');
function showTip(slotId, state, x, y) {
    const s = slots[slotId];
    if (!s) return;
    const r = fmtRange(s.start, s.end);
    const names = listBy(slotId, state).map(displayName);
    $('tip-title').textContent = `${r.day} ${r.time}　${T.states[state]}`;
    $('tip-count').textContent = names.length + ' ' + T.totalPeople;
    const box = $('tip-names');
    box.className = 'names font-mono text-[11px] text-gray-300' + (names.length <= 8 ? ' few' : '');
    box.innerHTML = names.length
        ? names.map(n => `<span class="truncate">${esc(n)}</span>`).join('')
        : `<span class="text-gray-600">${T.nobody}</span>`;
    tip.classList.add('show');
    moveTip(x, y);
}
function moveTip(x, y) {
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y + 16;
    if (left + r.width > window.innerWidth - 10) left = window.innerWidth - r.width - 10;
    if (top + r.height > window.innerHeight - 10) top = y - r.height - 14;
    tip.style.left = Math.max(10, left) + 'px';
    tip.style.top = Math.max(10, top) + 'px';
}
function hideTip() {
    if (pinned) return;
    tip.classList.remove('show');
    document.querySelectorAll('.seg.on').forEach(e => e.classList.remove('on'));
}
const $bars = $('slot-bars');
$bars.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-state]');
    if (t && !pinned) showTip(t.dataset.slot, t.dataset.state, e.clientX, e.clientY);
});
$bars.addEventListener('mousemove', e => { if (tip.classList.contains('show') && !pinned) moveTip(e.clientX, e.clientY); });
$bars.addEventListener('mouseout', e => {
    if (!e.relatedTarget || !e.relatedTarget.closest('[data-state]')) hideTip();
});
$bars.addEventListener('click', e => {
    const t = e.target.closest('[data-state]');
    if (!t) { pinned = null; hideTip(); return; }
    const key = t.dataset.slot + ':' + t.dataset.state;
    if (pinned === key) { pinned = null; hideTip(); return; }
    pinned = null;
    showTip(t.dataset.slot, t.dataset.state, e.clientX, e.clientY);
    pinned = key;
    document.querySelectorAll('.seg.on').forEach(el => el.classList.remove('on'));
    if (t.classList.contains('seg')) t.classList.add('on');
});
document.addEventListener('click', e => { if (!e.target.closest('#slot-bars')) { pinned = null; hideTip(); } });

// --- 參與者：三選一 ---
function renderCards() {
    const committed = (me && votes[me.uid]) || {};
    const open = votingOpen();
    $('slot-cards').innerHTML = sortedSlots().map(s => {
        // 沒登入也可以按：點下去會跳出登入／匿名的選擇；匿名現在可以改自己的票
        const canVote = open;
        const mine = draft[s.id] || null;             // 畫面看草稿，不看資料庫
        const t = tally[s.id] || {};
        const counts = `<div class="font-mono text-[10px] text-gray-500 mt-2">${T.tallyFmt(t.yes || 0, t.notice || 0, t.no || 0)}</div>`;
        const r = fmtRange(s.start, s.end);
        const owner = slotOwners[s.id];
        const by = (owner && owner !== meta.organizer)
            ? `<span class="font-mono text-[9px] text-gray-600 ml-2">${me && owner === me.uid ? T.youProposed : T.otherProposed}</span>` : '';
        const locked = s.id === meta.lockedSlot
            ? `<span class="ml-2 font-mono text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap bg-accent-success/15 text-accent-success border border-accent-success/30">${T.lockedBadge}</span>` : '';
        const picks = STATES.map(k =>
            `<button class="pick ${mine === k ? 'on-' + k : ''}" data-slot="${s.id}" data-pick="${k}" ${canVote ? '' : 'disabled'}>
                <i class="${ICONS[k]}"></i>${T.states[k]}</button>`
        ).join('');
        return `<div class="px-5 py-4">
            <div class="flex items-baseline justify-between gap-3 mb-3">
                <div><span class="text-sm text-white font-medium">${r.day}</span>
                    <span class="font-mono text-[11px] text-gray-500 ml-2">${r.time}</span>${by}${locked}</div>
                ${mine ? '' : '<span class="font-mono text-[10px] text-gray-600 shrink-0">尚未回覆</span>'}
            </div>
            <div class="flex gap-2">${picks}</div>
            ${counts}
        </div>`;
    }).join('');
    renderSubmitBar();
}

// 送出列：按鈕文字與狀態說明
function renderSubmitBar() {
    const btn = $('p-submit');
    const msg = $('p-submit-msg');
    if (!btn) return;
    const dirty = hasUnsaved();
    btn.textContent = submittedOnce ? T.resubmitBtn : T.submitBtn;
    btn.classList.remove('hidden');
    btn.disabled = !votingOpen() || !dirty;
    if (dirty) msg.textContent = T.unsaved;
    else if (submittedOnce) msg.textContent = T.canEdit;
    else msg.textContent = T.pickSomething;
}

$('slot-cards').addEventListener('click', async e => {
    const btn = e.target.closest('.pick');
    if (!btn || btn.disabled) return;
    if (!me) return;   // 入口畫面選完身分才進得到這個畫面，這行只是保險
    const slotId = btn.dataset.slot;
    // 只改草稿，按送出才寫資料庫
    if (draft[slotId] === btn.dataset.pick) delete draft[slotId];
    else draft[slotId] = btn.dataset.pick;
    renderCards();
});

// --- 送出：一次 multi-path update，票、統計、紀錄同一筆寫進去 ---
$('p-submit').addEventListener('click', async () => {
    if (!me) return;   // 入口畫面選完身分才進得到這個畫面，這行只是保險
    const btn = $('p-submit');
    const msg = $('p-submit-msg');
    const delta = tallyDelta();
    if (!Object.keys(delta).length) return;

    btn.disabled = true;
    msg.textContent = T.submitting;

    const payload = {};
    // 只寫真的有變動的時段。匿名的人那條規則是 !data.exists()，
    // 把沒動過的票原值再寫一次會被擋，整包 update 一起掛掉。
    const committed = votes[me.uid] || {};
    new Set([...Object.keys(committed), ...Object.keys(draft)]).forEach(slotId => {
        const before = committed[slotId] || null;
        const after = draft[slotId] || null;
        if (before === after) return;
        payload[`meet/polls/${pollId}/votes/${me.uid}/${slotId}`] = after;
    });
    // 統計加減。規則只准每個數字跟現值差 ±1，所以基準一定要跟伺服器上的一樣——
    // 畫面上那份快取可能在別人投票或發起人校正之後就落後了，差超過 1 整包會被拒。
    let base = tally;
    try {
        base = (await get(ref(db, `meet/polls/${pollId}/tally`))).val() || {};
        tally = base;
    } catch (e) {
        console.warn('[meet] 讀不到最新統計，改用畫面上的快取', e.code);
    }
    Object.entries(delta).forEach(([slotId, d]) => {
        ['yes', 'notice', 'no'].forEach(k => {
            if (!d[k]) return;
            const cur = (base[slotId] && base[slotId][k]) || 0;
            payload[`meet/polls/${pollId}/tally/${slotId}/${k}`] = Math.max(0, cur + d[k]);
        });
    });
    // 參加紀錄只有非匿名身分寫得進去
    if (!me.isAnonymous) {
        // 用伺服器時間，不要用這台機器的鐘。規則是 newData.val() <= now，
        // 裝置的鐘只要快幾秒就會整包被拒。
        payload[`meet/users/${me.uid}/joined/${pollId}`] = serverTimestamp();
    } else {
        // 匿名的人到這一刻才算真的留下東西，這時候才登記給發起人看
        const typed = ($('mt-name').value || '').trim();
        const rec = participantRecord(typed || `${T.guest}${me.uid.slice(0, 4)}`);
        Object.entries(rec).forEach(([k, v]) => {
            payload[`meet/polls/${pollId}/private/participants/${me.uid}/${k}`] = v;
        });
    }

    try {
        await update(ref(db), payload);
        submittedOnce = true;
        msg.textContent = T.submittedAt(new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }));
        renderCards();
    } catch (err) {
        console.error('[meet] submit failed', err);
        msg.textContent = '';
        btn.disabled = false;
        window.alert(T.voteFailed + err.message);
    }
});


// 發起人專用：拿全量 votes 重算統計，跟資料庫不一致才寫回。
// 這同時補回「tally 上線前就存在的票」，也能修掉被灌大的數字。
async function syncTally() {
    if (!isOrganizer() || !meta) return;
    const want = {};
    Object.keys(slots).forEach(id => { want[id] = { yes: 0, notice: 0, no: 0 }; });
    Object.entries(votes).forEach(([uid, v]) => {
        if (uid === meta.organizer) return;
        Object.entries(v || {}).forEach(([slotId, pick]) => {
            if (want[slotId] && want[slotId][pick] !== undefined) want[slotId][pick]++;
        });
    });
    const payload = {};
    Object.entries(want).forEach(([slotId, w]) => {
        ['yes', 'notice', 'no'].forEach(k => {
            const cur = (tally[slotId] && tally[slotId][k]) || 0;
            if (cur !== w[k]) payload[`meet/polls/${pollId}/tally/${slotId}/${k}`] = w[k];
        });
    });
    if (!Object.keys(payload).length) return;
    try { await update(ref(db), payload); }
    catch (err) { console.warn('[meet] sync tally failed', err.code); }
}
// --- 結論區 ---
// --- 參與者管理（只有發起人看得到） ---
function renderVoters() {
    const uids = voterUids();
    $('voter-count').textContent = uids.length;
    $('voter-list').innerHTML = uids.length ? uids.map(u => {
        const n = votes[u] ? Object.keys(votes[u]).length : 0;
        const name = displayName(u);
        return `<div class="flex items-center gap-3 px-5 py-3">
            <span class="avatar shrink-0" style="background:#2a2a30">${esc(name.slice(0, 1))}</span>
            <span class="text-sm text-gray-300 truncate flex-1 min-w-0">${esc(name)}</span>
            <span class="font-mono text-[10px] text-gray-600 shrink-0">${n ? T.repliedSlots(n) : T.notRepliedYet}</span>
            <button type="button" class="js-del-voter shrink-0 px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-mono text-gray-500 hover:text-red-300 hover:border-red-400/30 transition" data-uid="${u}">${T.removeVoter}</button>
        </div>`;
    }).join('') : `<div class="px-5 py-4 font-mono text-[11px] text-gray-600">${T.noVoters}</div>`;
}

$('voter-list').addEventListener('click', async e => {
    const btn = e.target.closest('.js-del-voter');
    if (!btn) return;
    if (btn.dataset.armed !== '1') {
        btn.dataset.armed = '1';
        btn.textContent = T.removeConfirm;
        btn.classList.add('text-red-300', 'border-red-400/30');
        setTimeout(() => {
            if (btn.isConnected && btn.dataset.armed === '1') {
                btn.dataset.armed = '';
                btn.textContent = T.removeVoter;
                btn.classList.remove('text-red-300', 'border-red-400/30');
            }
        }, 4000);
        return;
    }
    const uid = btn.dataset.uid;
    btn.disabled = true;
    try {
        // 連他提議過的時段一起刪掉，避免匿名亂提議之後留一堆孤兒選項
        const payload = {
            [`meet/polls/${pollId}/votes/${uid}`]: null,
            [`meet/polls/${pollId}/private/participants/${uid}`]: null
        };
        Object.keys(slotOwners).forEach(slotId => {
            if (slotOwners[slotId] === uid) Object.assign(payload, deleteSlotPayload(slotId));
        });
        await update(ref(db), payload);
    } catch (err) {
        btn.disabled = false;
        btn.dataset.armed = '';
        btn.textContent = T.removeFailed;
    }
});

function renderVerdict() {
    const sid = meta.lockedSlot || bestSlotId();
    const s = slots[sid];
    if (!s) { $('verdict').innerHTML = ''; return; }
    const r = fmtRange(s.start, s.end);

    if (isOrganizer()) {
        const CAP = 10;
        const nameList = (state) => {
            const arr = listBy(sid, state).map(displayName);
            if (!arr.length) return T.nobody;
            return arr.length <= CAP ? arr.join('、') : arr.slice(0, CAP).join('、') + T.andMore(arr.length);
        };
        const lockBtn = `<button id="lock-btn" class="px-5 py-2.5 rounded-full ${meta.lockedSlot ? 'border border-white/15 text-gray-400' : 'bg-accent-purple text-black font-bold'} text-xs tracking-wide transition">${meta.lockedSlot ? T.unlockBtn : T.lockBtn}</button>`;
        // 這顆會把整場會議連同所有回覆刪掉，不可復原，所以用紅色並要按兩次
        const closeBtn = `<button id="close-btn" class="px-4 py-2.5 rounded-full border border-red-400/40 text-red-300 hover:text-red-200 hover:border-red-400/70 text-xs tracking-wide transition">${T.closeBtn}</button>`;

        $('verdict').innerHTML = `<div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-[220px] flex-1">
                <div class="font-mono text-[10px] text-accent-purple uppercase tracking-wider mb-2">${meta.lockedSlot ? T.verdictLocked : T.verdictBest}</div>
                <div class="text-xl font-bold text-white mb-3">${r.day} ${r.time}</div>
                <div class="space-y-1.5 text-xs">
                    <div class="flex gap-2"><span class="font-mono text-gray-600 w-16 shrink-0">${T.states.yes}</span><span class="text-accent-success">${esc(nameList('yes'))}</span></div>
                    <div class="flex gap-2"><span class="font-mono text-gray-600 w-16 shrink-0">${T.states.notice}</span><span class="text-accent-warn">${esc(nameList('notice'))}</span></div>
                    <div class="flex gap-2"><span class="font-mono text-gray-600 w-16 shrink-0">${T.states.no}</span><span class="text-gray-400">${esc(nameList('no'))}</span></div>
                    <div class="flex gap-2"><span class="font-mono text-gray-600 w-16 shrink-0">${T.states.pend}</span><span class="text-gray-500">${esc(nameList('pend'))}</span></div>
                </div>
            </div>
            <div class="shrink-0 flex flex-col gap-2">${lockBtn}${closeBtn}</div>
        </div>`;

        $('lock-btn').onclick = async () => {
            try {
                await update(ref(db, `meet/polls/${pollId}/meta`), { lockedSlot: meta.lockedSlot ? null : sid });
            } catch (err) { window.alert(err.message); }
        };
        const delBtn = $('close-btn');
        delBtn.onclick = async () => {
            // 第一下換成確認字樣，4 秒沒有下一步就收回，避免誤觸把整場刪掉
            if (delBtn.dataset.armed !== '1') {
                delBtn.dataset.armed = '1';
                delBtn.textContent = T.deleteConfirm;
                setTimeout(() => {
                    if (delBtn.isConnected && delBtn.dataset.armed === '1') {
                        delBtn.dataset.armed = '';
                        delBtn.textContent = T.closeBtn;
                    }
                }, 4000);
                return;
            }
            delBtn.disabled = true;
            try {
                await update(ref(db), await deletePollPayload(pollId));
                location.href = 'meet.html';
            } catch (err) {
                delBtn.disabled = false;
                delBtn.dataset.armed = '';
                delBtn.textContent = T.closeBtn;
                window.alert(T.deleteFailed + err.message);
            }
        };
        return;
    }

    const all = sortedSlots();
    // 未登入也會走到這裡（內容公開讀），還沒有身分就沒有「我的票」
    const answered = me ? all.filter(x => voteOf(me.uid, x.id)).length : 0;
    const myYes = !me ? [] : all.filter(x => voteOf(me.uid, x.id) === 'yes').map(x => {
        const rr = fmtRange(x.start, x.end); return `${rr.day} ${rr.time}`;
    });
    const body = meta.lockedSlot
        ? `<div class="text-xl font-bold text-white mb-2">${r.day} ${r.time}</div>
           <p class="text-xs text-gray-400">${T.lockedNote}</p>`
        : `<div class="text-sm text-gray-300 mb-2">${T.answeredFmt(answered, all.length)}</div>
           <p class="text-xs text-gray-500">${T.myYes}${esc(myYes.join('、') || T.nothingPicked)}</p>`;
    $('verdict').innerHTML = `<div class="font-mono text-[10px] text-accent-purple uppercase tracking-wider mb-2">${meta.lockedSlot ? T.verdictLocked : '你的回覆'}</div>${body}`;
}

// --- 提議新時段 ---
$('new-time').addEventListener('change', () => {
    $('new-end').value = addMinutes($('new-time').value, (meta && meta.durationMin) || 60);
});

// add-slot-msg 的預設提示，換時間時還原回去
const ADD_SLOT_HINT = $('add-slot-msg').textContent;
function setAddSlotMsg(text, isError) {
    const el = $('add-slot-msg');
    el.textContent = text;
    el.classList.toggle('text-red-400', !!isError);
    el.classList.toggle('text-gray-600', !isError);
}

// 改任何一個時間欄位就把重複警告清掉
['new-date', 'new-time', 'new-end'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', () => setAddSlotMsg(ADD_SLOT_HINT, false));
});

$('add-slot').addEventListener('click', async () => {
    if (!me) return;
    const d = $('new-date').value, t = $('new-time').value, te = $('new-end').value;
    if (!d || !t || !te) return;
    const start = new Date(`${d}T${t}`).getTime();
    let endMs = new Date(`${d}T${te}`).getTime();
    if (endMs <= start) endMs += 86400000;
    if (Object.values(slots).some(s2 => s2.start === start && s2.end === endMs)) {
        setAddSlotMsg(T.dupSlot, true);
        return;
    }
    const slotId = push(ref(db, `meet/polls/${pollId}/slots`)).key;
    const payload = {
        [`meet/polls/${pollId}/slots/${slotId}`]: { start, end: endMs, createdAt: serverTimestamp() },
        [`meet/polls/${pollId}/private/slotOwners/${slotId}`]: me.uid
    };
    // 提議時段也算留下東西了，匿名的人在這裡一併登記，
    // 否則發起人在比例條上只會看到「由 a1b2c3 提議」這種 uid 片段
    if (me.isAnonymous) {
        const typed = ($('mt-name').value || '').trim();
        const rec = participantRecord(typed || `${T.guest}${me.uid.slice(0, 4)}`);
        Object.entries(rec).forEach(([k, v]) => {
            payload[`meet/polls/${pollId}/private/participants/${me.uid}/${k}`] = v;
        });
    }
    try {
        await update(ref(db), payload);
        // 自己提的時段預設幫你勾「可以」，但一樣要按送出才算數
        draft[slotId] = 'yes';
        renderCards();
    }
    catch (err) {
        console.error('[meet] add slot failed', err);
        $('add-slot-msg').textContent = '加入失敗：' + err.message;
    }
});

// 發起人刪候選時段（兩段式確認）
$('slot-bars').addEventListener('click', async e => {
    const btn = e.target.closest('.js-del-slot');
    if (!btn) return;
    e.stopPropagation();
    if (btn.dataset.armed !== '1') {
        btn.dataset.armed = '1';
        btn.innerHTML = T.delSlotConfirm;
        btn.classList.add('text-red-300', 'border-red-400/30');
        setTimeout(() => {
            if (btn.isConnected && btn.dataset.armed === '1') {
                btn.dataset.armed = '';
                btn.innerHTML = '<i class="fa-regular fa-trash-can"></i>';
                btn.classList.remove('text-red-300', 'border-red-400/30');
            }
        }, 4000);
        return;
    }
    btn.disabled = true;
    try { await update(ref(db), deleteSlotPayload(btn.dataset.slot)); }
    catch (err) {
        btn.disabled = false;
        btn.dataset.armed = '';
        console.error('[meet] delete slot failed', err);
        window.alert(T.delSlotFailed + err.message);
    }
});

console.log('[meet] initialized', { app: app.name, pollId });

// 投票頁的內容不等登入：模組載入完就開始聽公開節點
if (pollId) attachPublic();
