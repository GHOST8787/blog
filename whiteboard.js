// blog/whiteboard.js
// 用命名 instance 'whiteboard' 避免跟 main.js 既有 default Firebase instance 衝突。
// （main.js 已 init 但沒 export，本檔自己 init 同 config 不會出錯。）

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
    getDatabase, ref, onValue, push, runTransaction, update, serverTimestamp, get
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";
import {
    getAuth, GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged
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

const ADMIN_UID = 'qIjxHkkrmhNjAe1On8JHxCnFIB42';
const GOOGLE_CLIENT_ID = '619380552537-c3lnr7vsaoabdllgt7begcsk3ldhj98t.apps.googleusercontent.com';

// === DOM refs ===
const $approved = document.getElementById('wb-approved');
const $done = document.getElementById('wb-done');
const $approvedCount = document.getElementById('approved-count');
const $doneCount = document.getElementById('done-count');
const $stats = document.getElementById('wb-stats');
const $loginPrompt = document.getElementById('wb-login-prompt');
const $userBadge = document.getElementById('wb-user-badge');
const $userEmail = document.getElementById('wb-user-email');
const $adminLink = document.getElementById('wb-admin-link');
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
        $loginPrompt.classList.add('hidden');
        $loginPrompt.classList.remove('flex');
        $userBadge.classList.remove('hidden');
        $userBadge.classList.add('flex');
        $userEmail.textContent = user.email || user.displayName || user.uid.slice(0, 8);
        hideAuthModal();  // 登入成功時關掉「需要登入」提示 modal
        // Admin 連結只給站長看到
        if (user.uid === ADMIN_UID) {
            $adminLink.classList.remove('hidden');
        } else {
            $adminLink.classList.add('hidden');
        }
    } else {
        $loginPrompt.classList.remove('hidden');
        $loginPrompt.classList.add('flex');
        $userBadge.classList.add('hidden');
        $userBadge.classList.remove('flex');
        $adminLink.classList.add('hidden');
    }
    // 重新觸發 approved / done render（讓 likedBy 狀態跟著 currentUser 變化）
    if (window.__wbApprovedSnap) renderApproved(window.__wbApprovedSnap);
    if (window.__wbDoneSnap) renderDone(window.__wbDoneSnap);
});

$logoutBtn.addEventListener('click', () => signOut(auth));

// === Google Identity Services（頁面內登入，不跳 firebaseapp.com，不依賴跨網域 cookie）===
function onGoogleCredential(response) {
    const cred = GoogleAuthProvider.credential(response.credential);
    signInWithCredential(auth, cred).catch(err => {
        console.error('[whiteboard] signInWithCredential failed', err);
        alert('登入失敗：' + err.message);
    });
}

function initGoogleSignIn() {
    // GIS script 是 async 載入，沒載完就稍後重試
    if (!(window.google && google.accounts && google.accounts.id)) {
        setTimeout(initGoogleSignIn, 150);
        return;
    }
    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: onGoogleCredential,
    });
    const opts = { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'zh_TW' };
    const barSlot = document.getElementById('wb-gis-btn');
    const modalSlot = document.getElementById('wb-gis-btn-modal');
    if (barSlot) google.accounts.id.renderButton(barSlot, opts);
    if (modalSlot) google.accounts.id.renderButton(modalSlot, opts);
}
initGoogleSignIn();

// === Auth modal（未登入要互動時跳）===
const $authModal = document.getElementById('wb-auth-modal');
const $authModalCancel = document.getElementById('wb-auth-modal-cancel');

function showAuthModal() {
    $authModal.classList.add('show');
    $authModal.setAttribute('aria-hidden', 'false');
}
function hideAuthModal() {
    $authModal.classList.remove('show');
    $authModal.setAttribute('aria-hidden', 'true');
}
$authModalCancel.addEventListener('click', hideAuthModal);
$authModal.addEventListener('click', (e) => { if (e.target === $authModal) hideAuthModal(); });

console.log('[whiteboard] initialized', { app: app.name });

// === Done 區（已實作）===
const titleCache = {};

async function getTitleFromHtml(url) {
    if (titleCache[url]) return titleCache[url];
    const ssKey = `wb:title:${url}`;
    const cached = sessionStorage.getItem(ssKey);
    if (cached) { titleCache[url] = cached; return cached; }
    try {
        const r = await fetch(url);
        if (!r.ok) return null;
        const html = await r.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const h1 = doc.querySelector('header h1');
        const title = h1 ? h1.innerText.trim().replace(/\s+/g, ' ') : null;
        if (title) {
            titleCache[url] = title;
            sessionStorage.setItem(ssKey, title);
        }
        return title;
    } catch (err) {
        console.warn('[whiteboard] fetch title failed', url, err);
        return null;
    }
}

function isInternalLink(url) {
    if (!url) return false;
    if (/^https?:\/\//i.test(url)) return false;
    return /(?:^|\/)(?:EXP\/)?(?:project|article)_\d+\.html$/.test(url);
}

async function renderDoneItem(item, uid) {
    const display = escapeHtml(item.title || item.text || '');
    const meta = `#${pad3(item.number || 0)} · DONE ${formatDate(item.doneAt)}`;
    const likes = item.likes || 0;
    const liked = uid && item.likedBy && item.likedBy[uid] === true;
    // 已實作的愛心：登入後可按，僅累計數字、不影響排序（done 永遠按 doneAt desc）
    const heartHtml = `
        <button class="heart-btn done-heart ${liked ? 'liked' : ''}" data-id="${item.id}" data-liked="${liked ? '1' : '0'}" aria-label="愛心">
            <i class="${liked ? 'fas' : 'far'} fa-heart heart-icon"></i>
            <span class="num">${likes}</span>
        </button>
    `;

    if (!item.linkUrl) {
        return `
            <div class="done-row">
                <div class="check"><i class="fas fa-check"></i></div>
                <div class="text">${display}</div>
                <div class="meta">${meta}</div>
                ${heartHtml}
            </div>
        `;
    }
    let label = '→ 開啟連結 ↗';
    if (isInternalLink(item.linkUrl)) {
        const title = await getTitleFromHtml(item.linkUrl);
        if (title) label = `→ ${escapeHtml(title)} ↗`;
    }
    const safeUrl = escapeHtml(item.linkUrl);
    const isExternal = /^https?:\/\//i.test(item.linkUrl);
    const target = isExternal ? ' target="_blank" rel="noopener"' : '';
    return `
        <a href="${safeUrl}"${target} class="done-row linked">
            <div class="check"><i class="fas fa-check"></i></div>
            <div class="text">${display} <span class="text-accent-purple/70">${label}</span></div>
            <div class="meta">${meta}</div>
            ${heartHtml}
        </a>
    `;
}

async function renderDone(snapshot) {
    window.__wbDoneSnap = snapshot;  // 給 auth state 變化時 re-render 用
    const data = snapshot.val() || {};
    const items = Object.entries(data)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

    if (items.length === 0) {
        $done.innerHTML = '<div class="text-center text-gray-500 font-mono text-sm py-6">還沒有想法畢業，敬請期待</div>';
        $doneCount.textContent = '0 則';
        return;
    }

    const uid = currentUser ? currentUser.uid : null;
    const htmls = await Promise.all(items.map(item => renderDoneItem(item, uid)));
    $done.innerHTML = htmls.join('');
    $doneCount.textContent = `${items.length} 則 · 從許願池畢業`;
    updateStats();
}

// 已實作區的愛心點擊（用事件委派，且阻止外層 a tag 跳 link）
$done.addEventListener('click', async (e) => {
    const btn = e.target.closest('.heart-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    return await handleHeartClick(btn, 'whiteboard/done');
});

// === 底部統計 ===
function updateStats() {
    const a = $approved.querySelectorAll('.battle').length;
    const d = $done.querySelectorAll('.done-row').length;
    $stats.textContent = `目前 ${a} 則許願 · ${d} 則已實作`;
}

const doneRef = ref(db, 'whiteboard/done');
onValue(doneRef, renderDone, (err) => {
    console.error('[whiteboard] done listen failed', err);
    $done.innerHTML = '<div class="text-center text-red-400 font-mono text-sm py-6">載入失敗：' + escapeHtml(err.message) + '</div>';
});

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

        // 卡片只顯示 title 大字（fallback 到 text 兼容舊資料）
        const display = item.title || item.text || '';
        const hasNote = item.text && item.text.trim().length > 0 && item.title;
        return `
            <article class="battle ${col} ${row} ${isKing ? 'king' : ''}" data-id="${item.id}" role="button" tabindex="0">
                <p class="size-${size}">${escapeHtml(display)}</p>
                <div class="flex items-center justify-between mt-3 relative z-10">
                    <div class="flex items-center gap-2">
                        <span class="idea-badge">#${pad3(item.number || 0)}</span>
                        <span class="idea-date">${formatDate(item.approvedAt || item.createdAt)}</span>
                        ${hasNote ? '<span class="text-gray-600 text-[10px] font-mono">+ note</span>' : ''}
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
    updateStats();
}

// 啟動 listener
const approvedRef = ref(db, 'whiteboard/approved');
onValue(approvedRef, renderApproved, (err) => {
    console.error('[whiteboard] approved listen failed', err);
    $approved.innerHTML = '<div class="col-span-12 text-center text-red-400 font-mono text-sm py-12">載入失敗：' + escapeHtml(err.message) + '</div>';
});

console.log('[whiteboard] approved listener attached');

// === 投稿 modal ===
const $fab = document.getElementById('wb-fab');
const $modal = document.getElementById('wb-modal');
const $modalTitleInput = document.getElementById('wb-modal-title-input');
const $modalTitleCounter = document.getElementById('wb-modal-title-counter');
const $modalText = document.getElementById('wb-modal-text');
const $modalCounter = document.getElementById('wb-modal-counter');
const $modalError = document.getElementById('wb-modal-error');
const $modalSubmit = document.getElementById('wb-modal-submit');
const $modalCancel = document.getElementById('wb-modal-cancel');

function openModal() {
    $modalTitleInput.value = '';
    $modalText.value = '';
    $modalText.disabled = false;
    $modalError.textContent = '';
    $modalTitleCounter.textContent = '0 / 60';
    $modalTitleCounter.style.color = '#666';
    $modalCounter.textContent = '0 / 500';
    $modalCounter.style.color = '#666';
    $modalSubmit.disabled = false;
    $modalSubmit.textContent = '送審';
    $modal.classList.add('show');
    $modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => $modalTitleInput.focus(), 50);
}
function closeModal() {
    $modal.classList.remove('show');
    $modal.setAttribute('aria-hidden', 'true');
}

// FAB 點擊：未登入跳 auth modal，已登入直接開投稿 modal
$fab.addEventListener('click', () => {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    openModal();
});
$modalCancel.addEventListener('click', closeModal);
$modal.addEventListener('click', (e) => { if (e.target === $modal) closeModal(); });

$modalTitleInput.addEventListener('input', () => {
    const len = $modalTitleInput.value.length;
    $modalTitleCounter.textContent = `${len} / 60`;
    $modalTitleCounter.style.color = len > 50 ? '#ff6b8a' : '#666';
});
$modalText.addEventListener('input', () => {
    const len = $modalText.value.length;
    $modalCounter.textContent = `${len} / 500`;
    $modalCounter.style.color = len > 480 ? '#ff6b8a' : '#666';
});

$modalSubmit.addEventListener('click', async () => {
    if (!currentUser) {
        $modalError.textContent = '請先登入再送出';
        return;
    }
    const title = $modalTitleInput.value.trim();
    const text = $modalText.value.trim();
    if (title.length < 1) {
        $modalError.textContent = '標題不能空白';
        return;
    }
    if (title.length > 60) {
        $modalError.textContent = '標題超過 60 字';
        return;
    }
    if (text.length > 500) {
        $modalError.textContent = '說明超過 500 字';
        return;
    }

    $modalSubmit.disabled = true;
    $modalSubmit.textContent = '送出中...';
    $modalError.textContent = '';

    try {
        const payload = {
            title,
            createdAt: serverTimestamp(),
            submitterUid: currentUser.uid,
            submitterEmail: currentUser.email || ''
        };
        if (text.length > 0) payload.text = text;
        await push(ref(db, 'whiteboard/pending'), payload);
        const preview = title.length > 30 ? title.slice(0, 30) + '...' : title;
        $modalSubmit.textContent = '已送出，等站長審核';
        $modalTitleInput.value = `已送出『${preview}』`;
        $modalTitleInput.disabled = true;
        $modalText.disabled = true;
        setTimeout(() => {
            $modalTitleInput.disabled = false;
            $modalText.disabled = false;
            closeModal();
        }, 2200);
    } catch (err) {
        console.error('[whiteboard] submit failed', err);
        $modalError.textContent = '送出失敗：' + err.message;
        $modalSubmit.disabled = false;
        $modalSubmit.textContent = '送審';
    }
});

// === Detail modal（點卡片開）===
const $detailModal = document.getElementById('wb-detail-modal');
const $detailBadge = document.getElementById('wb-detail-badge');
const $detailDate = document.getElementById('wb-detail-date');
const $detailTitle = document.getElementById('wb-detail-title');
const $detailText = document.getElementById('wb-detail-text');
const $detailLikes = document.getElementById('wb-detail-likes');
const $detailClose = document.getElementById('wb-detail-close');

function openDetail(item) {
    $detailBadge.textContent = `#${pad3(item.number || 0)}`;
    $detailDate.textContent = formatDate(item.approvedAt || item.createdAt);
    $detailTitle.textContent = item.title || item.text || '';
    const noteText = (item.title && item.text) ? item.text : '';
    $detailText.textContent = noteText || '（這個想法沒有補充說明）';
    $detailText.style.color = noteText ? '#cbd5e1' : '#666';
    $detailLikes.textContent = `${item.likes || 0} 票`;
    $detailModal.classList.add('show');
    $detailModal.setAttribute('aria-hidden', 'false');
}
function closeDetail() {
    $detailModal.classList.remove('show');
    $detailModal.setAttribute('aria-hidden', 'true');
}
$detailClose.addEventListener('click', closeDetail);
$detailModal.addEventListener('click', (e) => { if (e.target === $detailModal) closeDetail(); });

// === 卡片點擊事件委派（愛心 / 開 detail）===
$approved.addEventListener('click', async (e) => {
    const btn = e.target.closest('.heart-btn');
    if (btn) {
        e.stopPropagation();
        return await handleHeartClick(btn, 'whiteboard/approved');
    }
    // 點卡片其他位置 → 開 detail modal
    const card = e.target.closest('.battle');
    if (card) {
        const id = card.dataset.id;
        const snap = window.__wbApprovedSnap;
        if (snap) {
            const item = (snap.val() || {})[id];
            if (item) openDetail({ id, ...item });
        }
    }
});

// basePath = 'whiteboard/approved' 或 'whiteboard/done'，共用一個 handler
async function handleHeartClick(btn, basePath) {
    // 未登入 → 跳 auth modal
    if (!currentUser) {
        showAuthModal();
        return;
    }

    const id = btn.dataset.id;
    const uid = currentUser.uid;
    const wasLiked = btn.dataset.liked === '1';
    const newLiked = !wasLiked;

    // 樂觀 UI
    const numEl = btn.querySelector('.num');
    const iconEl = btn.querySelector('.heart-icon');
    const oldNum = parseInt(numEl.textContent, 10);
    btn.classList.toggle('liked', newLiked);
    btn.dataset.liked = newLiked ? '1' : '0';
    iconEl.classList.toggle('fas', newLiked);
    iconEl.classList.toggle('far', !newLiked);
    numEl.textContent = newLiked ? oldNum + 1 : oldNum - 1;
    if (newLiked) {
        // 簡單 pulse animation：scale 1 → 1.45 → 1，500ms
        iconEl.style.animation = 'none';
        void iconEl.offsetWidth;  // 觸發 reflow 重啟動畫
        iconEl.style.animation = 'wb-heart-pulse .5s cubic-bezier(.2,.9,.3,1.4)';
    }

    // Step A: likes ±1 transaction
    // Step B: likedBy/<uid> 寫 true 或 null
    try {
        await runTransaction(ref(db, `${basePath}/${id}/likes`), (current) => {
            const c = current || 0;
            return newLiked ? c + 1 : c - 1;
        });
        await update(ref(db, `${basePath}/${id}/likedBy`), {
            [uid]: newLiked ? true : null
        });
    } catch (err) {
        console.error('[whiteboard] heart write failed', err);
        // 回滾 UI
        btn.classList.toggle('liked', wasLiked);
        btn.dataset.liked = wasLiked ? '1' : '0';
        iconEl.classList.toggle('fas', wasLiked);
        iconEl.classList.toggle('far', !wasLiked);
        numEl.textContent = oldNum;
    }
}
