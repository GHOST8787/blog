// Meet 的共用底座：Firebase 連線、登入動作、跨模組共用狀態、畫面工具、監聽登記表。
// meet.html 與 en/meet.html 共用同一份邏輯，語言差異全部在 strings.zh.js / strings.en.js。

// blog/meet.js
// 會議時間投票工具。命名 instance 'meet'，避免跟 main.js / whiteboard.js 的 instance 衝突。
// 資料結構與 Security Rules：jesus8745/docs/20260924_meet_firebase_spec.md

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
    getDatabase, ref, onValue, push, update, set, get, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";
export { ref, onValue, push, update, set, get, serverTimestamp };
import {
    getAuth, GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged,
    signInAnonymously, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
export { signOut, onAuthStateChanged };

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

export const app = initializeApp(firebaseConfig, 'meet');
export const db = getDatabase(app);
export const auth = getAuth(app);
export const GOOGLE_CLIENT_ID = '619380552537-c3lnr7vsaoabdllgt7begcsk3ldhj98t.apps.googleusercontent.com';

export const MAX_POLLS = 10;

// 語言字串由 app.js 在啟動時注入。ES module 匯出的是繫結不是值，所以各模組看得到更新。
export let T = {};
export let LANG = 'zh';
export function setStrings(s) { T = s.T; LANG = s.LANG; }

// 跨模組共用的可變狀態。放在物件裡，讓 core / home / poll 改到的是同一份。
export const S = {
    me: null,          // 目前登入的身分，含匿名；沒登入是 null
    meta: null,        // 這場會議的公開資料
    slots: {},         // 候選時段
    votes: {},         // 票：發起人看得到全部，參與者只看得到自己的
    participants: {},  // 回覆者名單，只有發起人讀得到
    slotOwners: {},    // 哪個時段是誰提議的
    tally: {},         // 各時段票數
    authResolved: false // 第一次登入回呼回來了沒。沒回來以前分不出「沒登入」和「還在等」
};

// 兩態：可參加 / 無法參加。2026-09-30 拿掉「需事先通知」。
// 資料庫裡在那之前寫進去的 'notice' 還在，規則的 validate 仍認 yes|notice|no，
// 所以不必重發布規則；顯示層一律把 notice 當成 no（Sunny 2026-09-30 拍板）。
export const STATES = ['yes', 'no'];
export const ICONS = { yes: 'fa-solid fa-check', no: 'fa-solid fa-xmark' };

// 舊值收斂。畫面、統計、名單全部走這支，寫入前的加減才看原始值。
export function normVote(v) { return v === 'notice' ? 'no' : (v || null); }
export function normVotes(obj) {
    const out = {};
    Object.keys(obj || {}).forEach(k => { const v = normVote(obj[k]); if (v) out[k] = v; });
    return out;
}

// === DOM ===
export const $ = (id) => document.getElementById(id);
export const $state = $('mt-state');
export const $home = $('view-home');
export const $poll = $('view-poll');

// === 狀態 ===
export const pollId = new URLSearchParams(location.search).get('id');

// === 小工具 ===
export function esc(s) {
    return String(s === undefined || s === null ? '' : s)
        .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function fmtRange(start, end) {
    const a = new Date(start), b = new Date(end);
    const hm = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return { day: `${T.fmtDay(a)} (${T.weekdays[a.getDay()]})`, time: `${hm(a)}–${hm(b)}` };
}
export function fmtDate(ms) {
    const d = new Date(ms);
    return T.fmtDay(d);
}
export function sortedSlots() {
    return Object.entries(S.slots)
        .map(([id, s]) => ({ id, ...s }))
        .sort((a, b) => a.start - b.start);
}
export function displayName(uid) {
    if (S.participants[uid] && S.participants[uid].name) {
        return S.participants[uid].name + (S.participants[uid].anon ? T.notSignedIn : '');
    }
    if (S.meta && uid === S.meta.organizer) return S.meta.organizerName || 'Organizer';
    return uid.slice(0, 6);
}
export function voterUids() {
    const set = new Set(Object.keys(S.participants));
    Object.keys(S.votes).forEach(u => set.add(u));
    if (S.meta) set.delete(S.meta.organizer);   // 發起人不投票，統計一律不算他
    return [...set];
}
export function voteOf(uid, slotId) {
    return normVote(rawVoteOf(uid, slotId));
}
// 沒收斂過的原值。只有算 tally 加減時要用它——舊的 notice 票要從 notice 那個數字扣掉。
export function rawVoteOf(uid, slotId) {
    return (S.votes[uid] && S.votes[uid][slotId]) || null;
}
export function isOrganizer() {
    return !!(S.me && S.meta && S.me.uid === S.meta.organizer);
}
export function votingOpen() {
    if (!S.meta) return false;
    if (S.meta.state !== 'open') return false;
    if (S.meta.lockedSlot) return false;
    if (S.meta.deadline && S.meta.deadline > 0 && S.meta.deadline < Date.now()) return false;
    return true;
}
export function showState(msg) {
    $state.textContent = msg;
    $state.classList.toggle('hidden', !msg);
}

export function onGoogleCredential(response) {
    const cred = GoogleAuthProvider.credential(response.credential);
    signInWithCredential(auth, cred).catch(err => {
        console.error('[meet] signInWithCredential failed', err);
        showState(T.signInFailed + err.message);
    });
}
export function initGoogleSignIn() {
    if (!(window.google && google.accounts && google.accounts.id)) {
        setTimeout(initGoogleSignIn, 150);
        return;
    }
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogleCredential });
    const opts = { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: T.gisLocale };
    if ($('mt-gis-btn')) google.accounts.id.renderButton($('mt-gis-btn'), opts);
    if ($('mt-gis-btn-gate')) google.accounts.id.renderButton($('mt-gis-btn-gate'), opts);
}

// 匿名投票：身分留在這台裝置的瀏覽器裡，之後回來還是同一個訪客、可以改自己的票。
// 原本是 in-memory、關分頁即蒸發——投完隔天想改時間就變成一筆沒人動得了的幽靈票。
export async function anonSignIn() {
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

// Google 帳號在這個工具裡的預設稱呼
export function googleName() {
    if (!S.me) return 'Organizer';
    return S.me.displayName || (S.me.email || '').split('@')[0] || 'Organizer';
}

// 上次用過的顯示名稱記在帳號上：當發起人一個、當回覆者一個，互不影響。
// 匿名訪客沒有帳號可以存，名字只留在那一場問卷裡。
let namesReady = null;
export function loadSavedNames() {
    if (!S.me || S.me.isAnonymous) { namesReady = Promise.resolve({}); return; }
    const uid = S.me.uid;
    namesReady = Promise.all([
        get(ref(db, `meet/users/${uid}/organizerName`)),
        get(ref(db, `meet/users/${uid}/participantName`))
    ]).then(([o, p]) => ({ organizerName: o.val() || '', participantName: p.val() || '' }))
      .catch(err => { console.warn('[meet] could not read the saved display names', err.code); return {}; });
}
export async function savedName(kind) {
    if (!namesReady) loadSavedNames();
    const n = await namesReady;
    return n[kind] || googleName();
}

// 把 HH:MM 加上幾分鐘，跨午夜就繞回來。建立表單與提議時段都用它。
/* 時間輸入用文字欄位，不用 <input type="time">。
   原生那個顯示 12 還是 24 小時制由瀏覽器的介面語言決定，網頁端改不了，
   而且它是分段欄位，沒辦法整串打或貼上。這裡自己解析，一律 24 小時制。
   接受 1400、14:00、14.00、9:5、全形冒號、只打小時；回傳 'HH:MM'，看不懂回 null。 */
export function parseHM(raw) {
    if (typeof raw !== 'string') return null;
    let s = raw.trim()
        // 全形數字轉半形
        .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        // 各種分隔符一律收斂成冒號：全半形冒號句點、連字號、斜線、「時」
        .replace(/[：．.\-－−—/／時點点]/g, ':')
        // 空白與「分」直接丟掉，讓 14時30分、2 30 都成立
        .replace(/[\s分]/g, '')
        .replace(/:+/g, ':')
        .replace(/:$/, '');        // 只打到 12. 或 12: 就當整點
    if (!s) return null;
    let h, m;
    const colon = s.match(/^(\d{1,2}):(\d{1,2})$/);
    if (colon) {
        h = Number(colon[1]); m = Number(colon[2]);
    } else if (/^\d{3,4}$/.test(s)) {
        h = Number(s.slice(0, s.length - 2)); m = Number(s.slice(-2));
    } else if (/^\d{1,2}$/.test(s)) {
        h = Number(s); m = 0;                      // 只打小時就當整點
    } else {
        return null;
    }
    if (h > 23 || m > 59) return null;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// 把欄位的值就地正規化並標示對錯。回傳 'HH:MM' 或 null（空白也算 null，但不標紅）
export function normalizeTime(el) {
    if (!el) return null;
    const raw = el.value.trim();
    if (!raw) { markField(el, true); return null; }
    const v = parseHM(raw);
    if (v) { el.value = v; markField(el, true); return v; }
    markField(el, false);
    return null;
}

// 把欄位標成對或錯。時間欄與日期欄共用這一支。
export function markField(el, ok) {
    if (!el) return;
    el.classList.toggle('border-red-400', !ok);
    el.setAttribute('aria-invalid', ok ? 'false' : 'true');
}

/* 日期輸入也用文字欄位，理由跟時間欄一樣：<input type="date"> 是分段欄位，
   沒辦法整串打或貼，顯示成 yyyy/mm/dd 還是 mm/dd/yyyy 由瀏覽器語言決定。
   這裡自己解析，接受 930、0930、20260930、2026-09-30、2026年9月30日、全形數字。
   4 碼以下當「今年的月日」，算出來的日子已經過了就跳明年——開會都往後排。
   回傳 'YYYY-MM-DD'，看不懂回 null。 */
export function parseDate(raw, today) {
    if (typeof raw !== 'string') return null;
    // 全形數字轉半形，各種分隔符一律收斂成斜線，再把多餘的斜線清掉
    const norm = raw.trim()
        .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/[\s\/／\-－−—.．年月日]/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^\/|\/$/g, '');
    if (!norm) return null;

    const now = today instanceof Date ? today : new Date();
    let y, mo, d;
    if (norm.includes('/')) {
        // 有分隔符就照段落讀，2026/9/30 與 2026年9月30日 都是三段
        const parts = norm.split('/');
        if (parts.some(x => !/^\d{1,4}$/.test(x))) return null;
        if (parts.length === 3) {
            [y, mo, d] = parts.map(Number);
        } else if (parts.length === 2) {
            y = now.getFullYear(); [mo, d] = parts.map(Number);
        } else {
            return null;
        }
    } else {
        if (!/^\d+$/.test(norm)) return null;
        if (norm.length === 8) {
            y = Number(norm.slice(0, 4)); mo = Number(norm.slice(4, 6)); d = Number(norm.slice(6));
        } else if (norm.length === 3 || norm.length === 4) {
            y = now.getFullYear();
            mo = Number(norm.slice(0, norm.length - 2)); d = Number(norm.slice(-2));
        } else {
            return null;
        }
    }
    if (mo < 1 || mo > 12 || d < 1) return null;
    if (y < 100) y += 2000;          // 26/9/30 這種兩碼年份

    const mk = (yy) => {
        const dt = new Date(yy, mo - 1, d);
        // new Date(2026, 1, 31) 會自己滾成 3/3，比對回去就能擋掉不存在的日子
        return (dt.getFullYear() === yy && dt.getMonth() === mo - 1 && dt.getDate() === d) ? dt : null;
    };
    let dt = mk(y);
    if (!dt) return null;
    // 只給了月日又已經過了，當作明年——開會都往後排
    const gaveYear = norm.includes('/') ? norm.split('/').length === 3 : norm.length === 8;
    if (!gaveYear) {
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (dt < midnight) {
            dt = mk(y + 1);
            if (!dt) return null;    // 2/29 碰到明年非閏年
        }
    }
    return dt.getFullYear() + '-'
        + String(dt.getMonth() + 1).padStart(2, '0') + '-'
        + String(dt.getDate()).padStart(2, '0');
}

// 把日期欄就地正規化並標對錯，順便更新旁邊那行完整日期。回傳 'YYYY-MM-DD' 或 null
// 欄位裡只顯示 MM/DD（好讀、好重打），完整的 ISO 值放 data-iso，送出時讀它。
export function normalizeDate(el) {
    if (!el) return null;
    const lab = el.parentElement && el.parentElement.querySelector('.js-dlabel');
    const paint = (v) => { if (lab) lab.textContent = v ? v.replace(/-/g, '/') : ''; };
    const raw = el.value.trim();
    if (!raw) { markField(el, true); paint(null); delete el.dataset.iso; return null; }
    const v = parseDate(raw);
    if (v) {
        el.value = v.slice(5).replace('-', '/');
        el.dataset.iso = v;
        markField(el, true); paint(v);
        return v;
    }
    markField(el, false); paint(null); delete el.dataset.iso;
    return null;
}

/* 一列格子的鍵盤行為：進去就整格選取、左右鍵跳到隔壁格、Enter 送出。
   左右鍵完全接走，格子裡不移游標——反正每次進格都是整格選取、整串重打。
   點進來時瀏覽器會在 mouseup 把游標放到點擊位置、把 select() 蓋掉，
   所以第一次 mouseup 要擋掉。 */
export function wireCellRow(cells, onEnter) {
    const list = cells.filter(Boolean);
    list.forEach((el, i) => {
        if (el.dataset.cellWired) return;
        el.dataset.cellWired = '1';
        el.addEventListener('focus', () => { el.dataset.pickAll = '1'; el.select(); });
        el.addEventListener('mouseup', (e) => {
            if (el.dataset.pickAll) { e.preventDefault(); delete el.dataset.pickAll; }
        });
        el.addEventListener('blur', () => { delete el.dataset.pickAll; });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const next = list[i + (e.key === 'ArrowRight' ? 1 : -1)];
                if (!next) return;
                e.preventDefault();
                next.focus();
            } else if (e.key === 'Enter' && onEnter) {
                e.preventDefault();
                onEnter();
            }
        });
    });
}

// 把焦點放進某一格並整格選取。加完候選之後回到開始時間那一格用的。
export function focusCell(el) {
    if (!el) return;
    el.focus();
    el.select();
}

export function addMinutes(hhmm, mins) {
    const [h, m] = hhmm.split(':').map(Number);
    const t = (h * 60 + m + mins) % 1440;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

// ── 監聽登記表 ──────────────────────────────────────
// 原本 11 個 onValue 掛上去就不管了。換身分時舊的還綁在前一個 uid 上，資料庫一直回
// 「沒權限」，而且程式以為掛過就不重掛，畫面卡在前一個人的資料。現在全部登記在這裡，
// 換身分先 dropWatches() 解除乾淨再重掛。
const watchers = [];
export function watch(path, cb, errCb) {
    const off = onValue(ref(db, path), cb, errCb || (() => {}));
    watchers.push(off);
    return off;
}
export function dropWatches() {
    while (watchers.length) {
        const off = watchers.pop();
        try { off(); } catch (e) { /* 已經解除過就算了 */ }
    }
    S.meta = null; S.slots = {}; S.votes = {};
    S.participants = {}; S.slotOwners = {}; S.tally = {};
}
