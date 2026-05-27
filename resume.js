const $list = document.getElementById('resume-list');
const $count = document.getElementById('resume-count');

function pad3(n) {
    return String(n).padStart(3, '0');
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const m = String(dateStr).match(/^(\d{4})[-./](\d{2})[-./](\d{2})/);
    if (m) return `${m[1]}.${m[2]}.${m[3]}`;
    return escapeHtml(dateStr);
}

function renderEmpty() {
    $list.innerHTML = '<div class="text-center text-gray-500 font-mono text-sm py-6">尚未建立任何履歷</div>';
    $count.textContent = '0 份';
}

function renderError(msg) {
    $list.innerHTML = `<div class="text-center text-red-400 font-mono text-sm py-6">載入失敗：${escapeHtml(msg)}</div>`;
    $count.textContent = '—';
}

async function loadResumes() {
    try {
        const res = await fetch('resumes.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = await res.json();
        if (!Array.isArray(list) || list.length === 0) {
            renderEmpty();
            return;
        }
        const sorted = [...list].sort((a, b) => {
            const da = a.date || '';
            const db = b.date || '';
            return db.localeCompare(da);
        });
        const html = sorted.map((item) => {
            const company = escapeHtml(item.company || '(未命名)');
            const slug = encodeURIComponent(item.slug || '');
            return `
                <a href="resume-detail.html?id=${slug}" class="resume-row">
                    <div class="lock"><i class="fas fa-lock"></i></div>
                    <div class="text">${company}</div>
                    <div class="arrow"><i class="fas fa-arrow-right"></i></div>
                </a>
            `;
        }).join('');
        $list.innerHTML = html;
        $count.textContent = `${sorted.length} 份`;
    } catch (err) {
        console.error('[resume] load failed', err);
        renderError(err.message || String(err));
    }
}

loadResumes();
