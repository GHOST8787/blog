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
 * 改成 export 或全域函數，讓動態生成的卡片也能觸發
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

    // 重新選取所有需要動畫的元素
    const animItems = document.querySelectorAll('.bento-item, .project-card-vertical');
    animItems.forEach(el => {
        // 如果已經在顯示狀態，就不重複初始化
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
        initMobileMenu();
        initScrollFlash();
    });

    // 載入 Footer
    loadComponent('footer-placeholder', `${rootPath}components/footer.html`);

    // 啟動心跳按鈕與其他基礎特效
    initHeartButton();
    if (typeof initTypewriter === 'function') initTypewriter();
    
    // 注意：如果是 Projects 頁面，initAnimations 會由該頁面的 script 在抓完資料後手動觸發
    if (!document.getElementById('project-container')) {
        window.initAnimations();
    }
});

/**
 * 4. 主執行流程
 */
document.addEventListener('DOMContentLoaded', () => {
    // 檢查是否有設定全域路徑變數，如果沒有就預設為空字串 (代表在根目錄)
    const rootPath = window.siteRoot || '';

    // 1. 載入頁首 Navbar
    loadComponent('navbar-placeholder', `${rootPath}components/navbar.html`, () => {
        
        // --- 自動修正導覽列連結 (保持你的邏輯) ---
        if (rootPath) {
            const navLinks = document.querySelectorAll('#navbar-placeholder a');
            navLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('#') && !href.startsWith('http') && !href.startsWith('mailto')) {
                    link.setAttribute('href', rootPath + href);
                }
            });
        }
        // -------------------------------------

        initMobileMenu();
        initScrollFlash();
    });

    // 2. 🔥 補回這段：載入頁尾 Footer
    loadComponent('footer-placeholder', `${rootPath}components/footer.html`);

    // 3. 🔥 補回這段：啟動頁面動畫 (不然網頁元素會隱形)
    initAnimations();

    // 4. 啟動打字機 (如果有的話)
    if (typeof initTypewriter === 'function') {
        initTypewriter();
    }

    initHeartButton();
});

/**
 * 5. 打字機特效 (Typewriter Effect)
 */
function initTypewriter() {
    const element = document.getElementById('typewriter-text');
    if (!element) return;

    const textToType = "Python / Google Apps Script / OpenAI API / n8n"; // 想要顯示的文字
    const typingSpeed = 100; // 打字速度 (毫秒)，數值越小越快
    const startDelay = 500; // 開始前的延遲 (毫秒)
    
    let charIndex = 0;
    
    // 清空原本內容 (防止 HTML 殘留)
    element.textContent = '';

    function type() {
        if (charIndex < textToType.length) {
            element.textContent += textToType.charAt(charIndex);
            charIndex++;
            setTimeout(type, typingSpeed);
        } else {
            element.style.borderRight = 'none'; 
        }
    }

    // 延遲一點點再開始打字，視覺比較舒服
    setTimeout(type, startDelay);
}

function initScrollFlash() {
    // 抓取所有連結，不管它有沒有 index.html 前綴
    const links = document.querySelectorAll('a[href*="#"]');

    links.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            // 取得 # 後面的 ID (例如 "about")
            const hashIndex = href.indexOf('#');
            if (hashIndex === -1) return; 
            const targetId = href.substring(hashIndex + 1);
            
            // 關鍵判斷：目標區塊是否存在於「當前」頁面？
            const targetSection = document.getElementById(targetId);

            if (targetSection) {
                // --- 情況 A：目標在當前頁面 (例如在首頁點 About) ---
                
                // 1. 阻止瀏覽器重新載入頁面
                e.preventDefault();

                // 2. 平滑滾動到目標
                // 這裡手動處理滾動，因為 preventDefault 擋掉了 href 的原生行為
                const offsetTop = targetSection.offsetTop;
                window.scrollTo({
                    top: offsetTop - 100, // 扣掉一點導覽列的高度
                    behavior: "smooth"
                });

                // 3. 處理標題閃爍
                const targetTitle = targetSection.querySelector('h1, h2, h3');
                if (targetTitle) {
                    targetTitle.classList.remove('flash-active');
                    void targetTitle.offsetWidth; // 強制重繪
                    
                    // 等滾動差不多到了再閃爍
                    setTimeout(() => {
                        targetTitle.classList.add('flash-active');
                    }, 500);
                }

                // 4. 更新網址列的 Hash (讓使用者可以按上一頁)
                history.pushState(null, null, `#${targetId}`);

            } else {
                // --- 情況 B：目標不在當前頁面 (例如在專案頁點 About) ---
                // 什麼都不做，讓瀏覽器執行原本的 href 跳轉功能
                // 瀏覽器會自己跳去 index.html#about
            }
        });
    });
}



function initHeartButton() {
    const btn = document.getElementById('heart-trigger');
    
    if (!btn) return;

    // 1. 從 localStorage 讀取目前的點擊次數 (如果沒有就預設 0)
    let clickCount = parseInt(localStorage.getItem('ghost_love_count')) || 0;

    btn.addEventListener('click', (e) => {
        // 2. 次數 +1 並存回去
        clickCount++;
        localStorage.setItem('ghost_love_count', clickCount);

        // 取得滑鼠位置
        const x = e.clientX;
        const y = e.clientY;

        // 3. 噴出「數值」粒子 (顯示目前的累計次數)
        createNumberParticle(x, y, clickCount);

        // 4. 噴出原本的「愛心」粒子 (裝飾用，維持 15 顆)
        const hearts = ['🖤', '❤️', '🤍'];
        for (let i = 0; i < 15; i++) {
            createHeart(x, y, hearts);
        }
    });
}

function createNumberParticle(x, y, number) {
    const el = document.createElement('div');
    el.innerText = number; // 顯示目前的次數
    el.className = 'number-particle'; // 套用新的 CSS
    
    // 設定位置 (稍微往上提一點，避免遮住按鈕)
    el.style.left = `${x}px`;
    el.style.top = `${y - 20}px`;

    document.body.appendChild(el);

    // 動畫結束後移除
    setTimeout(() => {
        el.remove();
    }, 1500);
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

    setTimeout(() => {
        el.remove();
    }, 1000);
}

// 在動態生成卡片後呼叫此函式
function refreshAnimations() {
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
}
