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

function saveUnlockState(slug, payload, encSalt) {
    try {
        localStorage.setItem(unlockStorageKey(slug), JSON.stringify({
            payload,
            expireAt: Date.now() + UNLOCK_TTL_MS,
            salt: encSalt,  // enc.json 的 salt，當作版本指紋
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
        return { payload: obj.payload, salt: obj.salt };
    } catch (e) {
        return null;
    }
}

function clearUnlockState(slug) {
    try { localStorage.removeItem(unlockStorageKey(slug)); } catch (e) {}
}

// ---- 顯示名稱（跟密碼 session 是兩回事）----
// 公司名與職位不寫進 repo，解鎖時從履歷內容裡取出來存在這台瀏覽器，7 天後失效回到遮罩
const NAME_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function nameKey(slug) { return 'resume:name:' + slug; }

function rememberedName(slug) {
    try {
        const raw = localStorage.getItem(nameKey(slug));
        if (!raw) return null;
        const o = JSON.parse(raw);
        if (!o || !o.name || !o.exp || Date.now() > o.exp) {
            localStorage.removeItem(nameKey(slug));
            return null;
        }
        return o.name;
    } catch (e) {
        return null;
    }
}

function rememberName(slug, name) {
    if (!name) return;
    try {
        localStorage.setItem(nameKey(slug), JSON.stringify({ name, exp: Date.now() + NAME_TTL_MS }));
    } catch (e) {
        console.warn('[resume-detail] name save failed', e);
    }
}

// 履歷內容的 header 第一段就是職位列，拿它當這份履歷的顯示名
function extractDisplayName(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const p = doc.querySelector('.resume-header p');
        let t = p && p.textContent.trim().replace(/\s+/g, ' ');
        if (!t) return null;
        // 職位列前半是技能標籤，列表上只要後半那段職稱
        if (t.includes('—')) t = t.split('—').pop().trim();
        if (t.includes('：')) t = t.split('：').pop().trim();
        return t.replace(/^應徵\s*/, '') || null;
    } catch (e) {
        return null;
    }
}

const MASK_HTML = '<span class="masked" aria-label="尚未解鎖">████████████</span>';

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
        // 清單只負責列表頁顯示；沒列在清單上的履歷仍可用網址直接開（未公開履歷）
        let list = [];
        try {
            list = await fetchJson('data/resumes.json');
        } catch (e) {
            console.warn('[resume-detail] resume list unavailable, fall back to direct access', e);
        }
        const found = Array.isArray(list) ? list.find(r => r.slug === id) : null;
        const item = found || { slug: id, date: '', number: null };
        state.meta = item;
        // 解過鎖且還在 7 天內才顯示真名，否則整列遮起來
        const known = rememberedName(id);
        state.displayName = known;
        if (known) { $lockCompany.textContent = known; } else { $lockCompany.innerHTML = MASK_HTML; }
        const num = item.number != null ? `#${pad3(item.number)}` : '';
        const dt = formatDate(item.date);
        $lockMeta.textContent = [num, dt].filter(Boolean).join(' · ');
        document.title = known ? `${known} | GHOST.ouo` : 'Resume | GHOST.ouo';

        // 同瀏覽器 10 分鐘內，且 enc.json 沒重 encrypt 過 → 跳過密碼直接顯示
        const cached = loadUnlockState(id);
        if (cached) {
            try {
                const enc = await loadEnc();
                if (cached.salt && cached.salt === enc.salt) {
                    showView(cached.payload);
                } else {
                    // enc.json 已重 encrypt（新 salt），舊 cache 失效，強制重輸密碼
                    clearUnlockState(id);
                }
            } catch (e) {
                clearUnlockState(id);
            }
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

    // 名稱只有解開之後才知道，順手記在這台瀏覽器讓列表頁也看得到
    const name = extractDisplayName(payload.html) || state.displayName;
    if (name) {
        rememberName(state.id, name);
        state.displayName = name;
        document.title = `${name} | GHOST.ouo`;
    }
    $viewCompany.textContent = name || '';
    $viewCompany.classList.toggle('hidden', !name);
    // 沒有編號與日期時整格隱藏，比顯示 #000 乾淨
    const hasNumber = state.meta.number != null;
    $viewBadge.textContent = hasNumber ? `#${pad3(state.meta.number)}` : '';
    $viewBadge.classList.toggle('hidden', !hasNumber);
    const dateText = formatDate(state.meta.date);
    $viewDate.textContent = dateText;
    $viewDate.classList.toggle('hidden', !dateText || dateText === '—');

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
    // 上鎖就是整份藏回去，名稱一起忘掉，列表頁也會跟著變回遮罩
    try { localStorage.removeItem(nameKey(state.id)); } catch (e) {}
    state.displayName = null;
    $lockCompany.innerHTML = MASK_HTML;
    document.title = 'Resume | GHOST.ouo';
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
        saveUnlockState(state.id, payload, state.enc && state.enc.salt);
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
