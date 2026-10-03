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

// 公司名不進 repo，只有解過鎖的瀏覽器才記得；7 天後自動忘掉，回到遮罩狀態
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
        const res = await fetch('data/resumes.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = await res.json();
        if (!Array.isArray(list) || list.length === 0) {
            renderEmpty();
            return;
        }
        // 編號大的排上面，001 落在最下面
        const sorted = [...list].sort((a, b) => {
            const na = a.number != null ? a.number : -1;
            const nb = b.number != null ? b.number : -1;
            if (na !== nb) return nb - na;
            return String(b.date || '').localeCompare(String(a.date || ''));
        });
        const html = sorted.map((item) => {
            const slug = encodeURIComponent(item.slug || '');
            const name = rememberedName(item.slug);
            const text = name
                ? escapeHtml(name)
                : '<span class="masked" aria-label="尚未解鎖">████████████</span>';
            const num = item.number != null ? `#${pad3(item.number)}` : '';
            const meta = [num, formatDate(item.date)].filter(Boolean).join(' · ');
            return `
                <a href="resume-detail.html?id=${slug}" class="resume-row">
                    <div class="lock"><i class="fas fa-lock"></i></div>
                    <div class="text">${text}</div>
                    <div class="meta">${escapeHtml(meta)}</div>
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
