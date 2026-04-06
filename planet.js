import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

let scene, camera, renderer, labelRenderer, controls, sphere;
const nodes = [];
const coreNodes = [];
const connectionLines = [];

let activeTags = new Set();

const tagColors = {
    "Engineering": "#BF94FF",
    "AI & Automation": "#60A5FA",
    "Thinking": "#34D399",
    "Lifestyle": "#F472B6",
    "Open Source": "#FFD700",
    "DEFAULT": "#94A3B8",
    "SECRET": "#FFD700"
};

// --- 內層核心能力節點 (r=1.0) ---
const coreData = [
    { tag: "Engineering",     label: "Engineering",     pos: [ 0.95,  0.31, 0.0  ] },
    { tag: "AI & Automation", label: "AI & Auto",       pos: [ 0.29,  0.95, 0.0  ] },
    { tag: "Thinking",        label: "Thinking",        pos: [-0.77,  0.59, 0.0  ] },
    { tag: "Lifestyle",       label: "Lifestyle",       pos: [-0.77, -0.59, 0.0  ] },
    { tag: "Open Source",     label: "Open Source",     pos: [ 0.29, -0.95, 0.0  ] },
];

const workData = [
    // --- 1. Engineering ---
    {
        pos: [1.6, 0.4, 0.5],
        title: "個人品牌網站",
        tag: "Engineering",
        desc: "從 0 到 1 獨立開發\nThree.js 3D 互動 + Firebase 即時DB\nWebP 優化後圖片體積 -93%",
        link: "index.html"
    },
    {
        pos: [1.2, 1.1, -0.6],
        title: "SaaS 社群排程系統",
        tag: "Engineering",
        desc: "IG/Threads/FB 跨平台自動發文\nDocker 容器化 + Hetzner VPS 部署\nPrisma ORM + PostgreSQL",
        link: "EXP/project_02.html"
    },
    {
        pos: [0.8, 0.8, -1.2],
        title: "企業動態網站",
        tag: "Engineering",
        desc: "AI 輔助全端開發\n專案管理視覺化介面\n從需求到上線完整交付",
        link: "EXP/project_01.html"
    },
    {
        pos: [1.4, -0.6, 0.6],
        title: "塔羅 AI 解讀器",
        tag: "Engineering",
        desc: "Vanilla JS + LLM Prompt 設計\n互動式牌陣解析引擎\n無框架純前端架構",
        link: "EXP/project_03.html"
    },
    {
        pos: [1.1, -1.2, -0.4],
        title: "WordPress 多站架設",
        tag: "Engineering",
        desc: "獨立架設 3+ 個網站\nSEO 優化與版面設計\n社團官網從 0 到上線",
        link: "https://hsvi111.wordpress.com/"
    },

    // --- 2. AI & Automation ---
    {
        pos: [-0.6, 1.6, 0.5],
        title: "影片製程自動化",
        tag: "AI & Automation",
        desc: "Apps Script 甘特圖自動排程\n取代人工追蹤，省下 80% 管理時間\n實際應用於影像公司",
        link: "EXP/project_04.html"
    },
    {
        pos: [-1.2, 1.0, 0.4],
        title: "財務報表自動化",
        tag: "AI & Automation",
        desc: "Google Sheets 多表聯動\n合約×付款×交付自動同步\n一鍵生成月度統計報表",
        link: "EXP/article_NY1.html"
    },
    {
        pos: [-0.5, 1.5, -0.5],
        title: "社群數據管線",
        tag: "AI & Automation",
        desc: "n8n 工作流：IG → Notion\n自動擷取、去重、同步\n零人工介入的數據清洗",
        link: "EXP/project_06.html"
    },
    {
        pos: [-1.0, 0.3, -1.2],
        title: "AI Agent 實驗",
        tag: "AI & Automation",
        desc: "AI Hedge Fund 開源專案部署\nMCP Agent 多工具協作測試\n成功部署至 Zeabur 雲端",
        link: "???"
    },
    {
        pos: [-0.8, 0.7, 1.2],
        title: "Claude Code 工程體系",
        tag: "AI & Automation",
        desc: "半年深度使用 230+ commits\n上下文工程 × 緩存策略\n提煉 8 大 AI 錯誤模式檢查表",
        link: "EXP/project_07.html"
    },
    {
        pos: [-1.4, 0.0, 0.6],
        title: "開源專案重構",
        tag: "AI & Automation",
        desc: "LINE 訊息分析器架構改造\nAI 輔助開發的品質邊界實測\n工程紀律 vs 速度的取捨",
        link: "EXP/project_05.html"
    },

    // --- 3. Thinking ---
    {
        pos: [0.3, -1.6, -0.5],
        title: "賽局理論 × 社會互動",
        tag: "Thinking",
        desc: "以囚徒困境分析信任演化\n系統思維拆解人際決策\n理論應用於團隊管理",
        link: "EXP/article_02.html"
    },
    {
        pos: [0.6, -1.0, 1.2],
        title: "MBTI 熱力學模型",
        tag: "Thinking",
        desc: "跨領域框架：人格 × 物理學\n以熵增模型解構內外向差異\n獨創分析方法論",
        link: "EXP/article_03.html"
    },
    {
        pos: [0.0, -1.7, 0.3],
        title: "數位倫理悖論探索",
        tag: "Thinking",
        desc: "匿名性 vs 責任感的張力\n社會動力學角度切入\n提出結構化論述框架",
        link: "EXP/article_08.html"
    },
    {
        pos: [-0.4, -1.3, -0.9],
        title: "AI 產品策略分析",
        tag: "Thinking",
        desc: "封閉平台 vs 開放框架比較\nPrompt Engineering 深度應用\n技術賦權使用者的產品哲學",
        link: "EXP/article_04.html"
    },

    // --- 4. Lifestyle ---
    {
        pos: [-1.4, -0.5, 0.8],
        title: "社群營運｜觸及 +235%",
        tag: "Lifestyle",
        desc: "熱研社社長，接手 3 個月：\nIG 觸及成長 235%、互動 +105%\n辦理三校聯合社課 + 校外參訪",
        link: "EXP/project_09.html"
    },
    {
        pos: [-1.2, -0.8, -0.7],
        title: "跨部門專案管理",
        tag: "Lifestyle",
        desc: "HSVI VTuber 初配信統籌\nNotion 跨部門排程系統\n同接 250 人、零延遲",
        link: "https://portaly.cc/hsvi111"
    },
    {
        pos: [-0.6, -1.4, 0.5],
        title: "創業競賽｜新創之星銀獎",
        tag: "Lifestyle",
        desc: "Mi樂團隊核心成員\n桃園新創之星銀獎\nU-start 第一階段獲補助",
        link: "https://www.instagram.com/minecraft.mi.maker/"
    },
    {
        pos: [0.5, -1.3, 0.8],
        title: "教學｜生物社講師",
        tag: "Lifestyle",
        desc: "八斗高中 12 堂課程設計\n帶領戶外夜觀活動\n從 0 建立教學內容體系",
        link: "EXP/article_01.html"
    },
    {
        pos: [-0.3, -0.9, 1.4],
        title: "海科館｜數據化管理",
        tag: "Lifestyle",
        desc: "Excel 樞紐分析建立生物資料庫\n優化館內管理流程\n第一份正式行政工讀",
        link: "???"
    },
    {
        pos: [1.0, -0.5, -1.2],
        title: "實習｜水產養殖研究",
        tag: "Lifestyle",
        desc: "澎湖種苗場珊瑚復育\n設計鬥魚實驗流程\n撰寫梭子蟹育成報告",
        link: "???"
    },
    {
        pos: [0.8, -1.5, 0.0],
        title: "展覽總召｜一周校內外展",
        tag: "Lifestyle",
        desc: "統籌為期一周社團展覽\n跨社團合作 + 財務管理\n為社員爭取到接案機會",
        link: "???"
    },
    {
        pos: [1.3, 0.0, 1.0],
        title: "系統改革｜社團體制",
        tag: "Lifestyle",
        desc: "推動學年制收費改革\n建立幹部實習生制度\nNotion SOP 系統化管理",
        link: "EXP/article_07.html"
    },

    // --- 5. Open Source ---
    {
        pos: [0.5, 1.5, 0.7],
        title: "開源貢獻｜LINE 分析器",
        tag: "Open Source",
        desc: "完整架構重構與文件撰寫\nAI 協作開發邊界實測報告\n發布於 GitHub 公開分享",
        link: "EXP/article_05.html"
    },

    // --- SECRET ---
    {
        pos: [0.0, 1.8, 0.0],
        title: "未知的語音頻率",
        tag: "SECRET",
        desc: "一則即將銷毀的加密錄音...\n點擊聆聽",
        isSecret: true,
        targetUrl: "audio_room.html"
    },
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

    // 手機版拉遠鏡頭
    const isMobile = window.innerWidth < 768;
    camera.position.z = isMobile ? 6.5 : 5.0;

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

    // --- 建立內層核心節點 ---
    createCoreNodes();

    // --- 生成外層經歷節點 ---
    workData.forEach(data => {
        const color = tagColors[data.tag] || tagColors["DEFAULT"];
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'work-node';
        nodeDiv.style.setProperty('--node-color', color);

        const descClass = data.isTypewriter ? 'text-[#FFD700] font-mono' : 'text-gray-400';

        nodeDiv.innerHTML = `
            <div class="node-card">
                <div class="text-[10px] font-mono mb-1" style="color: ${color}">${data.tag}</div>
                <div class="font-bold text-white text-sm">${data.title}</div>
                <div class="node-desc text-[11px] ${descClass} mt-2 leading-relaxed min-h-[40px] whitespace-pre-wrap">${data.desc}</div>
            </div>
            <div class="star-icon"></div>
            <div class="node-label-name">${data.title}</div>
        `;

        let typeInterval;
        const descEl = nodeDiv.querySelector('.node-desc');
        const originalText = data.desc;

        nodeDiv.onmouseenter = () => {
            controls.autoRotate = false;
            nodeDiv.parentElement.style.zIndex = "100";
            nodeDiv.style.zIndex = "1000";

            // 高亮對應連線
            highlightConnections(data.tag, true);

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

            // 取消高亮
            highlightConnections(data.tag, false);

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

            setTimeout(() => {
                nodeDiv.style.transition = 'all 2s ease';
                nodeDiv.style.opacity = '0';
                nodeDiv.style.transform = 'scale(0)';
                nodeDiv.style.pointerEvents = 'none';
                setTimeout(() => nodeDiv.remove(), 2000);
            }, 60000);
        }
    });

    // --- 建立核心到經歷連線 ---
    createConnectionLines();

    createFilterUI();

    controls = new OrbitControls(camera, labelRenderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.enableZoom = true;
    controls.minDistance = 2.5;
    controls.maxDistance = 8.0;

    // 觸控支援
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

    animate();
}

// --- 核心節點建立 ---
function createCoreNodes() {
    coreData.forEach(data => {
        const color = tagColors[data.tag];
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'core-node';
        nodeDiv.style.setProperty('--core-color', color);

        nodeDiv.innerHTML = `
            <div class="core-glow"></div>
            <div class="core-label">${data.label}</div>
        `;

        // 點擊核心節點 = 篩選該分類
        nodeDiv.addEventListener('click', () => {
            toggleTagFilter(data.tag);
        });

        // hover 核心節點也高亮連線
        nodeDiv.onmouseenter = () => {
            controls.autoRotate = false;
            highlightConnections(data.tag, true);
        };
        nodeDiv.onmouseleave = () => {
            controls.autoRotate = true;
            controls.update();
            highlightConnections(data.tag, false);
        };

        const coreLabel = new CSS2DObject(nodeDiv);
        coreLabel.position.set(...data.pos);
        sphere.add(coreLabel);

        coreNodes.push({
            label: coreLabel,
            element: nodeDiv,
            tag: data.tag
        });
    });
}

// --- 連線系統 ---
function createConnectionLines() {
    coreData.forEach(coreItem => {
        const color = new THREE.Color(tagColors[coreItem.tag]);
        const corePos = new THREE.Vector3(...coreItem.pos);

        workData.forEach(work => {
            if (work.tag !== coreItem.tag) return;

            const workPos = new THREE.Vector3(...work.pos);
            const points = [corePos, workPos];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.12
            });
            const line = new THREE.Line(geometry, material);
            sphere.add(line);

            connectionLines.push({
                line: line,
                material: material,
                tag: coreItem.tag,
                baseOpacity: 0.12,
                targetOpacity: 0.12
            });
        });
    });
}

// --- 連線高亮控制 ---
function highlightConnections(tag, highlight) {
    connectionLines.forEach(conn => {
        if (conn.tag === tag) {
            conn.targetOpacity = highlight ? 0.55 : conn.baseOpacity;
        }
    });
}

// --- 篩選器切換（核心節點點擊用）---
function toggleTagFilter(tag) {
    const filterOption = document.querySelector(`.filter-option[data-tag="${tag}"]`);
    if (!filterOption) return;

    if (activeTags.has(tag)) {
        activeTags.delete(tag);
        filterOption.classList.remove('active');
    } else {
        activeTags.add(tag);
        filterOption.classList.add('active');
    }
    updateNodeVisibility();
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

    // 核心節點也跟著篩選
    coreNodes.forEach(core => {
        const isActive = activeTags.has(core.tag);
        core.element.classList.toggle('filtered-out', !isActive);
    });

    // 連線也跟著篩選
    connectionLines.forEach(conn => {
        const isActive = activeTags.has(conn.tag);
        conn.baseOpacity = isActive ? 0.12 : 0.02;
        conn.targetOpacity = conn.baseOpacity;
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

    // 核心節點遮擋偵測
    coreNodes.forEach(core => {
        const worldPos = new THREE.Vector3();
        core.label.getWorldPosition(worldPos);
        const isOccluded = worldPos.distanceTo(camPos) > sphere.position.distanceTo(camPos) + 0.1;
        core.element.classList.toggle('is-occluded', isOccluded);
    });

    // 連線 opacity 平滑過渡
    connectionLines.forEach(conn => {
        const diff = conn.targetOpacity - conn.material.opacity;
        if (Math.abs(diff) > 0.001) {
            conn.material.opacity += diff * 0.1;
        }
    });

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}
