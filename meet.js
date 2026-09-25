// blog/meet.js
// 會議時間投票工具。命名 instance 'meet'，避免跟 main.js / whiteboard.js 的 instance 衝突。
// 資料結構與 Security Rules：jesus8745/docs/20260924_meet_firebase_spec.md

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
    getDatabase, ref, onValue, push, update, set, get, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";
import {
    getAuth, GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged,
    signInAnonymously, setPersistence, inMemoryPersistence
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
    signInFirst: '請先登入',
    loading: '載入中...',
    notFound: '找不到這場會議，可能已經被刪掉了。',
    backHome: '　正在帶你回會議清單…',
    denied: '沒有權限讀這場會議。確認你登入的是收到邀請的那個 Google 帳號。',
    minutes: '分鐘',
    deadlineLabel: '截止',
    noDeadline: '無截止',
    repliedFmt: (a, b) => `${a} / ${b} 人已回覆`,
    lockedForYou: '回覆只有發起人看得到',
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
    privacyNote: '其他人回了什麼、哪個時段最多人可以，只有發起人看得到。',
    lockedNote: '發起人已定案，行事曆邀請會另外寄給你。',
    verdictBest: '目前最多人可以',
    verdictLocked: '已定案',
    lockBtn: '就定這個時間',
    unlockBtn: '取消定案',
    closeBtn: '結束收票',
    reopenBtn: '重新開放',
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
let meta = null, slots = {}, votes = {}, participants = {}, slotOwners = {};
let pinned = null;

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
    $('mt-login-prompt').classList.toggle('hidden', logged);
    $('mt-login-prompt').classList.toggle('flex', !logged);
    $('mt-user-badge').classList.toggle('hidden', !logged);
    $('mt-user-badge').classList.toggle('flex', logged);
    if (logged) {
        $('mt-user-email').textContent = user.isAnonymous
            ? T.guestBadge
            : (user.email || user.displayName || user.uid.slice(0, 8));
        hideAuthModal();
    }
    // 匿名投票只在有 ?id= 的投票頁提供（開會議還是要 Google 帳號）
    $('mt-anon-btn').classList.toggle('hidden', logged || !pollId);
    boot();
});

$('mt-logout-btn').addEventListener('click', () => signOut(auth));

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
    if ($('mt-gis-btn-modal')) google.accounts.id.renderButton($('mt-gis-btn-modal'), opts);
}
initGoogleSignIn();

// 匿名投票：in-memory persistence，關掉分頁身分就消失，不留任何本機資料
$('mt-anon-btn').addEventListener('click', async () => {
    try {
        await setPersistence(auth, inMemoryPersistence);
        await signInAnonymously(auth);
    } catch (err) {
        console.error('[meet] anonymous sign-in failed', err);
        showState(((err.code === 'auth/operation-not-allowed' || err.code === 'auth/admin-restricted-operation') ? T.anonNeedsConsole : T.anonFailed + err.message));
    }
});

const $authModal = $('mt-auth-modal');
function showAuthModal() { $authModal.classList.add('show'); $authModal.setAttribute('aria-hidden', 'false'); }
function hideAuthModal() { $authModal.classList.remove('show'); $authModal.setAttribute('aria-hidden', 'true'); }
$('mt-auth-cancel').addEventListener('click', hideAuthModal);
$authModal.addEventListener('click', e => { if (e.target === $authModal) hideAuthModal(); });

// === 啟動 ===
let booted = false;
function boot() {
    if (!me) {
        $home.classList.add('hidden');
        $poll.classList.add('hidden');
        showState('');   // 上方登入列已經在講同一件事，這裡不重複
        return;
    }
    if (!pollId && me.isAnonymous) {
        // 匿名身分只能投票，開會議一定要 Google 帳號
        $home.classList.add('hidden');
        showState(T.anonCannotCreate);
        return;
    }
    if (booted) return;
    booted = true;
    if (pollId) startPoll();
    else startHome();
}

/* ===================== A. 我的會議 ===================== */
function startHome() {
    $home.classList.remove('hidden');
    showState('');
    renderCreateSlots();

    onValue(ref(db, `meet/users/${me.uid}/activeCount`), snap => {
        const n = snap.val() || 0;
        $('mt-quota-used').textContent = n;
        $('mt-quota-bar').style.width = Math.min(100, n / MAX_POLLS * 100) + '%';
    });

    onValue(ref(db, `meet/users/${me.uid}/polls`), async snap => {
        showState('');            // 讀得到就把先前的權限錯誤訊息清掉
        const ids = Object.keys(snap.val() || {});
        if (!ids.length) {
            $('mt-my-polls').innerHTML =
                `<div class="text-center text-gray-600 font-mono text-sm py-8">${T.noPolls}</div>`;
            return;
        }
        const rows = await Promise.all(ids.map(async id => {
            const m = (await get(ref(db, `meet/polls/${id}/meta`))).val();
            const v = (await get(ref(db, `meet/polls/${id}/votes`))).val() || {};
            const s = (await get(ref(db, `meet/polls/${id}/slots`))).val() || {};
            return m ? { id, meta: m, voters: Object.keys(v).length, slots: Object.keys(s).length,
                         lead: leadingSlot(s, v, m.lockedSlot, m.organizer) } : null;
        }));
        const list = rows.filter(Boolean).sort((a, b) => (b.meta.createdAt || 0) - (a.meta.createdAt || 0));
        $('mt-my-polls').innerHTML = list.map(renderPollRow).join('');
    }, err => showState(T.homeDenied + ' (' + err.code + ')'));
}

/* ===== 首頁卡片用的「目前預計時間」：票最多的時段，定案了就顯示定案那個 ===== */
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
                   return `<div class="font-mono text-[11px] mt-1.5 ${p.lead.locked ? 'text-accent-success' : 'text-accent-purple'}"><i class="fa-regular fa-calendar-check mr-1.5"></i>${p.lead.locked ? T.lockedFmt(txt) : T.leadFmt(txt)}</div>`; })()
        : `<div class="font-mono text-[11px] mt-1.5 text-gray-600"><i class="fa-regular fa-calendar mr-1.5"></i>${T.leadNone}</div>`;
    return `<div class="js-row cursor-pointer mt-card rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 hover:border-white/10 transition" data-id="${p.id}">
        <div class="min-w-[180px]">
            <div class="flex items-center gap-2 mb-1.5">
                <span class="font-mono text-[10px] text-gray-600">#${esc(p.id.slice(-6))}</span>
                <span class="font-mono text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap ${cls}">${done ? T.closed : T.open}</span>
            </div>
            <div class="text-white font-medium mb-1">${esc(p.meta.title)}</div>
            <div class="font-mono text-[11px] text-gray-500">${p.voters} 人回覆 · ${p.slots} 個時段 · ${dl}</div>
            ${lead}
        </div>
        <div class="flex items-center gap-2 shrink-0">
            <button class="js-copy px-3 py-2 rounded-lg border border-white/10 text-[11px] font-mono text-gray-400 hover:text-white transition" data-id="${p.id}"><i class="fa-regular fa-copy mr-1"></i>${T.copyBtn}</button>
            <button class="js-del px-3 py-2 rounded-lg border border-white/10 text-[11px] font-mono text-gray-600 hover:text-red-400 transition" data-id="${p.id}"><i class="fa-regular fa-trash-can"></i></button>
        </div>
    </div>`;
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
        const m = (await get(ref(db, `meet/polls/${id}/meta`))).val();
        const cur = (await get(ref(db, `meet/users/${me.uid}/activeCount`))).val() || 0;
        const payload = {
            [`meet/polls/${id}`]: null,
            [`meet/users/${me.uid}/polls/${id}`]: null
        };
        if (m && m.state === 'open' && cur > 0) payload[`meet/users/${me.uid}/activeCount`] = cur - 1;
        try { await update(ref(db), payload); }
        catch (err) { window.alert('刪除失敗：' + err.message); }
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
        await update(ref(db, `meet/polls/${pollId}/private/participants/${me.uid}`), { name });
        $('mt-name-msg').textContent = T.nameSaved;
        setTimeout(() => { $('mt-name-msg').textContent = ''; }, 1600);
    } catch (err) {
        $('mt-name-msg').textContent = T.nameFailed + err.message;
    }
});

/* ===================== B. 投票頁 ===================== */
function startPoll() {
    $poll.classList.remove('hidden');
    showState(T.loading);

    onValue(ref(db, `meet/polls/${pollId}/meta`), snap => {
        meta = snap.val();
        if (!meta) {
            // 會議被刪掉（或網址失效）就退回主頁，不要停在死頁面
            showState(T.notFound + T.backHome);
            $poll.classList.add('hidden');
            setTimeout(() => { location.href = 'meet.html'; }, 1800);
            return;
        }
        showState('');
        if (isOrganizer()) attachOrganizer(); else attachParticipant();
        renderPollHeader();
        renderAll();
    }, err => {
        console.error('[meet] meta read failed', err);
        showState(T.denied + ' (' + err.code + ')');
    });

    onValue(ref(db, `meet/polls/${pollId}/slots`), snap => {
        slots = snap.val() || {};
        renderAll();
    });
}

let attached = null;
function attachOrganizer() {
    if (attached === 'org') return;
    attached = 'org';
    onValue(ref(db, `meet/polls/${pollId}/votes`), s => { votes = s.val() || {}; renderAll(); });
    onValue(ref(db, `meet/polls/${pollId}/private/organizerNote`), s => {
        if (orgNoteLoaded) return;
        orgNoteLoaded = true;
        $('org-note').value = s.val() || '';
    }, () => {});
    onValue(ref(db, `meet/polls/${pollId}/private/participants`), s => { participants = s.val() || {}; renderAll(); });
    onValue(ref(db, `meet/polls/${pollId}/private/slotOwners`), s => { slotOwners = s.val() || {}; renderAll(); });
}
function attachParticipant() {
    if (attached === 'part') return;
    attached = 'part';
    // 讓發起人知道我是誰（這個節點參與者寫得進去、讀不回來）
    const initialName = me.isAnonymous
        ? `${T.guest}${me.uid.slice(0, 4)}`
        : (me.displayName || (me.email || '').split('@')[0] || T.guest);
    update(ref(db, `meet/polls/${pollId}/private/participants/${me.uid}`), {
        name: initialName,
        email: me.email || '',
        anon: !!me.isAnonymous
    }).catch(err => console.warn('[meet] register participant failed', err.code));
    $('mt-name').value = initialName;
    $('mt-identity').classList.remove('hidden');
    $('mt-identity').classList.add('flex');
    update(ref(db, `meet/users/${me.uid}/joined`), { [pollId]: true })
        .catch(err => console.warn('[meet] mark joined failed', err.code));

    onValue(ref(db, `meet/polls/${pollId}/votes/${me.uid}`), s => {
        votes = { [me.uid]: s.val() || {} };
        renderAll();
    });
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
    $('mt-role-badge').textContent = org ? '發起人' : (me.isAnonymous ? T.guestBadge : '參與者');

    const canAdd = votingOpen() && (org || meta.allowGuestSlots === true);
    $('add-slot-card').classList.toggle('hidden', !canAdd);

    const uids = voterUids();
    const replied = uids.filter(u => votes[u] && Object.keys(votes[u]).length).length;
    $('p-replied').innerHTML = org
        ? `<i class="fa-regular fa-user mr-1.5"></i>${T.repliedFmt(replied, uids.length)}`
        : `<i class="fa-solid fa-lock mr-1.5"></i>${T.lockedForYou}`;

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
                <div class="font-mono text-sm ${isLocked ? 'text-accent-success' : (isBest ? 'text-accent-purple' : 'text-gray-400')}">${T.yesCount(c.yes, headcount)}</div>
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
    const canVote = votingOpen();
    $('slot-cards').innerHTML = sortedSlots().map(s => {
        const mine = voteOf(me.uid, s.id);
        const r = fmtRange(s.start, s.end);
        const owner = slotOwners[s.id];
        const by = (owner && owner !== meta.organizer)
            ? `<span class="font-mono text-[9px] text-gray-600 ml-2">${owner === me.uid ? T.youProposed : T.otherProposed}</span>` : '';
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
        </div>`;
    }).join('');
}

$('slot-cards').addEventListener('click', async e => {
    const btn = e.target.closest('.pick');
    if (!btn || btn.disabled) return;
    if (!me) { showAuthModal(); return; }
    const slotId = btn.dataset.slot;
    const val = (voteOf(me.uid, slotId) === btn.dataset.pick) ? null : btn.dataset.pick;
    try {
        await update(ref(db, `meet/polls/${pollId}/votes/${me.uid}`), { [slotId]: val });
    } catch (err) {
        console.error('[meet] vote failed', err);
        window.alert(T.voteFailed + err.message);
    }
});

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
        await update(ref(db), {
            [`meet/polls/${pollId}/votes/${uid}`]: null,
            [`meet/polls/${pollId}/private/participants/${uid}`]: null
        });
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
        const closeBtn = `<button id="close-btn" class="px-4 py-2.5 rounded-full border border-white/15 text-gray-400 hover:text-white text-xs tracking-wide transition">${meta.state === 'open' ? T.closeBtn : T.reopenBtn}</button>`;

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
        $('close-btn').onclick = async () => {
            const open = meta.state === 'open';
            const cur = (await get(ref(db, `meet/users/${me.uid}/activeCount`))).val() || 0;
            const payload = { [`meet/polls/${pollId}/meta/state`]: open ? 'closed' : 'open' };
            payload[`meet/users/${me.uid}/activeCount`] = open ? Math.max(0, cur - 1) : cur + 1;
            try { await update(ref(db), payload); } catch (err) { window.alert(err.message); }
        };
        return;
    }

    const all = sortedSlots();
    const answered = all.filter(x => voteOf(me.uid, x.id)).length;
    const myYes = all.filter(x => voteOf(me.uid, x.id) === 'yes').map(x => {
        const rr = fmtRange(x.start, x.end); return `${rr.day} ${rr.time}`;
    });
    const body = meta.lockedSlot
        ? `<div class="text-xl font-bold text-white mb-2">${r.day} ${r.time}</div>
           <p class="text-xs text-gray-400">${T.lockedNote}</p>`
        : `<div class="text-sm text-gray-300 mb-2">${T.answeredFmt(answered, all.length)}</div>
           <p class="text-xs text-gray-500">${T.myYes}${esc(myYes.join('、') || T.nothingPicked)}</p>
           <p class="text-[11px] text-gray-600 font-mono mt-3"><i class="fa-solid fa-lock mr-1.5"></i>${T.privacyNote}</p>`;
    $('verdict').innerHTML = `<div class="font-mono text-[10px] text-accent-purple uppercase tracking-wider mb-2">${meta.lockedSlot ? T.verdictLocked : '你的回覆'}</div>${body}`;
}

// --- 提議新時段 ---
$('new-time').addEventListener('change', () => {
    $('new-end').value = addMinutes($('new-time').value, (meta && meta.durationMin) || 60);
});
$('add-slot').addEventListener('click', async () => {
    const d = $('new-date').value, t = $('new-time').value, te = $('new-end').value;
    if (!d || !t || !te) return;
    const start = new Date(`${d}T${t}`).getTime();
    let endMs = new Date(`${d}T${te}`).getTime();
    if (endMs <= start) endMs += 86400000;
    if (Object.values(slots).some(s2 => s2.start === start && s2.end === endMs)) {
        $('add-slot-msg').textContent = T.dupSlot;
        return;
    }
    const slotId = push(ref(db, `meet/polls/${pollId}/slots`)).key;
    const payload = {
        [`meet/polls/${pollId}/slots/${slotId}`]: { start, end: endMs, createdAt: serverTimestamp() },
        [`meet/polls/${pollId}/private/slotOwners/${slotId}`]: me.uid,
        [`meet/polls/${pollId}/votes/${me.uid}/${slotId}`]: 'yes'
    };
    try { await update(ref(db), payload); }
    catch (err) {
        console.error('[meet] add slot failed', err);
        $('add-slot-msg').textContent = '加入失敗：' + err.message;
    }
});

console.log('[meet] initialized', { app: app.name, pollId });
