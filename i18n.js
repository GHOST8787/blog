// i18n.js — 中英語言切換 / 偵測 / localStorage 記憶
// 用法：每個頁面 <head> 加 <script src="i18n.js" defer></script>（或在 EXP/ 內 <script src="../i18n.js" defer></script>）
// 全域暴露 window.switchLang(lang)，由 navbar 切換鍵呼叫

(function () {
    const LANG_KEY = 'ghost_blog_lang';
    const SUPPORTED = ['zh', 'en'];

    // 偵測當前頁面語言：URL 路徑含 /en/ 即為英文版（兼容 /blog/en/... 與 /en/...）
    function detectCurrentLang() {
        const path = window.location.pathname;
        if (/(^|\/blog)\/en(\/|$)/.test(path)) return 'en';
        return 'zh';
    }

    // 計算對應語言版本的 URL（保留 search 與 hash）
    function getCounterpartUrl(targetLang) {
        const path = window.location.pathname;
        const search = window.location.search;
        const hash = window.location.hash;
        let newPath = path;

        if (targetLang === 'en') {
            // zh -> en: 在 /blog/ 或 root 後面插入 en/
            if (/^\/blog\//.test(path)) {
                newPath = path.replace(/^(\/blog)\//, '$1/en/');
            } else {
                newPath = path.replace(/^\//, '/en/');
            }
        } else {
            // en -> zh: 移除 en 段
            newPath = path.replace(/^(\/blog)?\/en\//, '$1/');
        }

        return newPath + search + hash;
    }

    // 切換語言：寫 localStorage、HEAD 確認對應檔存在、跳轉（找不到對應檔退回對應語言首頁）
    async function switchLang(targetLang) {
        if (!SUPPORTED.includes(targetLang)) return;
        // 點到當前語言不動作，避免無意義 reload
        if (targetLang === detectCurrentLang()) return;
        try {
            localStorage.setItem(LANG_KEY, targetLang);
        } catch (e) { /* localStorage 可能被禁用，忽略 */ }

        const targetUrl = getCounterpartUrl(targetLang);

        // 嘗試 HEAD 探測對應檔是否存在
        let exists = false;
        try {
            const res = await fetch(targetUrl, { method: 'HEAD', cache: 'no-store' });
            exists = res.ok;
        } catch (e) {
            // 網路錯誤就當不存在
        }

        if (exists) {
            window.location.href = targetUrl;
            return;
        }

        // Fallback：跳對應語言首頁
        const hasBlog = /^\/blog\//.test(window.location.pathname);
        const base = hasBlog ? '/blog' : '';
        const fallback = targetLang === 'en'
            ? `${base}/en/index.html`
            : `${base}/index.html`;
        window.location.href = fallback;
    }

    // 進站偵測：只在「裸 root」觸發（/ 或 /blog/），其他 URL 視為使用者明確指定語言不動
    // 使用者打開 /en/index.html 或 /index.html 是主動選擇，不該被偏好踢走
    function autoDetectOnHome() {
        const path = window.location.pathname;
        const isBareRoot = /^(\/blog)?\/?$/.test(path);
        if (!isBareRoot) return;

        let stored = null;
        try {
            stored = localStorage.getItem(LANG_KEY);
        } catch (e) { /* ignore */ }

        const current = detectCurrentLang();

        if (stored && SUPPORTED.includes(stored)) {
            // 已有偏好 → 偏好不同當前頁就跳
            if (stored !== current) {
                window.location.replace(getCounterpartUrl(stored));
            }
            return;
        }

        // 首次訪問：偵測瀏覽器語言、寫入偏好、必要時跳轉
        const browserLang = (navigator.language || 'zh').toLowerCase();
        const preferred = browserLang.startsWith('en') ? 'en' : 'zh';
        try {
            localStorage.setItem(LANG_KEY, preferred);
        } catch (e) { /* ignore */ }

        if (preferred !== current) {
            window.location.replace(getCounterpartUrl(preferred));
        }
    }

    // 全域暴露
    window.switchLang = switchLang;
    window.detectCurrentLang = detectCurrentLang;

    // 進站時觸發
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoDetectOnHome);
    } else {
        autoDetectOnHome();
    }
})();
