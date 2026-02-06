import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

let scene, camera, renderer, labelRenderer, controls, sphere;
const nodes = [];

// 紀錄目前選中的標籤 (使用 Set 來處理多選)
let activeTags = new Set(); 

const tagColors = {
    "AI_WORKFLOW": "#BF94FF", 
    "LOGIC":       "#60A5FA", 
    "UIUX":        "#F472B6", 
    "DOCS":        "#34D399", 
    "DEFAULT":     "#94A3B8"
};

// 預設全選
Object.keys(tagColors).forEach(tag => activeTags.add(tag));

const workData = [
    { pos: [1.3, 0.6, 0.4], title: "流程自動化", tag: "AI_WORKFLOW", desc: "n8n 工作流實作" },
    { pos: [-0.9, 1.2, -0.6], title: "數據架構", tag: "LOGIC", desc: "資料庫邏輯優化" },
    { pos: [0.3, -1.4, 0.7], title: "互動 UI", tag: "UIUX", desc: "Three.js 介面開發" },
    { pos: [0.4, -1.4, 0.7], title: "互動 UI", tag: "UIUX", desc: "Three.js 介面開發" },
    { pos: [0.5, -1.4, 0.7], title: "互動 UI", tag: "UIUX", desc: "Three.js 介面開發" },
    { pos: [0.6, -1.4, 0.7], title: "互動 UI", tag: "UIUX", desc: "Three.js 介面開發" },
    { pos: [0.9, -1.4, 0.7], title: "互動 UI", tag: "UIUX", desc: "Three.js 介面開發" }
];

export function initPlanet() {
    const container = document.getElementById('scene-wrapper'); 
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 1000); 
    camera.position.z = 4.5;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    document.getElementById('label-container').appendChild(labelRenderer.domElement);

    // 建立星球
    sphere = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.6, 2),
        new THREE.MeshBasicMaterial({ color: 0xBF94FF, wireframe: true, transparent: true, opacity: 0.1 })
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
                <div class="font-bold text-white">${data.title}</div>
                <div class="text-xs text-gray-400 mt-2">${data.desc}</div>
            </div>
            <div class="star-icon"></div>
            <div class="node-label-name">${data.tag}</div>
        `;

        nodeDiv.onmouseenter = () => { controls.autoRotate = false; };
        nodeDiv.onmouseleave = () => { controls.autoRotate = true; };

        const nodeLabel = new CSS2DObject(nodeDiv);
        nodeLabel.position.set(...data.pos);
        sphere.add(nodeLabel);
        
        // 👇 重點：這裡要把 tag 存進去，篩選時才找得到
        nodes.push({ 
            label: nodeLabel, 
            element: nodeDiv,
            tag: data.tag 
        });
    });

    // 初始化篩選器 UI
    createFilterUI();

    controls = new OrbitControls(camera, labelRenderer.domElement); 
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.enableZoom = true;
    controls.minDistance = 2.5;
    controls.maxDistance = 10.0;

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

/**
 * 自動生成篩選選單
 */
function createFilterUI() {
    const uiContainer = document.getElementById('filter-ui');
    if (!uiContainer) return;

    uiContainer.className = 'filter-container';
    
    // 生成 HTML 結構
    let menuHTML = `
        <div class="filter-btn">
            <i class="fas fa-filter"></i> FILTER
        </div>
        <div class="filter-menu">
    `;

    // 根據 tagColors 自動生成選項
    Object.entries(tagColors).forEach(([tag, color]) => {
        menuHTML += `
            <div class="filter-option active" data-tag="${tag}" style="color: ${color}">
                <div class="filter-dot"></div>
                ${tag}
            </div>
        `;
    });

    menuHTML += `</div>`;
    uiContainer.innerHTML = menuHTML;

    // 綁定點擊事件
    const options = uiContainer.querySelectorAll('.filter-option');
    options.forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止觸發星球旋轉
            const tag = opt.getAttribute('data-tag');
            
            // 多選邏輯：切換狀態
            if (activeTags.has(tag)) {
                activeTags.delete(tag);
                opt.classList.remove('active');
            } else {
                activeTags.add(tag);
                opt.classList.add('active');
            }

            // 更新星球顯示
            updateNodeVisibility();
        });
    });
}

/**
 * 更新節點顯示狀態 & 觸發閃爍
 */
function updateNodeVisibility() {
    nodes.forEach(node => {
        const isActive = activeTags.has(node.tag);
        
        // 先移除所有狀態
        node.element.classList.remove('filtered-out');
        node.element.classList.remove('flash-active');

        if (isActive) {
            // 如果是被選中的：先強制重繪動畫
            void node.element.offsetWidth; 
            // 加入閃爍動畫
            node.element.classList.add('flash-active');
        } else {
            // 如果沒被選中：變暗
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
        
        // 遮擋判定：只有當節點「沒有被篩選掉」時，才計算遮擋
        // 這樣被篩掉的節點就永遠是暗的，不會因為轉到前面就變亮
        if (!node.element.classList.contains('filtered-out')) {
            const isOccluded = worldPos.distanceTo(camPos) > sphere.position.distanceTo(camPos);
            node.element.classList.toggle('is-occluded', isOccluded);
        }
    });

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}