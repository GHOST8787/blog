// 👇 1. 確保這兩行在最上面
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getDatabase, ref, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";

/**
 * 1. 核心功能：組件載入器
 */
async function loadComponent(elementId, filePath, callback) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const html = await response.text();
        const target = document.getElementById(elementId);
        if (target) {
            target.innerHTML = html;
            if (callback) callback();
        }
    } catch (error) {
        console.error(`無法載入組件: ${filePath}`, error);
    }
}

/**
 * 2. 初始化視覺動畫
 */
window.initAnimations = () => {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.05 });

    const animItems = document.querySelectorAll('.bento-item, .project-card-vertical');
    animItems.forEach(el => {
        if (el.style.opacity === '1') return;
        
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'all 0.8s cubic-bezier(0.22, 1, 0.36, 1)';
        observer.observe(el);
    });
};

/**
 * 3. 主執行流程
 */
document.addEventListener('DOMContentLoaded', () => {
    const rootPath = window.siteRoot || '';

    // 載入 Navbar
    loadComponent('navbar-placeholder', `${rootPath}components/navbar.html`, () => {
        if (rootPath) {
            const navLinks = document.querySelectorAll('#navbar-placeholder a');
            navLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('#') && !href.startsWith('http') && !href.startsWith('mailto')) {
                    link.setAttribute('href', rootPath + href);
                }
            });
        }
        
        // 啟動各項導覽列功能
        initMobileMenu();
        initScrollFlash();
        initSmartNav(); // 👈 新增：Article 智慧防呆跳轉
    });

    // 載入 Footer
    loadComponent('footer-placeholder', `${rootPath}components/footer.html`);

    // 啟動視覺動畫
    initAnimations();

    // 啟動打字機
    initTypewriter();

    // 啟動愛心按鈕
    initHeartButton();

    // 補強：檢查網址有沒有錨點，有的話自動閃爍 (解決換頁不閃的問題)
    if (window.location.hash) {
        const targetId = window.location.hash.substring(1);
        setTimeout(() => {
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                const targetTitle = targetSection.querySelector('h1, h2, h3');
                if (targetTitle) {
                    targetTitle.classList.remove('flash-active');
                    void targetTitle.offsetWidth;
                    targetTitle.classList.add('flash-active');
                }
            }
        }, 800);
    }
});

/**
 * 4. 手機版選單邏輯
 */
function initMobileMenu() {
    const btn = document.getElementById('mobile-menu-btn');
    const overlay = document.getElementById('mobile-overlay');
    const closeBtn = document.getElementById('close-menu');
    const links = overlay ? overlay.querySelectorAll('a') : [];

    if (!btn || !overlay) return;

    const openMenu = () => {
        overlay.classList.remove('hidden');
        overlay.style.opacity = '0';
        overlay.setAttribute('aria-hidden', 'false');
        btn.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(() => {
            overlay.style.transition = 'opacity 0.3s ease';
            overlay.style.opacity = '1';
        });
        // 焦點移到關閉按鈕
        if (closeBtn) closeBtn.focus();
    };

    const closeMenu = () => {
        overlay.style.opacity = '0';
        overlay.setAttribute('aria-hidden', 'true');
        btn.setAttribute('aria-expanded', 'false');
        setTimeout(() => {
            overlay.classList.add('hidden');
            btn.focus(); // 焦點回到漢堡按鈕
        }, 300);
    };

    btn.addEventListener('click', openMenu);
    if (closeBtn) closeBtn.addEventListener('click', closeMenu);
    links.forEach(link => link.addEventListener('click', closeMenu));

    // Escape 鍵關閉選單
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
            closeMenu();
        }
    });
}

/**
 * 5. 打字機特效
 */
let typewriterTimer = null;

function initTypewriter() {
    const element = document.getElementById('typewriter-text');
    if (!element) return;

    if (typewriterTimer) clearTimeout(typewriterTimer);

    const textToType = "Python / Google Apps Script / OpenAI API / n8n";
    const typingSpeed = 100;
    const startDelay = 500;
    
    let charIndex = 0;
    element.textContent = ''; 

    function type() {
        if (charIndex < textToType.length) {
            element.textContent += textToType.charAt(charIndex);
            charIndex++;
            typewriterTimer = setTimeout(type, typingSpeed);
        } else {
            element.style.borderRight = 'none'; 
            typewriterTimer = null;
        }
    }

    setTimeout(type, startDelay);
}

/**
 * 6. 滾動與閃爍特效 (針對 #錨點 連結)
 */
function initScrollFlash() {
    const links = document.querySelectorAll('a[href*="#"]');
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            const hashIndex = href.indexOf('#');
            if (hashIndex === -1) return; 
            const targetId = href.substring(hashIndex + 1);
            const targetSection = document.getElementById(targetId);

            if (targetSection) {
                const targetTitle = targetSection.querySelector('h1, h2, h3');
                if (targetTitle) {
                    targetTitle.classList.remove('flash-active');
                    void targetTitle.offsetWidth; 
                    setTimeout(() => {
                        targetTitle.classList.add('flash-active');
                    }, 500);
                }
            }
        });
    });
}

/**
 * 7. 智慧導航 (防止 Article 重複載入 + 閃爍特效)
 */
function initSmartNav() {
    // 抓取所有指向 "0124_Projects.html" 的連結
    const links = document.querySelectorAll('a[href*="0124_projects.html"]');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            // 檢查：如果網址已經包含 0124_Projects.html，代表使用者正在看這一頁
            if (window.location.href.includes('0124_projects.html')) {
                e.preventDefault(); // 🛑 阻止網頁重新整理

                // 1. 滾動到最上方 (優化體驗)
                window.scrollTo({
                    top: 0,
                    behavior: "smooth"
                });

                // 2. 讓頁面標題閃爍
                const targetTitle = document.querySelector('h1'); // 抓取頁面的大標題
                if (targetTitle) {
                    targetTitle.classList.remove('flash-active');
                    void targetTitle.offsetWidth; // 重繪
                    
                    setTimeout(() => {
                        targetTitle.classList.add('flash-active');
                    }, 500);
                }
            }
            // 如果不在這一頁，就讓它正常跳轉，不干涉
        });
    });
}

/**
 * 8. Firebase 愛心按鈕
 * ⚠️ 安全提醒：Firebase API Key 暴露於前端是預期行為（靜態站點限制），
 *    但務必確保 Firebase Console 已設定：
 *    1. Database Security Rules（限制只允許 ghost_love_count 的 increment）
 *    2. API Key 限制（僅限 ghost8787.github.io 網域）
 *    3. 設定 Referrer 限制防止濫用
 */
function initHeartButton() {
    const btn = document.getElementById('heart-trigger');
    if (!btn) return;

    // Firebase 設定
    const firebaseConfig = {
        apiKey: "AIzaSyB3dBOnXMECoJa99HxR3eL0tRK80cm-pHQ",
        authDomain: "ghost8787-blog.firebaseapp.com",
        databaseURL: "https://ghost8787-blog-default-rtdb.firebaseio.com",
        projectId: "ghost8787-blog",
        storageBucket: "ghost8787-blog.firebasestorage.app",
        messagingSenderId: "318349478374",
        appId: "1:318349478374:web:b024124a619fbec027ee27",
        measurementId: "G-X1D8JTZ60E"
    };

    // 初始化 Firebase
    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    const countRef = ref(db, 'ghost_love_count');

    let currentGlobalCount = 0;

    // 監聽數據
    onValue(countRef, (snapshot) => {
        currentGlobalCount = snapshot.val() || 0;
        console.log("🔥 Firebase 同步愛心數:", currentGlobalCount);
    });

    // 點擊事件
    btn.addEventListener('click', (e) => {
        const x = e.clientX;
        const y = e.clientY;

        // 噴出數字
        createNumberParticle(x, y, currentGlobalCount + 1);

        const hearts = ['🖤', '❤️', '🤍'];
        for (let i = 0; i < 15; i++) {
            createHeart(x, y, hearts);
        }

        // 寫入資料庫
        runTransaction(countRef, (currentCount) => {
            return (currentCount || 0) + 1;
        });
    });
}

function createNumberParticle(x, y, number) {
    const el = document.createElement('div');
    el.innerText = number;
    el.className = 'number-particle';
    el.style.left = `${x}px`;
    el.style.top = `${y - 20}px`;
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); }, 1500);
}

function createHeart(x, y, hearts) {
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
}

// 動態卡片刷新動畫
window.refreshAnimations = function() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.05 });

    // 將所有卡片加入觀察名單
    document.querySelectorAll('.project-card-vertical').forEach(el => {
        observer.observe(el);
    });
};
