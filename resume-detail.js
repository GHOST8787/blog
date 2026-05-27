const PBKDF2_ITERATIONS = 100000;
const UNLOCK_TTL_MS = 10 * 60 * 1000; // 同瀏覽器 10 分鐘內重新進入不用再解鎖

const $lockSection = document.getElementById('lock-section');
const $viewSection = document.getElementById('view-section');
const $lockCompany = document.getElementById('lock-company');
const $lockMeta = document.getElementById('lock-meta');
const $pwdInput = document.getElementById('pwd-input');
const $pwdSubmit = document.getElementById('pwd-submit');
const $pwdError = document.getElementById('pwd-error');
const $lockForm = document.getElementById('lock-form');
const $viewCompany = document.getElementById('view-company');
const $viewBadge = document.getElementById('view-badge');
const $viewDate = document.getElementById('view-date');
const $viewBody = document.getElementById('view-body');
const $pdfBtn = document.getElementById('pdf-download-btn');
const $relock = document.getElementById('relock-btn');

let state = {
    id: null,
    meta: null,
    enc: null,
    pdfBlobUrl: null,
    unlocked: false,
};

function pad3(n) { return String(n).padStart(3, '0'); }

function formatDate(s) {
    if (!s) return '—';
    const m = String(s).match(/^(\d{4})[-./](\d{2})[-./](\d{2})/);
    if (m) return `${m[1]}.${m[2]}.${m[3]}`;
    return s;
}

function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function setError(msg) { $pwdError.textContent = msg || ''; }

function setLoading(isLoading) {
    $pwdSubmit.disabled = isLoading;
    $pwdInput.disabled = isLoading;
    $pwdSubmit.textContent = isLoading ? '解鎖中...' : '解鎖';
}

async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// ---- localStorage 解鎖記憶（同瀏覽器 10 分鐘內保留解鎖狀態）----
function unlockStorageKey(slug) { return 'resume:unlock:' + slug; }

function saveUnlockState(slug, payload) {
    try {
        localStorage.setItem(unlockStorageKey(slug), JSON.stringify({
            payload,
            expireAt: Date.now() + UNLOCK_TTL_MS,
        }));
    } catch (e) {
        console.warn('[resume-detail] localStorage save failed', e);
    }
}

function loadUnlockState(slug) {
    try {
        const raw = localStorage.getItem(unlockStorageKey(slug));
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || !obj.payload || !obj.expireAt) return null;
        if (Date.now() > obj.expireAt) {
            localStorage.removeItem(unlockStorageKey(slug));
            return null;
        }
        return obj.payload;
    } catch (e) {
        return null;
    }
}

function clearUnlockState(slug) {
    try { localStorage.removeItem(unlockStorageKey(slug)); } catch (e) {}
}

async function loadMeta() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
        $lockCompany.textContent = '找不到履歷 ID';
        $lockMeta.textContent = '請從列表頁進入';
        $pwdInput.disabled = true;
        $pwdSubmit.disabled = true;
        return;
    }
    state.id = id;
    try {
        const list = await fetchJson('resumes.json');
        const item = Array.isArray(list) ? list.find(r => r.slug === id) : null;
        if (!item) {
            $lockCompany.textContent = '找不到此履歷';
            $lockMeta.textContent = `id: ${id}`;
            $pwdInput.disabled = true;
            $pwdSubmit.disabled = true;
            return;
        }
        state.meta = item;
        $lockCompany.textContent = item.company || '(未命名)';
        const num = item.number != null ? `#${pad3(item.number)}` : '';
        const dt = formatDate(item.date);
        $lockMeta.textContent = [num, dt].filter(Boolean).join(' · ');
        document.title = `${item.company || 'Resume'} | GHOST.ouo`;

        // 同瀏覽器 10 分鐘內，跳過密碼直接顯示
        const cached = loadUnlockState(id);
        if (cached) {
            showView(cached);
        }
    } catch (err) {
        console.error('[resume-detail] meta load failed', err);
        $lockCompany.textContent = '載入失敗';
        $lockMeta.textContent = err.message || String(err);
        $pwdInput.disabled = true;
        $pwdSubmit.disabled = true;
    }
}

async function loadEnc() {
    if (state.enc) return state.enc;
    const res = await fetch(`resumes/${encodeURIComponent(state.id)}.enc.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`找不到加密檔（HTTP ${res.status}）`);
    state.enc = await res.json();
    if (!state.enc.salt || !state.enc.iv || !state.enc.ciphertext) {
        throw new Error('加密檔格式錯誤');
    }
    return state.enc;
}

async function deriveKey(password, saltBytes) {
    const enc = new TextEncoder();
    const km = await crypto.subtle.importKey(
        'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        km,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
    );
}

async function tryDecrypt(password) {
    const enc = await loadEnc();
    const salt = base64ToBytes(enc.salt);
    const iv = base64ToBytes(enc.iv);
    const ct = base64ToBytes(enc.ciphertext);
    const key = await deriveKey(password, salt);
    let plainBuf;
    try {
        plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    } catch (e) {
        throw new Error('密碼錯誤');
    }
    const text = new TextDecoder().decode(plainBuf);
    let payload;
    try {
        payload = JSON.parse(text);
    } catch (e) {
        throw new Error('解密後格式錯誤');
    }
    return payload;
}

function showView(payload) {
    $lockSection.classList.add('hidden');
    $viewSection.classList.remove('hidden');
    state.unlocked = true;

    $viewCompany.textContent = state.meta.company || '(未命名)';
    $viewBadge.textContent = `#${pad3(state.meta.number || 0)}`;
    $viewDate.textContent = formatDate(state.meta.date);

    $viewBody.innerHTML = payload.html || '<p class="text-gray-500">（履歷內容為空）</p>';

    if (payload.pdfBase64) {
        const bytes = base64ToBytes(payload.pdfBase64);
        const blob = new Blob([bytes], { type: 'application/pdf' });
        if (state.pdfBlobUrl) URL.revokeObjectURL(state.pdfBlobUrl);
        state.pdfBlobUrl = URL.createObjectURL(blob);
        $pdfBtn.disabled = false;
        $pdfBtn.title = '下載 PDF';
        $pdfBtn.onclick = () => {
            const a = document.createElement('a');
            a.href = state.pdfBlobUrl;
            const fname = payload.pdfFilename || `resume_${state.id}.pdf`;
            a.download = fname;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
    } else if (payload.printable) {
        $pdfBtn.disabled = false;
        $pdfBtn.title = '開啟列印對話框，可另存為 PDF';
        $pdfBtn.innerHTML = '<i class="fas fa-print"></i> 列印 / 另存 PDF';
        $pdfBtn.onclick = () => window.print();
    } else {
        $pdfBtn.disabled = true;
        $pdfBtn.title = '此履歷未附 PDF';
    }
}

function relock() {
    state.unlocked = false;
    if (state.pdfBlobUrl) {
        URL.revokeObjectURL(state.pdfBlobUrl);
        state.pdfBlobUrl = null;
    }
    clearUnlockState(state.id);
    $viewBody.innerHTML = '';
    $viewSection.classList.add('hidden');
    $lockSection.classList.remove('hidden');
    $pwdInput.value = '';
    $pwdInput.focus();
    setError('');
}

$lockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwd = $pwdInput.value;
    if (!pwd) {
        setError('請輸入密碼');
        return;
    }
    setError('');
    setLoading(true);
    try {
        const payload = await tryDecrypt(pwd);
        saveUnlockState(state.id, payload);
        showView(payload);
    } catch (err) {
        console.error('[resume-detail] decrypt failed', err);
        setError(err.message || '解鎖失敗');
        $pwdInput.select();
    } finally {
        setLoading(false);
    }
});

$relock.addEventListener('click', relock);

loadMeta();
