// blog/whiteboard-admin.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
    getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
    getDatabase, ref, onValue, push, update, remove, serverTimestamp, get
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

const app = initializeApp(firebaseConfig, 'whiteboard-admin');
const auth = getAuth(app);
const db = getDatabase(app);
const provider = new GoogleAuthProvider();

// === DOM ===
const $loginSec = document.getElementById('login-section');
const $content = document.getElementById('admin-content');
const $loginBtn = document.getElementById('login-btn');
const $loginErr = document.getElementById('login-error');
const $logoutBtn = document.getElementById('logout-btn');
const $uid = document.getElementById('admin-uid');

const $pendingList = document.getElementById('pending-list');
const $pendingCount = document.getElementById('pending-count');
const $approvedList = document.getElementById('approved-list');
const $approvedCount = document.getElementById('approved-admin-count');

const $gradModal = document.getElementById('grad-modal');
const $gradPreview = document.getElementById('grad-text-preview');
const $gradLink = document.getElementById('grad-link');
const $gradConfirm = document.getElementById('grad-confirm');
const $gradCancel = document.getElementById('grad-cancel');

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
    );
}

// === Auth flow ===
$loginBtn.addEventListener('click', async () => {
    $loginErr.textContent = '';
    $loginBtn.disabled = true;
    const oldHtml = $loginBtn.innerHTML;
    $loginBtn.textContent = '登入中...';
    try {
        await signInWithPopup(auth, provider);
    } catch (err) {
        console.error('[admin] login failed', err);
        if (err.code !== 'auth/popup-closed-by-user') {
            $loginErr.textContent = err.message;
        }
    } finally {
        $loginBtn.disabled = false;
        $loginBtn.innerHTML = oldHtml;
    }
});

$logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
    if (user) {
        if (user.uid !== ADMIN_UID) {
            $loginErr.textContent = `沒有 admin 權限（你的 UID: ${user.uid.slice(0,8)}...）`;
            signOut(auth);
            return;
        }
        $loginSec.classList.add('hidden');
        $content.classList.remove('hidden');
        $uid.textContent = `admin · ${user.email} · ${user.uid.slice(0, 8)}...`;
        attachListeners();
    } else {
        $loginSec.classList.remove('hidden');
        $content.classList.add('hidden');
        $uid.textContent = '未登入';
    }
});

// === Listeners ===
let listenersAttached = false;
function attachListeners() {
    if (listenersAttached) return;
    listenersAttached = true;

    // pending listener
    onValue(ref(db, 'whiteboard/pending'), (snap) => {
        const data = snap.val() || {};
        const items = Object.entries(data)
            .map(([id, v]) => ({ id, ...v }))
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        renderPending(items);
    }, (err) => {
        $pendingList.innerHTML = `<p class="text-red-400 font-mono text-sm">載入失敗：${escapeHtml(err.message)}</p>`;
    });

    // approved listener (給畢業按鈕用)
    onValue(ref(db, 'whiteboard/approved'), (snap) => {
        const data = snap.val() || {};
        const items = Object.entries(data)
            .map(([id, v]) => ({ id, ...v }))
            .sort((a, b) => (b.likes || 0) - (a.likes || 0));
        renderApprovedAdmin(items);
    });
}

function renderPending(items) {
    $pendingCount.textContent = `${items.length} 則`;
    if (items.length === 0) {
        $pendingList.innerHTML = '<p class="text-gray-500 font-mono text-sm py-4">沒有待審投稿</p>';
        return;
    }
    $pendingList.innerHTML = items.map(item => {
        const title = escapeHtml(item.title || '(沒標題)');
        const text  = item.text ? `<p class="text-gray-500 text-xs mt-2 whitespace-pre-wrap">${escapeHtml(item.text)}</p>` : '';
        const email = item.submitterEmail ? escapeHtml(item.submitterEmail) : '';
        const uidShort = item.submitterUid ? item.submitterUid.slice(0, 8) : '?';
        const submitterLine = email
            ? `<a href="mailto:${email}" class="text-accent-purple hover:underline">${email}</a> · <span class="text-gray-600">${uidShort}...</span>`
            : `<span class="text-gray-600">UID ${uidShort}...</span>`;
        return `
            <div class="admin-card" data-id="${item.id}">
                <div class="text">
                    <div class="text-white font-semibold">${title}</div>
                    ${text}
                    <div class="text-[10px] font-mono mt-2">submitter: ${submitterLine}</div>
                </div>
                <div class="actions">
                    <button class="admin-btn approve" data-act="approve">通過</button>
                    <button class="admin-btn reject" data-act="reject">駁回</button>
                </div>
            </div>
        `;
    }).join('');
}

$pendingList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.admin-btn');
    if (!btn) return;
    const card = btn.closest('.admin-card');
    const id = card.dataset.id;
    const act = btn.dataset.act;

    btn.disabled = true;

    try {
        if (act === 'reject') {
            await remove(ref(db, `whiteboard/pending/${id}`));
            return;
        }
        // approve: 取下一個 number、寫 approved、刪 pending
        const [counterSnap, itemSnap] = await Promise.all([
            get(ref(db, 'whiteboard/counters/nextNumber')),
            get(ref(db, `whiteboard/pending/${id}`))
        ]);
        const nextNumber = (counterSnap.val() || 0) + 1;
        const pendingData = itemSnap.val();
        if (!pendingData) {
            alert('找不到 pending 資料');
            btn.disabled = false;
            return;
        }

        const approvedPayload = {
            title: pendingData.title || '',
            number: nextNumber,
            likes: 0,
            createdAt: pendingData.createdAt || Date.now(),
            approvedAt: Date.now()
        };
        if (pendingData.text) approvedPayload.text = pendingData.text;
        if (pendingData.submitterEmail) approvedPayload.submitterEmail = pendingData.submitterEmail;
        if (pendingData.submitterUid) approvedPayload.submitterUid = pendingData.submitterUid;

        const updates = {};
        updates[`whiteboard/pending/${id}`] = null;
        updates[`whiteboard/approved/${id}`] = approvedPayload;
        updates['whiteboard/counters/nextNumber'] = nextNumber;
        await update(ref(db), updates);
    } catch (err) {
        console.error('[admin] action failed', err);
        alert('操作失敗：' + err.message);
        btn.disabled = false;
    }
});

let pendingGraduateId = null;
let pendingGraduateData = null;

function renderApprovedAdmin(items) {
    $approvedCount.textContent = `${items.length} 則`;
    if (items.length === 0) {
        $approvedList.innerHTML = '<p class="text-gray-500 font-mono text-sm py-4">許願池是空的</p>';
        return;
    }
    $approvedList.innerHTML = items.map(item => {
        const title = escapeHtml(item.title || item.text || '(無)');
        const text = (item.title && item.text) ? `<p class="text-gray-500 text-xs mt-2 whitespace-pre-wrap">${escapeHtml(item.text)}</p>` : '';
        const email = item.submitterEmail ? escapeHtml(item.submitterEmail) : '';
        const submitterLine = email
            ? `<div class="text-[10px] font-mono mt-2">submitter: <a href="mailto:${email}" class="text-accent-purple hover:underline">${email}</a></div>`
            : '<div class="text-[10px] font-mono mt-2 text-gray-700">submitter: (no email)</div>';
        return `
            <div class="admin-card" data-id="${item.id}">
                <div class="text">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="idea-badge">#${String(item.number || 0).padStart(3, '0')}</span>
                        <span class="text-gray-500 font-mono text-xs">${item.likes || 0} 票</span>
                    </div>
                    <div class="text-white font-semibold">${title}</div>
                    ${text}
                    ${submitterLine}
                </div>
                <div class="actions">
                    <button class="admin-btn graduate" data-act="graduate">畢業</button>
                </div>
            </div>
        `;
    }).join('');
}

$approvedList.addEventListener('click', (e) => {
    const btn = e.target.closest('.admin-btn[data-act="graduate"]');
    if (!btn) return;
    const card = btn.closest('.admin-card');
    pendingGraduateId = card.dataset.id;
    get(ref(db, `whiteboard/approved/${pendingGraduateId}`)).then(snap => {
        pendingGraduateData = snap.val();
        if (!pendingGraduateData) {
            alert('找不到資料');
            return;
        }
        $gradPreview.textContent = pendingGraduateData.title || pendingGraduateData.text || '';
        $gradLink.value = '';
        $gradModal.classList.add('show');
        $gradModal.setAttribute('aria-hidden', 'false');
        setTimeout(() => $gradLink.focus(), 50);
    });
});

$gradCancel.addEventListener('click', () => {
    $gradModal.classList.remove('show');
    pendingGraduateId = null;
    pendingGraduateData = null;
});
$gradModal.addEventListener('click', (e) => {
    if (e.target === $gradModal) $gradCancel.click();
});

$gradConfirm.addEventListener('click', async () => {
    if (!pendingGraduateId || !pendingGraduateData) return;
    const linkUrl = $gradLink.value.trim();

    $gradConfirm.disabled = true;
    $gradConfirm.textContent = '處理中...';

    try {
        const donePayload = {
            title: pendingGraduateData.title || '',
            number: pendingGraduateData.number,
            likes: pendingGraduateData.likes || 0,
            createdAt: pendingGraduateData.createdAt,
            approvedAt: pendingGraduateData.approvedAt,
            doneAt: Date.now()
        };
        if (pendingGraduateData.text) donePayload.text = pendingGraduateData.text;
        if (pendingGraduateData.submitterEmail) donePayload.submitterEmail = pendingGraduateData.submitterEmail;
        if (pendingGraduateData.submitterUid) donePayload.submitterUid = pendingGraduateData.submitterUid;
        if (linkUrl) donePayload.linkUrl = linkUrl;

        const updates = {};
        updates[`whiteboard/approved/${pendingGraduateId}`] = null;
        updates[`whiteboard/done/${pendingGraduateId}`] = donePayload;
        await update(ref(db), updates);

        $gradModal.classList.remove('show');
        pendingGraduateId = null;
        pendingGraduateData = null;
    } catch (err) {
        console.error('[admin] graduate failed', err);
        alert('畢業失敗：' + err.message);
    } finally {
        $gradConfirm.disabled = false;
        $gradConfirm.textContent = '確認畢業';
    }
});
