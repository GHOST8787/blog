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
