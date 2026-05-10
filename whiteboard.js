// blog/whiteboard.js
// 用命名 instance 'whiteboard' 避免跟 main.js 既有 default Firebase instance 衝突。
// （main.js 已 init 但沒 export，本檔自己 init 同 config 不會出錯。）

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
    getDatabase, ref, onValue, push, runTransaction, update, serverTimestamp, get
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";
import {
    getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
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

const app = initializeApp(firebaseConfig, 'whiteboard');
const db = getDatabase(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// === DOM refs ===
const $approved = document.getElementById('wb-approved');
const $done = document.getElementById('wb-done');
const $approvedCount = document.getElementById('approved-count');
const $doneCount = document.getElementById('done-count');
const $stats = document.getElementById('wb-stats');
const $loginBtn = document.getElementById('wb-login-btn');
const $userBadge = document.getElementById('wb-user-badge');
const $userEmail = document.getElementById('wb-user-email');
const $logoutBtn = document.getElementById('wb-logout-btn');

// === Helpers ===
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
    );
}
function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}/${day}`;
}
function pad3(n) { return String(n).padStart(3, '0'); }

// === Auth state ===
let currentUser = null;
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
        $loginBtn.classList.add('hidden');
        $loginBtn.classList.remove('flex');
        $userBadge.classList.remove('hidden');
        $userBadge.classList.add('flex');
        $userEmail.textContent = user.email || user.displayName || user.uid.slice(0, 8);
    } else {
        $loginBtn.classList.remove('hidden');
        $loginBtn.classList.add('flex');
        $userBadge.classList.add('hidden');
        $userBadge.classList.remove('flex');
    }
    // 重新觸發 approved render（讓 likedBy 狀態跟著 currentUser 變化）
    if (window.__wbApprovedSnap) renderApproved(window.__wbApprovedSnap);
});

$loginBtn.addEventListener('click', async () => {
    try {
        await signInWithPopup(auth, provider);
    } catch (err) {
        console.error('[whiteboard] login failed', err);
        if (err.code !== 'auth/popup-closed-by-user') alert('登入失敗：' + err.message);
    }
});
$logoutBtn.addEventListener('click', () => signOut(auth));

// === Auth modal（未登入要互動時跳）===
const $authModal = document.getElementById('wb-auth-modal');
const $authModalLogin = document.getElementById('wb-auth-modal-login');
const $authModalCancel = document.getElementById('wb-auth-modal-cancel');

function showAuthModal() {
    $authModal.classList.add('show');
    $authModal.setAttribute('aria-hidden', 'false');
}
function hideAuthModal() {
    $authModal.classList.remove('show');
    $authModal.setAttribute('aria-hidden', 'true');
}
$authModalLogin.addEventListener('click', () => {
    hideAuthModal();
    $loginBtn.click();
});
$authModalCancel.addEventListener('click', hideAuthModal);
$authModal.addEventListener('click', (e) => { if (e.target === $authModal) hideAuthModal(); });

console.log('[whiteboard] initialized', { app: app.name });

// Stub done 區（Task 8 會覆寫）
$done.innerHTML = '<div class="text-center text-gray-500 font-mono text-sm py-6">尚未串接（待 Task 8）</div>';
$doneCount.textContent = '— 則';

// === 大小階梯（依 likes 決定卡片大小）===
function sizeClassFor(likes) {
    if (likes >= 30) return { size: 'hero', col: 'md:col-span-8', row: 'md:row-span-3' };
    if (likes >= 20) return { size: 'xl',   col: 'md:col-span-4', row: 'md:row-span-2' };
    if (likes >= 10) return { size: 'lg',   col: 'md:col-span-4', row: 'md:row-span-1' };
    if (likes >= 5)  return { size: 'md',   col: 'md:col-span-6', row: 'md:row-span-1' };
    if (likes >= 2)  return { size: 'sm',   col: 'md:col-span-3', row: 'md:row-span-1' };
    return                  { size: 'xs',   col: 'md:col-span-3', row: 'md:row-span-1' };
}

// === renderApproved ===
function renderApproved(snapshot) {
    window.__wbApprovedSnap = snapshot;  // 給 auth state 變化時 re-render 用
    const data = snapshot.val() || {};
    const items = Object.entries(data)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => (b.likes || 0) - (a.likes || 0));

    if (items.length === 0) {
        $approved.innerHTML = '<div class="col-span-12 text-center text-gray-500 font-mono text-sm py-12">許願池還是空的，當第一個許願的人吧</div>';
        $approvedCount.textContent = '0 則';
        return;
    }

    const uid = currentUser ? currentUser.uid : null;
    const html = items.map((item, idx) => {
        const likes = item.likes || 0;
        const { size, col, row } = sizeClassFor(likes);
        const isKing = idx === 0 && likes >= 5;
        const liked = uid && item.likedBy && item.likedBy[uid] === true;

        return `
            <article class="battle ${col} ${row} ${isKing ? 'king' : ''}" data-id="${item.id}">
                <p class="size-${size}">${escapeHtml(item.text)}</p>
                <div class="flex items-center justify-between mt-3 relative z-10">
                    <div class="flex items-center gap-2">
                        <span class="idea-badge">#${pad3(item.number || 0)}</span>
                        <span class="idea-date">${formatDate(item.approvedAt || item.createdAt)}</span>
                    </div>
                    <button class="heart-btn ${liked ? 'liked' : ''}" data-id="${item.id}" data-liked="${liked ? '1' : '0'}">
                        <i class="${liked ? 'fas' : 'far'} fa-heart heart-icon"></i>
                        <span class="num">${likes}</span>
                    </button>
                </div>
            </article>
        `;
    }).join('');

    $approved.innerHTML = html;
    $approvedCount.textContent = `${items.length} 則 · 排序依愛心數`;
}

// 啟動 listener
const approvedRef = ref(db, 'whiteboard/approved');
onValue(approvedRef, renderApproved, (err) => {
    console.error('[whiteboard] approved listen failed', err);
    $approved.innerHTML = '<div class="col-span-12 text-center text-red-400 font-mono text-sm py-12">載入失敗：' + escapeHtml(err.message) + '</div>';
});

console.log('[whiteboard] approved listener attached');
