import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

let scene, camera, renderer, labelRenderer, controls, sphere;
const nodes = [];

// 紀錄目前選中的標籤
let activeTags = new Set(); 

const tagColors = {
    "Tech & Auto": "#BF94FF", 
    "PM & Marketing": "#60A5FA", 
    "Aqua & Bio": "#F472B6", 
    "Web3 & Data": "#34D399", 
    "DEFAULT": "#94A3B8",
    "SECRET": "#FFD700"
};

/**
 * 重新整理後的項目清單
 */
const workData = [
    // --- 1. Tech & Auto (技術與自動化) ---
    { 
        pos: [1.6, 0.4, 0.5], 
        title: "自動化影片排程", 
        tag: "Tech & Auto", 
        desc: "整合 Apps Script 與剪映\n建立自動化甘特圖系統\n大幅縮減專案追蹤時間",
        link: "???" 
    },
    { 
        pos: [1.2, 1.1, -0.6], 
        title: "ZAMYCO 自動報表", 
        tag: "Tech & Auto", 
        desc: "Google Sheets 多表聯動\n自動更新合約與付款紀錄\n一鍵生成月度統計報表",
        link: "???"
    },
    { 
        pos: [0.5, 1.5, 0.7], 
        title: "社群數據爬蟲", 
        tag: "Tech & Auto", 
        desc: "使用 n8n 建立自動工作流\n擷取 IG 數據同步至 Notion\n自動執行資料去重與清洗",
        link: "???"
    },
    { 
        pos: [0.8, 0.8, -1.2], 
        title: "AI Hedge Fund", 
        tag: "Tech & Auto", 
        desc: "導入 GitHub 開源專案\n進行 MCP Agent 實驗\n成功部署至 Zeabur 平台",
        link: "???" 
    },
    { 
        pos: [1.4, -0.6, 0.6], 
        title: "動態網站開發", 
        tag: "Tech & Auto", 
        desc: "Cursor 輔助撰寫 HTML/JS\n開發公司動態網站\n建置專案管理視覺介面",
        link: "???"
    },
    { 
        pos: [1.1, -1.2, -0.4], 
        title: "WordPress 架設", 
        tag: "Tech & Auto", 
        desc: "獨立架設 3+ 個網站\n負責 SEO 優化與排版\n月瀏覽量突破 100+",
        link: "https://hsvi111.wordpress.com/" 
    },

    // --- 2. PM & Marketing (專案管理與行銷) ---
    { 
        pos: [-0.6, -1.4, 0.8], 
        title: "熱研社社群成長", 
        tag: "PM & Marketing", 
        desc: "接手三個月成效翻倍：\nIG 觸及成長 235%\n互動成長 105%",
        link: "https://www.instagram.com/ntou_tropical_organisms_club/" 
    },
    { 
        pos: [-1.2, -0.8, 0.7], 
        title: "HSVI 專案管理", 
        tag: "PM & Marketing", 
        desc: "統籌 VTuber 初配信活動\n導入跨部門 Notion 排程\n達成同接 250 人成績",
        link: "https://portaly.cc/hsvi111" 
    },
    { 
        pos: [-0.4, -1.1, -1.1], 
        title: "夢想智賦企劃", 
        tag: "PM & Marketing", 
        desc: "資源平台專案企劃\n社群行銷策展規劃\n撰寫多份提案簡報",
        link: "???"
    },
    { 
        pos: [0.3, -1.6, -0.5], 
        title: "U-start 創業團隊", 
        tag: "PM & Marketing", 
        desc: "「Mi樂」團隊核心成員\n負責進度控管與企劃撰寫\n獲第一階段補助肯定",
        link: "https://www.instagram.com/minecraft.mi.maker/" 
    },
    { 
        pos: [0.6, -1.0, 1.2], 
        title: "自潛社網管", 
        tag: "PM & Marketing", 
        desc: "從 0 建立社群帳號\n制定視覺規範與內容\n提升社團數位曝光度",
        link: "???"
    },
    { 
        pos: [0.0, -1.7, 0.3], 
        title: "社團體制改革", 
        tag: "PM & Marketing", 
        desc: "推動收費改為學年制\n新增幹部實習生制度\n建立 Notion SOP 系統",
        link: "???"
    },

    // --- 3. Aqua & Bio (水產與生物專業) ---
    { 
        pos: [-1.4, 0.5, 0.8], 
        title: "澎湖種苗場實習", 
        tag: "Aqua & Bio", 
        desc: "參與珊瑚復育與螃蟹繁養\n設計鬥魚實驗流程\n撰寫梭子蟹育成報告",
        link: "???" 
    },
    { 
        pos: [-1.2, 1.0, 0.4], 
        title: "邱家兄弟實習", 
        tag: "Aqua & Bio", 
        desc: "嘉義生態養殖田間調查\n實作虱目魚白蝦收成\n金目鱸混養管理技術",
        link: "???"
    },
    { 
        pos: [-0.5, 1.5, -0.5], 
        title: "海科館生物普查", 
        tag: "Aqua & Bio", 
        desc: "擔任行政助理\nExcel 樞紐分析建立資料庫\n優化館內生物管理流程",
        link: "???"
    },
    { 
        pos: [-1.5, -0.2, -0.7], 
        title: "海洋專業證照", 
        tag: "Aqua & Bio", 
        desc: "營業用動力小船駕駛執照\nCMAS 一星 (OW) 潛水員\n具備水下與海上作業能力",
        link: "???"
    },
    { 
        pos: [-1.0, 0.3, -1.2], 
        title: "寵物展銷售", 
        tag: "Aqua & Bio", 
        desc: "第一線展場銷售經驗\n臨場危機處理能力\n收銀設備故障排除",
        link: "???"
    },

    // --- 4. Web3 & Data (區塊鏈與數據分析) ---
    { 
        pos: [0.3, 1.2, 1.0], 
        title: "加密貨幣復盤", 
        tag: "Web3 & Data", 
        desc: "自建 Notion 交易系統\n應用 SNR 支撐阻力策略\n結合聰明錢概念分析",
        link: "???" 
    },
    { 
        pos: [-0.7, 0.9, -1.3], 
        title: "政府補助資料庫", 
        tag: "Web3 & Data", 
        desc: "整理 150+ 份補助資料\n運用樞紐分析標籤化\n建立高效檢索系統",
        link: "???"
    },
    { 
        pos: [0.0, 0.4, -1.6], 
        title: "鏈上數據研究", 
        tag: "Web3 & Data", 
        desc: "研究 DeFi 協議與應用\n籌備虛擬貨幣自媒體\n分享市場趨勢觀察",
        link: "???" 
    },
    
    // --- SECRET 1: 錄音室 (北極點) ---
    { 
        pos: [0.0, 1.8, 0.0], 
        title: "未知的語音頻率", 
        tag: "SECRET", 
        desc: "一則即將銷毀的加密錄音...\n點擊聆聽",
        isSecret: true,
        targetUrl: "audio_room.html"
    },
    
    // --- SECRET 2: 感謝名單 (客製化打字機特效) ---
    { 
        pos: [0.5, 1.6, 0.8], 
        title: "感謝名單", 
        tag: "SECRET", 
        desc: "謝謝過去所有曾經幫助過我的你\n以及現在正在看這則訊息的你\n💛💛💛",
        isSecret: true,
        isTypewriter: true
    }
];

export function initPlanet() {
    const container = document.getElementById('scene-wrapper'); 
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 1000); 
    camera.position.z = 5.0; 

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    document.getElementById('label-container').appendChild(labelRenderer.domElement);

    // 建立星球本體 (Wireframe)
    sphere = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.8, 3), 
        new THREE.MeshBasicMaterial({ color: 0xBF94FF, wireframe: true, transparent: true, opacity: 0.15 })
    );
    scene.add(sphere);

    // 生成星星節點
    workData.forEach(data => {
        const color = tagColors[data.tag] || tagColors["DEFAULT"];
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'work-node';
        nodeDiv.style.setProperty('--node-color', color);

        // 如果是打字機卡片，我們先把字體顏色設為金色，且用 monospace 字體
        const descClass = data.isTypewriter ? 'text-[#FFD700] font-mono' : 'text-gray-400';
        
        // 生成 HTML 結構，注意這裡加了 .node-desc 類別以便抓取
        nodeDiv.innerHTML = `
            <div class="node-card">
                <div class="text-[10px] font-mono mb-1" style="color: ${color}">${data.tag}</div>
                <div class="font-bold text-white text-sm">${data.title}</div>
                <div class="node-desc text-[11px] ${descClass} mt-2 leading-relaxed min-h-[40px] whitespace-pre-wrap">${data.desc}</div>
            </div>
            <div class="star-icon"></div>
            <div class="node-label-name">${data.title}</div>
        `;

        // --- 滑鼠懸停邏輯 (包含打字機特效) ---
        let typeInterval;
        const descEl = nodeDiv.querySelector('.node-desc');
        const originalText = data.desc;

        nodeDiv.onmouseenter = () => { 
            controls.autoRotate = false;
            nodeDiv.parentElement.style.zIndex = "100"; 
            nodeDiv.style.zIndex = "1000";

            // ⌨️ 打字機核心邏輯
            if (data.isTypewriter && descEl) {
                descEl.textContent = ''; // 清空
                descEl.classList.add('typing-cursor'); // 加個游標效果(選用)
                let i = 0;
                clearInterval(typeInterval); // 防止重複觸發

                typeInterval = setInterval(() => {
                    if (i < originalText.length) {
                        descEl.textContent += originalText.charAt(i);
                        i++;
                    } else {
                        clearInterval(typeInterval);
                    }
                }, 50); // 打字速度 (越小越快)
            }
        };

        nodeDiv.onmouseleave = () => { 
            controls.autoRotate = true; 
            controls.update(); 
            nodeDiv.style.zIndex = "10";
            nodeDiv.parentElement.style.zIndex = "2";

            // 離開時，瞬間顯示完整文字，避免使用者沒看完
            if (data.isTypewriter && descEl) {
                clearInterval(typeInterval);
                descEl.textContent = originalText;
            }
        };

        const nodeLabel = new CSS2DObject(nodeDiv);
        nodeLabel.position.set(...data.pos);
        sphere.add(nodeLabel);
        
        nodes.push({ 
            label: nodeLabel, 
            element: nodeDiv,
            tag: data.tag 
        });

        // 隱藏版星星的特殊處理
        if (data.isSecret) {
            const starIcon = nodeDiv.querySelector('.star-icon');
            if (starIcon) starIcon.style.boxShadow = '0 0 20px #FFD700, 0 0 40px #FFD700';
            
            nodeDiv.addEventListener('click', () => {
                if(data.targetUrl) window.location.href = data.targetUrl;
            });

            // 1分鐘後消失
            setTimeout(() => {
                nodeDiv.style.transition = 'all 2s ease';
                nodeDiv.style.opacity = '0';
                nodeDiv.style.transform = 'scale(0)';
                nodeDiv.style.pointerEvents = 'none'; 
                setTimeout(() => nodeDiv.remove(), 2000);
            }, 60000); 
        }
    });

    createFilterUI();

    controls = new OrbitControls(camera, labelRenderer.domElement); 
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.enableZoom = true;
    controls.minDistance = 2.5;
    controls.maxDistance = 8.0;

    window.addEventListener('resize', () => {
        const newWidth = container.clientWidth;
        const newHeight = container.clientHeight;
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
        labelRenderer.setSize(newWidth, newHeight);
    });

    animate();
}

function createFilterUI() {
    const uiContainer = document.getElementById('filter-ui');
    if (!uiContainer) return;

    uiContainer.className = 'filter-container';
    
    let menuHTML = `
        <div class="filter-btn">
            <i class="fas fa-filter"></i> 選單 FILTER
        </div>
        <div class="filter-menu">
    `;

    Object.entries(tagColors).forEach(([tag, color]) => {
        if(tag === "DEFAULT" || tag === "SECRET") return; 
        
        menuHTML += `
            <div class="filter-option active" data-tag="${tag}" style="color: ${color}">
                <div class="filter-dot"></div>
                ${tag}
            </div>
        `;
        activeTags.add(tag);
    });

    menuHTML += `</div>`;
    uiContainer.innerHTML = menuHTML;

    const options = uiContainer.querySelectorAll('.filter-option');
    options.forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const tag = opt.getAttribute('data-tag');
            
            if (activeTags.has(tag)) {
                activeTags.delete(tag);
                opt.classList.remove('active');
            } else {
                activeTags.add(tag);
                opt.classList.add('active');
            }
            updateNodeVisibility();
        });
    });
}

function updateNodeVisibility() {
    nodes.forEach(node => {
        const isActive = activeTags.has(node.tag);
        node.element.classList.remove('filtered-out', 'flash-active');

        if (node.tag === "SECRET") return;

        if (isActive) {
            void node.element.offsetWidth; 
            node.element.classList.add('flash-active');
        } else {
            node.element.classList.add('filtered-out');
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    
    nodes.forEach(node => {
        const worldPos = new THREE.Vector3();
        node.label.getWorldPosition(worldPos);
        const isHovered = node.element.matches(':hover');
        
        if (!node.element.classList.contains('filtered-out')) {
            const isOccluded = worldPos.distanceTo(camPos) > sphere.position.distanceTo(camPos) + 0.2;
            
            if (isHovered) {
                node.element.classList.remove('is-occluded');
            } else {
                node.element.classList.toggle('is-occluded', isOccluded);
            }
        }
    });

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}