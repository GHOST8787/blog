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

export const STATES = ['yes', 'notice', 'no'];
export const ICONS = { yes: 'fa-solid fa-check', notice: 'fa-solid fa-bell', no: 'fa-solid fa-xmark' };
export const SEGCLS = { yes: 'seg-yes', notice: 'seg-notice', no: 'seg-no', pend: 'seg-pend' };
export const SEGCOLOR = { yes: '#4ADE80', notice: '#FBBF24', no: '#6B7280', pend: 'rgba(255,255,255,.12)' };

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

$('mt-logout-btn').addEventListener('click', () => {
    if (S.me) dropCache(S.me.uid);   // 換人登入不要看到上一個人的清單
    signOut(auth);
});

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
