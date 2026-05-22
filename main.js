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
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

window.initAnimations = () => {
    if (prefersReducedMotion) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.05 });

    const animItems = document.querySelectorAll('.bento-item, .project-card-vertical');
    animItems.forEach((el, i) => {
        if (el.style.opacity === '1') return;

        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `all 0.8s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.1}s`;
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
        initActiveNav(); // 👈 新增：根據 URL 自動標出當前 nav 項目
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

    if (prefersReducedMotion) {
        element.textContent = textToType;
        return;
    }

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
    // 抓取所有指向 "projects.html" 的連結
    const links = document.querySelectorAll('a[href*="projects.html"]');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            // 檢查：如果網址已經包含 projects.html，代表使用者正在看這一頁
            if (window.location.href.includes('projects.html')) {
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
 * 7.5 Active Nav State：根據當前 URL / hash 標出 nav 上對應項目（淺紫膠囊）
 */
function initActiveNav() {
    const pillClasses = ['bg-accent-purple/20', 'border', 'border-accent-purple/40', 'px-3', 'py-1', 'rounded-full'];
    const whiteTextClass = 'text-white';

    const apply = () => {
        // 先清掉所有既有 active 樣式（避免 hashchange 殘留）
        document.querySelectorAll('a[data-nav-key]').forEach(link => {
            link.classList.remove(...pillClasses, whiteTextClass);
            link.removeAttribute('aria-current');
        });

        const path = window.location.pathname;
        const hash = window.location.hash;
        let activeKey = null;

        if (path.endsWith('projects.html')) {
            activeKey = 'projects';
        } else if (path.endsWith('articles.html')) {
            activeKey = 'articles';
        } else if (
            path.endsWith('index.html') ||
            path.endsWith('/blog/') ||
            path.endsWith('/blog/en/') ||
            path === '/'
        ) {
            // 首頁：根據 hash 判斷 about / contact
            activeKey = (hash === '#contact') ? 'contact' : 'about';
        }

        if (!activeKey) return;

        // Contact 維持紫字當 CTA，其他 active 用白字
        const classesToAdd = (activeKey === 'contact') ? pillClasses : [...pillClasses, whiteTextClass];

        // 桌機 + mobile overlay 兩個 nav 同步套用
        document.querySelectorAll(`a[data-nav-key="${activeKey}"]`).forEach(link => {
            link.classList.add(...classesToAdd);
            link.setAttribute('aria-current', 'page');
        });
    };

    apply();
    // 換 hash（例如點 #contact 但留在 index.html）時也要更新
    window.addEventListener('hashchange', apply);
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
        apiKey: "AIzaSyCwjNQeSSKNJHkUSS4SnXAHq4E-xn4uAKc",
        authDomain: "blog8787-f2ace.firebaseapp.com",
        databaseURL: "https://blog8787-f2ace-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "blog8787-f2ace",
        storageBucket: "blog8787-f2ace.firebasestorage.app",
        messagingSenderId: "619380552537",
        appId: "1:619380552537:web:e235bc3f22f6e2da7ad248",
        measurementId: "G-XT1H58ZNZZ"
    };

    // 初始化 Firebase
    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    const countRef = ref(db, 'ghost_love_count');

    const countEl = document.getElementById('heart-count');
    let currentGlobalCount = 0;
    let firebaseReady = false;

    const renderCount = (value) => {
        if (!countEl) return;
        countEl.textContent = value.toLocaleString();
    };

    // 監聽全域計數
    onValue(countRef, (snapshot) => {
        currentGlobalCount = snapshot.val() || 0;
        firebaseReady = true;
        renderCount(currentGlobalCount);
    }, (err) => {
        console.warn("Firebase onValue 讀取失敗:", err);
        if (countEl) countEl.textContent = '--';
    });

    // 點擊事件
    btn.addEventListener('click', (e) => {
        const x = e.clientX;
        const y = e.clientY;

        // 樂觀更新:先本地 +1 讓 UI 立即回饋
        const optimistic = currentGlobalCount + 1;
        currentGlobalCount = optimistic;
        renderCount(optimistic);

        // 噴出數字粒子
        createNumberParticle(x, y, optimistic);

        const hearts = ['🖤', '❤️', '🤍'];
        for (let i = 0; i < 15; i++) {
            createHeart(x, y, hearts);
        }

        // 寫入資料庫(Firebase 會再透過 onValue 回推最終值)
        runTransaction(countRef, (currentCount) => {
            return (currentCount || 0) + 1;
        }).catch((err) => {
            console.warn("Firebase 寫入失敗:", err);
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
    if (prefersReducedMotion) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.05 });

    document.querySelectorAll('.project-card-vertical').forEach(el => {
        observer.observe(el);
    });
};
