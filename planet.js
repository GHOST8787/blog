import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

let scene, camera, renderer, labelRenderer, controls, sphere;
const nodes = [];

// 紀錄目前選中的標籤
let activeTags = new Set();

const tagColors = {
    "Engineering": "#BF94FF",
    "AI & Automation": "#60A5FA",
    "Thinking": "#34D399",
    "Lifestyle": "#F472B6",
    "DEFAULT": "#94A3B8",
    "SECRET": "#FFD700"
};

/**
 * 重新整理後的項目清單
 */
const workData = [
    {
        pos: [0.65, 1.39, -0.94],
        title: "個人品牌網站",
        tag: "Engineering",
        desc: "獨立開發 3D 互動作品集\nThree.js + Firebase 即時資料庫\n圖片 WebP 壓縮體積 -93%",
        link: "index.html"
    },
    {
        pos: [0.53, 1.72, 0],
        title: "SaaS 社群排程系統",
        tag: "Engineering",
        desc: "IG/Threads/FB 跨平台自動發文\nDocker 容器化 + VPS 部署\nPrisma ORM + PostgreSQL",
        link: "EXP/project_02.html"
    },
    {
        pos: [-1.09, -0.42, -1.37],
        title: "企業動態網站",
        tag: "Engineering",
        desc: "AI 輔助全端開發交付\n專案管理視覺化介面\n從需求訪談到正式上線",
        link: "EXP/project_01.html"
    },
    {
        pos: [0.94, -0.85, 1.28],
        title: "塔羅 AI 解讀器",
        tag: "Engineering",
        desc: "Vanilla JS 無框架前端\nLLM Prompt 設計互動牌陣\n完整產品原型獨立交付",
        link: "EXP/project_03.html"
    },
    {
        pos: [-0.86, -1.51, -0.47],
        title: "WordPress 多站架設",
        tag: "Engineering",
        desc: "獨立架設 3+ 個網站\nSEO 優化與版面設計\n社團官網從 0 到上線",
        link: "https://hsvi111.wordpress.com/"
    },
    {
        pos: [1.17, -0.52, -1.27],
        title: "開源貢獻｜LINE 分析器",
        tag: "Engineering",
        desc: "完整架構重構與技術文件\nAI 協作開發邊界實測報告\n發布於 GitHub 公開分享",
        link: "EXP/article_05.html"
    },
    {
        pos: [-0.5, 0.77, -1.55],
        title: "影片製程自動化",
        tag: "AI & Automation",
        desc: "Apps Script 甘特圖排程\n取代人工追蹤，省 80% 管理時間\n實際導入影像製作公司",
        link: "EXP/project_04.html"
    },
    {
        pos: [0.61, 0.23, 1.68],
        title: "財務報表自動化",
        tag: "AI & Automation",
        desc: "Google Sheets 多表聯動\n合約、付款、交付自動同步\n一鍵產出月度統計報表",
        link: "EXP/article_NY1.html"
    },
    {
        pos: [-0.73, -1.2, 1.12],
        title: "社群數據管線",
        tag: "AI & Automation",
        desc: "n8n 自動化：IG → Notion\n擷取、去重、同步零人工\n即時數據清洗與歸檔",
        link: "EXP/project_06.html"
    },
    {
        pos: [-1.65, -0.71, 0.02],
        title: "AI Agent 部署",
        tag: "AI & Automation",
        desc: "AI Hedge Fund 開源專案\nMCP Agent 多工具協作驗證\n成功部署至 Zeabur 雲端",
        link: "EXP/project_08.html"
    },
    {
        pos: [1.62, 0.71, -0.31],
        title: "Claude Code 工程體系",
        tag: "AI & Automation",
        desc: "半年深度使用 230+ commits\n上下文工程與快取策略\n提煉 8 大 AI 錯誤模式檢查表",
        link: "EXP/project_07.html"
    },
    {
        pos: [1.12, -1.39, -0.21],
        title: "開源專案重構",
        tag: "AI & Automation",
        desc: "LINE 訊息分析器架構改造\nAI 協作的品質邊界實測\n工程紀律 vs 開發速度取捨",
        link: "EXP/project_05.html"
    },
    {
        pos: [-1.29, 1.17, 0.46],
        title: "賽局理論 × 社會互動",
        tag: "Thinking",
        desc: "囚徒困境分析信任演化\n系統思維拆解人際決策\n理論框架應用於團隊管理",
        link: "EXP/article_02.html"
    },
    {
        pos: [-0.61, 1.65, -0.4],
        title: "MBTI 熱力學模型",
        tag: "Thinking",
        desc: "跨領域框架：人格 × 物理學\n熵增模型解構內外向差異\n獨創分析方法論",
        link: "EXP/article_03.html"
    },
    {
        pos: [1.77, -0.13, 0.3],
        title: "數位倫理悖論探索",
        tag: "Thinking",
        desc: "匿名性 vs 責任感的張力\n社會動力學角度切入分析\n結構化論述框架提案",
        link: "EXP/article_08.html"
    },
    {
        pos: [-0.9, 0.79, 1.35],
        title: "AI 產品策略分析",
        tag: "Thinking",
        desc: "封閉平台 vs 開放框架比較\nPrompt Engineering 深度應用\n技術賦權的產品哲學",
        link: "EXP/article_04.html"
    },
    {
        pos: [-1.55, 0.28, -0.88],
        title: "社群營運｜觸及 +235%",
        tag: "Lifestyle",
        desc: "熱研社社長，3 個月成效：\nIG 觸及 +235%、互動 +105%\n三校聯合社課 + 校外參訪",
        link: "EXP/project_09.html"
    },
    {
        pos: [0.13, 1.45, 1.06],
        title: "跨部門專案管理",
        tag: "Lifestyle",
        desc: "VTuber 初配信統籌執行\nNotion 跨部門排程系統\n同時在線 250 人零延遲",
        link: "https://portaly.cc/hsvi111"
    },
    {
        pos: [1.13, 0.99, 0.99],
        title: "創業競賽｜新創之星銀獎",
        tag: "Lifestyle",
        desc: "Mi樂團隊核心成員\n桃園新創之星銀獎\nU-start 第一階段獲補助",
        link: "EXP/article_09.html"
    },
    {
        pos: [0.2, -1.7, 0.54],
        title: "教學｜生物社講師",
        tag: "Lifestyle",
        desc: "八斗高中 12 堂課程設計\n帶領戶外夜觀教學活動\n從 0 建立教學內容體系",
        link: "EXP/article_01.html"
    },
    {
        pos: [-0.49, -0.4, 1.69],
        title: "海科館｜數據化管理",
        tag: "Lifestyle",
        desc: "Excel 樞紐分析建生物資料庫\n優化館內清點與管理流程\n第一份正式行政工讀",
        link: "EXP/project_11.html"
    },
    {
        pos: [0.03, -1.07, -1.45],
        title: "實習｜水產養殖研究",
        tag: "Lifestyle",
        desc: "澎湖種苗場珊瑚復育\n設計鬥魚實驗流程\n撰寫梭子蟹育成報告",
        link: "EXP/article_10.html"
    },
    {
        pos: [0.56, 0.27, -1.69],
        title: "系統改革｜社團體制",
        tag: "Lifestyle",
        desc: "推動學年制收費改革\n建立幹部實習生制度\nNotion SOP 系統化管理",
        link: "EXP/article_07.html"
    },
    {
        pos: [-1.42, -0.57, -0.93],
        title: "HSVI Studio｜內容產製管理",
        tag: "Lifestyle",
        desc: "跨校創作社群專案管理\n影片企劃與頻道經營\n遠端團隊協作 2 年",
        link: "EXP/project_10.html"
    },
    {
        pos: [0.72, 1.23, -1.15],
        title: "夢想智賦｜GPT 自動化",
        tag: "AI & Automation",
        desc: "GPT for Sheets 實務導入\n政府補助研究自動化\n月報系統建立",
        link: "EXP/project_12.html"
    },
    {
        pos: [-0.28, -1.62, -0.72],
        title: "影視公司｜營運系統建立",
        tag: "Lifestyle",
        desc: "內容營運與專案管理\n器材與人員調度系統\n影視製作 SOP",
        link: "EXP/project_13.html"
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

    // --- SECRET 2: 名言日記 (南極點附近) ---
    {
        pos: [-0.4, -1.7, 0.3],
        title: "漂流的隻字片語",
        tag: "SECRET",
        desc: "有些話，值得被記住...\n點擊翻閱",
        isSecret: true,
        targetUrl: "quotes.html"
    },

    // --- SECRET 3: 感謝名單 (客製化打字機特效) ---
    {
        pos: [0.5, 1.6, 0.8],
        title: "感謝名單",
        tag: "SECRET",
        desc: "謝謝過去所有曾經幫助過我的你\n以及現在正在看這則訊息的你\n\u{1F49B}\u{1F49B}\u{1F49B}",
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
        const linkBtn = (data.link && data.link !== '#' && data.link !== '???')
            ? `<a href="${data.link}" class="node-link" style="color: ${color}; border-color: ${color};" onclick="event.stopPropagation()">View Work <i class="fas fa-arrow-right text-[8px]"></i></a>`
            : '';

        nodeDiv.innerHTML = `
            <div class="node-card">
                <div class="text-[10px] font-mono mb-1" style="color: ${color}">${data.tag}</div>
                <div class="font-bold text-white text-sm">${data.title}</div>
                <div class="node-desc text-[11px] ${descClass} mt-2 leading-relaxed min-h-[40px] whitespace-pre-wrap">${data.desc}</div>
                ${linkBtn}
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

            // 打字機核心邏輯
            if (data.isTypewriter && descEl) {
                descEl.textContent = '';
                descEl.classList.add('typing-cursor');
                let i = 0;
                clearInterval(typeInterval);

                typeInterval = setInterval(() => {
                    if (i < originalText.length) {
                        descEl.textContent += originalText.charAt(i);
                        i++;
                    } else {
                        clearInterval(typeInterval);
                    }
                }, 50);
            }
        };

        nodeDiv.onmouseleave = () => {
            controls.autoRotate = true;
            controls.update();
            nodeDiv.style.zIndex = "10";
            nodeDiv.parentElement.style.zIndex = "2";

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

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.enableZoom = true;
    controls.minDistance = 2.5;
    controls.maxDistance = 8.0;
    controls.enablePan = false;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

    window.addEventListener('resize', () => {
        const newWidth = container.clientWidth;
        const newHeight = container.clientHeight;
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
        labelRenderer.setSize(newWidth, newHeight);
    });

    // 隱藏 loading spinner
    const loader = document.getElementById('planet-loader');
    if (loader) loader.style.display = 'none';

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

    // Filter 按鈕 click toggle（手機支援）
    const filterBtn = uiContainer.querySelector('.filter-btn');
    filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        uiContainer.classList.toggle('open');
    });
    document.addEventListener('click', () => {
        uiContainer.classList.remove('open');
    });
    uiContainer.addEventListener('click', (e) => e.stopPropagation());

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
