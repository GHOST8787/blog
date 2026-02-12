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
 * 重新整理後的 20 個項目清單
 * 座標經過球面分佈計算 (Spherical Distribution) 確保位置分散
 */
const workData = [
    // --- 1. Tech & Auto (技術與自動化) ---
    { 
        pos: [1.6, 0.4, 0.5], 
        title: "自動化影片排程", 
        tag: "Tech & Auto", 
        desc: "於「哈囉您好」整合 Apps Script 與剪映，建立自動化甘特圖，大幅減少追蹤進度時間。" 
    },
    { 
        pos: [1.2, 1.1, -0.6], 
        title: "ZAMYCO 自動報表", 
        tag: "Tech & Auto", 
        desc: "建立多表格聯動系統，自動更新剪輯進度、合約與付款紀錄，生成月統計報表。" 
    },
    { 
        pos: [0.5, 1.5, 0.7], 
        title: "社群數據爬蟲", 
        tag: "Tech & Auto", 
        desc: "使用 n8n 建立自動化工作流，擷取 IG 數據同步至 Notion 並進行資料去重。" 
    },
    { 
        pos: [0.8, 0.8, -1.2], 
        title: "AI Hedge Fund", 
        tag: "Tech & Auto", 
        desc: "導入 GitHub 開源專案進行 MCP Agent 實驗，並將專案從 Replit 部署至 Zeabur。" 
    },
    { 
        pos: [1.4, -0.6, 0.6], 
        title: "動態網站開發", 
        tag: "Tech & Auto", 
        desc: "利用 Cursor 輔助撰寫 HTML/JS，開發公司動態網站與專案管理介面。" 
    },
    { 
        pos: [1.1, -1.2, -0.4], 
        title: "WordPress 架設", 
        tag: "Tech & Auto", 
        desc: "架設 3+ 個網站（含 HSVI 官網），負責 SEO 優化與排版，月瀏覽量達 100+。" 
    },

    // --- 2. PM & Marketing (專案管理與行銷) ---
    { 
        pos: [-0.6, -1.4, 0.8], 
        title: "熱研社社群成長", 
        tag: "PM & Marketing", 
        desc: "擔任社長三個月內，使 IG 觸及成長 235%、互動成長 105%，產出多篇知識貼文。" 
    },
    { 
        pos: [-1.2, -0.8, 0.7], 
        title: "HSVI 專案管理", 
        tag: "PM & Marketing", 
        desc: "在幽夜工作室統籌 VTuber 初配信活動，結合跨部門排程，達成同接 250 人成績。" 
    },
    { 
        pos: [-0.4, -1.1, -1.1], 
        title: "夢想智賦企劃", 
        tag: "PM & Marketing", 
        desc: "負責資源平台專案企劃與社群行銷策展，撰寫多份提案簡報與營運規劃。" 
    },
    { 
        pos: [0.3, -1.6, -0.5], 
        title: "U-start 創業團隊", 
        tag: "PM & Marketing", 
        desc: "「Mi樂」團隊核心成員，負責進度控管與企劃書撰寫，獲第一階段補助。" 
    },
    { 
        pos: [0.6, -1.0, 1.2], 
        title: "自潛社網管", 
        tag: "PM & Marketing", 
        desc: "從 0 建立社群帳號與視覺規範，累積粉絲並顯著提升社團在校內的數位曝光度。" 
    },
    { 
        pos: [0.0, -1.7, 0.3], 
        title: "社團體制改革", 
        tag: "PM & Marketing", 
        desc: "將收費改為學年制、新增實習生制度，並建立 Notion SOP 強化溝通效率。" 
    },

    // --- 3. Aqua & Bio (水產與生物專業) ---
    { 
        pos: [-1.4, 0.5, 0.8], 
        title: "澎湖種苗場實習", 
        tag: "Aqua & Bio", 
        desc: "參與珊瑚復育與螃蟹繁養殖，設計鬥魚實驗流程，並撰寫遠海梭子蟹育成報告。" 
    },
    { 
        pos: [-1.2, 1.0, 0.4], 
        title: "邱家兄弟實習", 
        tag: "Aqua & Bio", 
        desc: "於嘉義進行生態養殖調查，實作虱目魚、白蝦收成與金目鱸混養管理。" 
    },
    { 
        pos: [-0.5, 1.5, -0.5], 
        title: "海科館生物普查", 
        tag: "Aqua & Bio", 
        desc: "擔任行政助理，利用 Excel 樞紐分析建立生物資料庫，優化館內管理流程。" 
    },
    { 
        pos: [-1.5, -0.2, -0.7], 
        title: "海洋專業證照", 
        tag: "Aqua & Bio", 
        desc: "考取「營業用動力小船駕駛執照」及「CMAS 一星 (OW) 潛水員證照」。" 
    },
    { 
        pos: [-1.0, 0.3, -1.2], 
        title: "寵物展銷售", 
        tag: "Aqua & Bio", 
        desc: "累積第一線銷售經驗，具備臨場危機處理能力（如收銀設備故障排除）。" 
    },

    // --- 4. Web3 & Data (區塊鏈與數據分析) ---
    { 
        pos: [0.3, 1.2, 1.0], 
        title: "加密貨幣復盤", 
        tag: "Web3 & Data", 
        desc: "建立 Notion 交易系統，應用 SNR 支撐阻力策略與聰明錢概念進行市場分析。" 
    },
    { 
        pos: [-0.7, 0.9, -1.3], 
        title: "政府補助資料庫", 
        tag: "Web3 & Data", 
        desc: "整理 150+ 份政府補助資料，運用樞紐分析將資訊標籤化，提升檢索效率。" 
    },
    { 
        pos: [0.0, 0.4, -1.6], 
        title: "鏈上數據研究", 
        tag: "Web3 & Data", 
        desc: "研究 DeFi 協議與區塊鏈應用，計畫經營虛擬貨幣自媒體分享市場觀察。" 
    },
    { 
        pos: [0.0, 1.8, 0.0], 
        title: "未知的語音頻率", 
        tag: "SECRET", 
        desc: "一則即將銷毀的加密錄音... 點擊聆聽。",
        isSecret: true
    },
    { 
        pos: [0.3, 1.8, 0.0],
        title: "感謝名單", 
        tag: "SECRET", 
        desc: "嗯...值得我放在這裡。",
        isSecret: true
    }
];

export function initPlanet() {
    const container = document.getElementById('scene-wrapper'); 
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 1000); 
    camera.position.z = 5.0; // 稍微拉遠一點，讓 20 顆星看起來更舒適

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
        new THREE.IcosahedronGeometry(1.8, 3), // 稍微增加點細節
        new THREE.MeshBasicMaterial({ color: 0xBF94FF, wireframe: true, transparent: true, opacity: 0.15 })
    );
    scene.add(sphere);

    // 生成星星節點
    workData.forEach(data => {
        const color = tagColors[data.tag] || tagColors["DEFAULT"];
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'work-node';
        nodeDiv.style.setProperty('--node-color', color);

        nodeDiv.innerHTML = `
            <div class="node-card">
                <div class="text-[10px] font-mono mb-1" style="color: ${color}">${data.tag}</div>
                <div class="font-bold text-white text-sm">${data.title}</div>
                <div class="text-[11px] text-gray-400 mt-2 leading-relaxed">${data.desc}</div>
            </div>
            <div class="star-icon"></div>
            <div class="node-label-name">${data.title}</div>
        `;

        // 滑鼠懸停停止旋轉
        nodeDiv.onmouseenter = () => { 
            controls.autoRotate = false;
            // 確保懸停的 DOM 元素在 label-container 的最頂層
            nodeDiv.parentElement.style.zIndex = "100"; 
            nodeDiv.style.zIndex = "1000";
        };
        nodeDiv.onmouseleave = () => { 
            // 強制重啟旋轉並更新控制器
            controls.autoRotate = true; 
            controls.update(); 
            nodeDiv.style.zIndex = "10";
            nodeDiv.parentElement.style.zIndex = "2";
        };

        const nodeLabel = new CSS2DObject(nodeDiv);
        nodeLabel.position.set(...data.pos);
        sphere.add(nodeLabel);
        
        nodes.push({ 
            label: nodeLabel, 
            element: nodeDiv,
            tag: data.tag 
        });

        if (data.isSecret) {
            // 讓星星發金光
            const starIcon = nodeDiv.querySelector('.star-icon');
            if (starIcon) starIcon.style.boxShadow = '0 0 20px #FFD700, 0 0 40px #FFD700';
            
            // 點擊事件：跳轉到錄音室
            nodeDiv.addEventListener('click', () => {
                window.location.href = '0211_audio_room.html';
            });

            // 倒數 60 秒後自動消失 (淡出動畫)
            setTimeout(() => {
                nodeDiv.style.transition = 'all 2s ease';
                nodeDiv.style.opacity = '0';
                nodeDiv.style.transform = 'scale(0)';
                nodeDiv.style.pointerEvents = 'none'; // 無法再點擊
                
                // 動畫播完後徹底從畫面上移除
                setTimeout(() => nodeDiv.remove(), 2000);
            }, 60000); // 60000 毫秒 = 1 分鐘
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
        // 👇 把 SECRET 也過濾掉，不要顯示在選單上
        if(tag === "DEFAULT" || tag === "SECRET") return; 
        
        menuHTML += `
            <div class="filter-option active" data-tag="${tag}" style="color: ${color}">
                <div class="filter-dot"></div>
                ${tag}
            </div>
        `;
        
        // 預設將有效標籤加入選中狀態
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

        // 如果是 SECRET 節點，則不受篩選器影響，永遠保持顯示
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
        
        // 只有在「沒有懸停」且「沒有被過濾」的情況下才計算遮擋
        const isHovered = node.element.matches(':hover');
        
        if (!node.element.classList.contains('filtered-out')) {
            const isOccluded = worldPos.distanceTo(camPos) > sphere.position.distanceTo(camPos) + 0.2;
            
            // 如果正在懸停，強行移除隱藏狀態，確保說明牌清晰
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