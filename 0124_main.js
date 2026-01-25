// 初始化跑馬燈：複製節點以實現無限循環
const marquee = document.querySelector('.animate-marquee');
if (marquee) {
    const clone = marquee.cloneNode(true);
    marquee.parentNode.appendChild(clone);
}

// 手機版選單切換邏輯
const menuBtn = document.getElementById('mobile-menu-btn');
const closeBtn = document.getElementById('close-menu');
const overlay = document.getElementById('mobile-overlay');

menuBtn.onclick = () => overlay.classList.remove('hidden');
closeBtn.onclick = () => overlay.classList.add('hidden');
overlay.querySelectorAll('a').forEach(link => {
    link.onclick = () => overlay.classList.add('hidden');
});

// 滾動漸顯動畫偵測
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, { threshold: 0.05 });

// 對所有互動卡片套用初始動畫效果
document.querySelectorAll('.bento-item, .project-card-vertical').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'all 0.8s cubic-bezier(0.22, 1, 0.36, 1)';
    observer.observe(el);
});