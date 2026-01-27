/**
 * 1. 核心功能：組件載入器
 * 用於將 navbar.html 或 footer.html 注入頁面
 */
async function loadComponent(elementId, filePath, callback) {
    try {
        const response = await fetch(filePath);
        const html = await response.text();
        const target = document.getElementById(elementId);
        if (target) {
            target.innerHTML = html;
            if (callback) callback(); // 確保載入後才執行選單初始化
        }
    } catch (error) {
        console.error(`無法載入組件: ${filePath}`, error);
    }
}

/**
 * 2. 初始化手機版選單
 * 這裡放所有關於選單的點擊邏輯
 */
function initMobileMenu() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const closeBtn = document.getElementById('close-menu');
    const overlay = document.getElementById('mobile-overlay');

    if (menuBtn && overlay) {
        menuBtn.onclick = () => overlay.classList.remove('hidden');
        closeBtn.onclick = () => overlay.classList.add('hidden');
        
        // 點擊選單內的連結後自動關閉選單 (適用於單頁跳錨點)
        overlay.querySelectorAll('a').forEach(link => {
            link.onclick = () => overlay.classList.add('hidden');
        });
    }
}

/**
 * 3. 視覺與動畫效果
 */
const initAnimations = () => {
    // 滾動漸顯偵測
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.05 });

    // 套用動畫初始狀態
    document.querySelectorAll('.bento-item, .project-card-vertical').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'all 0.8s cubic-bezier(0.22, 1, 0.36, 1)';
        observer.observe(el);
    });

    // 初始化跑馬燈 (若你的組件裡有這個元件)
    const marquee = document.querySelector('.animate-marquee');
    if (marquee && !marquee.dataset.cloned) {
        const clone = marquee.cloneNode(true);
        marquee.parentNode.appendChild(clone);
        marquee.dataset.cloned = "true"; // 防止重複執行
    }
};

/**
 * 4. 主執行流程
 */
document.addEventListener('DOMContentLoaded', () => {
    // 載入頁首，並在完成後啟動選單邏輯 & 閃爍邏輯
    loadComponent('navbar-placeholder', 'components/navbar.html', () => {
        initMobileMenu();  // 原本的手機選單邏輯
        initScrollFlash(); // 新增：啟動點擊閃爍邏輯
    });
    
    // 載入頁尾
    loadComponent('footer-placeholder', 'components/footer.html');

    // 啟動本頁面原有的動畫
    initAnimations();

    // 啟動打字機 (這是剛剛幫你加的)
    if (typeof initTypewriter === 'function') {
        initTypewriter();
    }
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



/**
 * 6. 導覽列點擊標題閃爍特效
 */
// function initScrollFlash() {
//     // 選取所有 href 開頭是 # 的連結 (包含手機版跟電腦版選單)
//     const links = document.querySelectorAll('a[href^="#"]');

//     links.forEach(link => {
//         link.addEventListener('click', function(e) {
//             // 1. 取得目標 ID (去掉 #)
//             const targetId = this.getAttribute('href').substring(1);
//             const targetSection = document.getElementById(targetId);

//             if (targetSection) {
//                 // 2. 找到該區塊內的標題 (h1, h2, h3 擇一)
//                 const targetTitle = targetSection.querySelector('h1, h2, h3');

//                 if (targetTitle) {
//                     // 3. 重置動畫：如果已經有 class 要先移除，強制瀏覽器重繪 (Reflow) 後再加回去
//                     targetTitle.classList.remove('flash-active');
                    
//                     // 這行神奇的程式碼會強制瀏覽器計算樣式，讓動畫可以重新觸發
//                     void targetTitle.offsetWidth; 

//                     // 4. 加入閃爍 class
//                     // 設定一點延遲 (300ms)，讓畫面滾動到定位時剛好開始閃
//                     setTimeout(() => {
//                         targetTitle.classList.add('flash-active');
//                     }, 300);
//                 }
//             }
//         });
//     });
// }

