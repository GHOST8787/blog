/* 深淺主題切換。
   這支必須放在 <head> 且同步載入：要在第一次繪製之前就把 data-theme 掛上去，
   晚一步的話淡色使用者會先看到一閃的深色。
   按鈕圖示純靠 CSS 依 data-theme 切換（見 theme.css），
   所以導覽列是之後才被 JS 注入也不用重畫。 */
(function () {
    'use strict';
    var KEY = 'ghost-theme';
    var root = document.documentElement;

    function read() {
        try { return localStorage.getItem(KEY); } catch (e) { return null; }
    }
    function write(v) {
        try { localStorage.setItem(KEY, v); } catch (e) { /* 無痕視窗存不了，不影響當下切換 */ }
    }

    // 只認 'light'，其餘（含沒存過、讀不到）一律深色，維持站上原本的樣子
    if (read() === 'light') root.setAttribute('data-theme', 'light');

    var timer = null;
    window.toggleTheme = function () {
        var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        // 過場只在按下去的這 0.55 秒存在，之後拿掉，
        // 免得整站每個元素都永久掛著 transition 影響其他互動
        root.classList.add('theme-anim');
        if (next === 'light') root.setAttribute('data-theme', 'light');
        else root.removeAttribute('data-theme');
        write(next);
        clearTimeout(timer);
        timer = setTimeout(function () { root.classList.remove('theme-anim'); }, 600);
    };
})();

/* 瀏覽計數。放在這一支是因為全站 124 頁都載它，而且都在 <head>，
   不必為了計數在每個頁面多加一行 script（多加一行就會有漏掉的一天）。
   寫入走 Realtime DB 的 REST，一個 fetch 幾百位元組，不載 SDK。
   時間戳讓伺服器填（REST 只支援 .sv = timestamp，沒有累加版，所以存事件不存計數器）。
   只記路徑與時間：沒有 IP、沒有 cookie、沒有任何能認出人的東西。 */
(function () {
    'use strict';

    var DB = 'https://blog8787-f2ace-default-rtdb.asia-southeast1.firebasedatabase.app';
    var HOST = 'ghost8787.github.io';      // 只在線上記，本機預覽不污染數字
    var SKIP = ['stats.html', 'whiteboard-admin.html'];   // 後台自己不算流量

    try {
        if (location.hostname !== HOST) return;
        if (navigator.webdriver) return;                   // 自動化瀏覽器不算

        // 正規化：去掉站台前綴、目錄結尾補 index.html，
        // 免得 /blog/ 與 /blog/index.html 被當成兩個不同頁面
        var path = location.pathname.replace(/^\/blog\//, '').replace(/^\//, '');
        if (path === '' || path.slice(-1) === '/') path += 'index.html';
        if (path.length > 120) return;
        for (var i = 0; i < SKIP.length; i++) {
            if (path === SKIP[i] || path === 'en/' + SKIP[i]) return;
        }

        // 同一個分頁重整不重複計算，關掉分頁再開才會再記一次
        var mark = 'ghost-seen:' + path;
        if (sessionStorage.getItem(mark)) return;
        sessionStorage.setItem(mark, '1');

        // 一律用台北日期分桶。讀者在哪個時區都套同一條線，
        // 儀表板看到的「一天」才會跟看的人心裡的一天一致。
        var day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
        fetch(DB + '/stats/' + day + '.json?print=silent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ p: path, t: { '.sv': 'timestamp' } }),
            keepalive: true
        }).catch(function () { /* 記不到就算了，不影響閱讀 */ });
    } catch (e) { /* 無痕視窗讀不到 sessionStorage 之類，靜默略過 */ }
})();
