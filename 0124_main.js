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
    // 載入頁首，並在完成後啟動選單邏輯
    loadComponent('navbar-placeholder', 'components/navbar.html', initMobileMenu);
    
    // 載入頁尾
    loadComponent('footer-placeholder', 'components/footer.html');

    // 啟動本頁面原有的動畫
    initAnimations();
});