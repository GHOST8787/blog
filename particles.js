// 愛心與文字粒子。首頁的愛心按鈕（main.js）與 Meet 的送出回饋（meet/poll.js）共用。
//
// 單獨一支的原因：Meet 只需要這兩個函式，直接 import main.js 會把整個首頁邏輯
// （Firebase 初始化、滾動動畫、IntersectionObserver）一起拉進投票頁的依賴鏈，
// main.js 只要有一行在某支瀏覽器跑不動，投票頁會整個失去互動。
//
// 樣式在 style.css：.heart-particle / heart-explode 與 .number-particle / number-float-up，
// 文字版另有 .number-particle.is-text 放大字級。

export function createNumberParticle(x, y, number) {
    const el = document.createElement('div');
    el.innerText = number;
    el.className = 'number-particle';
    el.style.left = `${x}px`;
    el.style.top = `${y - 20}px`;
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); }, 1500);
    return el;
}

export function createHeart(x, y, hearts) {
    const el = document.createElement('div');
    el.innerText = hearts[Math.floor(Math.random() * hearts.length)];
    el.className = 'heart-particle';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    const angle = Math.random() * Math.PI * 2;
    const velocity = 60 + Math.random() * 100;
    const tx = Math.cos(angle) * velocity;
    const ty = Math.sin(angle) * velocity;
    const rot = (Math.random() - 0.5) * 60;

    el.style.setProperty('--tx', `${tx}px`);
    el.style.setProperty('--ty', `${ty}px`);
    el.style.setProperty('--rot', `${rot}deg`);

    document.body.appendChild(el);
    setTimeout(() => { el.remove(); }, 1000);
    return el;
}
