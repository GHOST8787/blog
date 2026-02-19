document.addEventListener('DOMContentLoaded', () => {
    // === 1. 資料區：串接真實偉特塔羅圖片 ===
    let idCounter = 0;
    const fullTarotDeck = [];

    const majorNames = ["愚者(The Fool)","魔術師(The Magician)","女祭司(The High Priestess)","皇后(The Empress)","皇帝(The Emperor)","教皇(The Hierophant)","戀人(The Lovers)","戰車(The Chariot)","力量(Strength)","隱士(The Hermit)","命運之輪(Wheel of Fortune)","正義(Justice)","吊人(The Hanged Man)","死神(Death)","節制(Temperance)","惡魔(The Devil)","高塔(The Tower)","星星(The Star)","月亮(The Moon)","太陽(The Sun)","審判(Judgement)","世界(The World)"];
    
    majorNames.forEach((name, i) => {
        let num = i < 10 ? `0${i}` : i;
        fullTarotDeck.push({
            id: idCounter++, type: 'major', 
            name: name.split('(')[0], nameEn: name.split('(')[1].replace(')',''),
            keywords: "大牌核心能量、生命週期轉折", element: "光",
            imgUrl: `https://sacred-texts.com/tarot/pkt/img/ar${num}.jpg`
        });
    });

    const suits = [
        { id: 'wands', code: 'wa', name: '權杖 (Wands)', element: '火', keywords: '行動、熱情、靈感' },
        { id: 'cups', code: 'cu', name: '聖杯 (Cups)', element: '水', keywords: '情感、關係、直覺' },
        { id: 'swords', code: 'sw', name: '寶劍 (Swords)', element: '風', keywords: '思想、衝突、真相' },
        { id: 'pentacles', code: 'pe', name: '錢幣 (Pentacles)', element: '土', keywords: '物質、工作、實踐' }
    ];
    const ranks = [
        { name: 'Ace', code: 'ac' }, { name: 'Two', code: '02' }, { name: 'Three', code: '03' },
        { name: 'Four', code: '04' }, { name: 'Five', code: '05' }, { name: 'Six', code: '06' },
        { name: 'Seven', code: '07' }, { name: 'Eight', code: '08' }, { name: 'Nine', code: '09' },
        { name: 'Ten', code: '10' }, { name: 'Page', code: 'pa' }, { name: 'Knight', code: 'kn' },
        { name: 'Queen', code: 'qu' }, { name: 'King', code: 'ki' }
    ];
    const rankKWs = ['新開始','平衡選擇','擴展成果','穩定休息','衝突改變','和諧過渡','評估策略','細節精進','獨立成就','圓滿過度','學習好奇','行動衝動','成熟內在','權威成就'];

    suits.forEach(suit => {
        ranks.forEach((rank, i) => {
            fullTarotDeck.push({
                id: idCounter++, type: 'minor', suit: suit.id,
                name: `${suit.name.split(' ')[0]} ${rank.name}`,
                nameEn: `${rank.name} of ${suit.id.charAt(0).toUpperCase() + suit.id.slice(1)}`,
                keywords: `${suit.keywords}、${rankKWs[i]}`, element: suit.element,
                imgUrl: `https://sacred-texts.com/tarot/pkt/img/${suit.code}${rank.code}.jpg`
            });
        });
    });

    const topics = [
        { id: 'career', label: '工作職涯', icon: 'fa-briefcase' },
        { id: 'love', label: '感情關係', icon: 'fa-heart' },
        { id: 'decision', label: '決策分析', icon: 'fa-bolt' },
        { id: 'general', label: '整體運勢', icon: 'fa-search' }
    ];

    const deckFilters = [
        { id: 'major', label: '大阿爾克那 (22張)' },
        { id: 'all', label: '全套牌 (78張)' },
        { id: 'wands', label: '權杖組 (火)' },
        { id: 'cups', label: '聖杯組 (水)' },
        { id: 'swords', label: '寶劍組 (風)' },
        { id: 'pentacles', label: '錢幣組 (土)' }
    ];

    let activeDeck = [];
    let filterType = 'major';
    let selectedTopic = topics[0];
    let isShuffling = false;

    const els = {
        filter: document.getElementById('deck-filter'),
        topics: document.getElementById('topic-buttons'),
        spread: document.getElementById('spread-area'),
        shuffleBtn: document.getElementById('shuffle-btn'),
        status: document.getElementById('deck-status'),
        cardSlot: document.getElementById('card-display-slot'),
        promptOut: document.getElementById('prompt-output'),
        copyBtn: document.getElementById('copy-btn')
    };

    function init() {
        els.filter.innerHTML = deckFilters.map(f => `<option value="${f.id}">${f.label}</option>`).join('');
        renderTopics();

        els.filter.addEventListener('change', e => { filterType = e.target.value; shuffleAndDeal(); });
        els.shuffleBtn.addEventListener('click', shuffleAndDeal);
        els.copyBtn.addEventListener('click', copyPrompt);
        window.addEventListener('resize', () => { if(!isShuffling) renderSpread(); });

        shuffleAndDeal();
    }

    function renderTopics() {
        els.topics.innerHTML = topics.map(t => `
            <button data-id="${t.id}" class="topic-btn px-4 py-2 rounded-full text-xs whitespace-nowrap border transition-all flex items-center gap-2 shrink-0 ${selectedTopic.id === t.id ? 'bg-accent-purple border-accent-purple text-black font-bold' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}">
                <i class="fas ${t.icon}"></i> ${t.label}
            </button>
        `).join('');
        
        document.querySelectorAll('.topic-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                selectedTopic = topics.find(t => t.id === e.currentTarget.dataset.id);
                renderTopics();
            });
        });
    }

    function shuffleAndDeal() {
        if(isShuffling) return;
        isShuffling = true;
        els.shuffleBtn.classList.add('animate-spin');
        els.status.innerText = '宇宙能量連結中...';

        let filtered = filterType === 'all' ? fullTarotDeck : filterType === 'major' ? fullTarotDeck.filter(c => c.type === 'major') : fullTarotDeck.filter(c => c.suit === filterType);
        activeDeck = [...filtered].sort(() => Math.random() - 0.5);

        renderSpread();
    }

    // 【核心修正：雙列動態佈局，徹底解決邊界溢出與抖動】
    // 【替換這段：動態計算安全間距，絕對不超出黑框】
    function renderSpread() {
        els.spread.innerHTML = '';
        const total = activeDeck.length;
        if (total === 0) return;

        // 超過 22 張強制分兩列
        const rowCount = total > 22 ? 2 : 1;
        const cardsPerRow = Math.ceil(total / rowCount);
        const isMobile = window.innerWidth < 768;

        // 取得容器實際寬度與卡片寬度
        const containerW = els.spread.clientWidth;
        const cardW = isMobile ? 65 : 80; 
        const padding = isMobile ? 40 : 80; // 左右預留安全邊距
        const availableW = containerW - padding;

        // 核心數學：計算每張牌可以分配到的間距，確保整列牌總寬度剛好等於 availableW
        let spacing = cardW;
        if (cardsPerRow > 1) {
            spacing = (availableW - cardW) / (cardsPerRow - 1);
        }
        // 限制最大間距，避免牌太少時分太開
        spacing = Math.min(spacing, cardW + 10);

        // 算出需要往左退疊的負 Margin
        const overlapMargin = spacing - cardW;

        // 建立容器 (移除滾動條，改為絕對置中)
        const wrapper = document.createElement('div');
        wrapper.className = 'w-full h-full flex flex-col justify-center items-center gap-6 md:gap-8';

        for (let r = 0; r < rowCount; r++) {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'flex justify-center items-center'; 
            
            const startIdx = r * cardsPerRow;
            const endIdx = Math.min(startIdx + cardsPerRow, total);
            
            for (let i = startIdx; i < endIdx; i++) {
                const card = activeDeck[i];
                const cardEl = document.createElement('div');
                cardEl.className = 'tarot-card-item is-shuffling';
                
                // 套用精準計算的負 Margin (該列第一張不套用)
                if (i > startIdx) {
                    cardEl.style.marginLeft = `${overlapMargin}px`;
                }
                
                cardEl.style.zIndex = i;
                cardEl.innerHTML = `<div class="tarot-card-back"><i class="fas fa-moon"></i></div>`;
                
                cardEl.addEventListener('click', () => drawCard(card));
                rowDiv.appendChild(cardEl);

                // 瀑布流進場動畫
                setTimeout(() => {
                    cardEl.classList.remove('is-shuffling');
                }, i * 15);
            }
            wrapper.appendChild(rowDiv);
        }

        els.spread.appendChild(wrapper);

        setTimeout(() => {
            isShuffling = false;
            els.shuffleBtn.classList.remove('animate-spin');
            els.status.innerText = `請從下方直覺抽取一張 (共 ${total} 張)`;
        }, total * 15 + 300);
    }

    // === 5. 翻開實際牌面與產生指令 ===
    function drawCard(card) {
        if(isShuffling) return;
        const isReversed = Math.random() > 0.7;
        const orient = isReversed ? '逆位' : '正位';

        // 1. 左側視覺更新 (文字永遠正向，只有圖片反轉)
        els.cardSlot.className = `col-span-1 h-72 md:h-80 bg-[#0A0A0A] border-2 border-accent-purple rounded-2xl flex flex-col items-center justify-center shadow-[0_0_30px_rgba(191,148,255,0.2)] transition-all overflow-hidden relative p-4`;
        els.cardSlot.innerHTML = `
            <div class="w-full h-full flex flex-col items-center justify-center relative z-10">
                <img src="${card.imgUrl}" alt="${card.name}" class="max-h-[60%] w-auto object-contain rounded mb-4 shadow-[0_5px_15px_rgba(0,0,0,0.8)] border border-white/10 transition-transform duration-700 ${isReversed ? 'rotate-180' : ''}">
                <h3 class="text-lg md:text-xl font-bold text-white mb-2 drop-shadow-md">${card.name}</h3>
                <span class="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider ${isReversed ? 'bg-red-900/40 text-red-300 border border-red-900/60' : 'bg-green-900/40 text-green-300 border border-green-900/60'} backdrop-blur-sm">${orient}</span>
            </div>
        `;

        // ==========================================
        // ★ 核心升級：動態互動式 Prompt 煉金邏輯
        // ==========================================

        // 動態條件 A：大阿爾克那 vs 小阿爾克那的解讀視角
        let arcanaFocus = "";
        if (card.type === 'major') {
            arcanaFocus = "這是一張大阿爾克那，請著重於「生命重大轉折、靈魂課題、深層心理狀態」等宏觀視角進行解讀。";
        } else {
            arcanaFocus = `這是一張小阿爾克那 (${card.element}元素)，請著重於「日常生活、具體行動、當下情緒與資源狀態」等微觀視角進行解讀。`;
        }

        // 動態條件 B：正逆位的能量狀態
        let orientFocus = "";
        if (isReversed) {
            orientFocus = "牌面為【逆位】：請探討能量的阻塞、內在的抗拒、延遲、過度執著或需要反思的盲點，並提示需要「疏通與釋放」的方向。";
        } else {
            orientFocus = "牌面為【正位】：請探討能量的順暢流動、外在的顯化優勢，並提示可以「把握與順勢而為」的方向。";
        }

        // 動態條件 C：根據使用者選擇的「焦點領域」給予專屬切入點
        let topicFocus = "";
        if (selectedTopic.id === 'career') topicFocus = "結合職場發展、資源決策或人際合作的利弊";
        if (selectedTopic.id === 'love') topicFocus = "結合情感交流、內在需求或關係經營的狀態";
        if (selectedTopic.id === 'decision') topicFocus = "結合選擇的阻力/助力、直覺指引或行動時機";
        if (selectedTopic.id === 'general') topicFocus = "結合近期的生活狀態與潛意識的投射";

        // 組裝出高質量的「互動式」動態 Prompt
        const promptTxt = `[系統指令 System Instruction]
角色設定：具備心理學視角的資深塔羅解讀師 (Insightful Tarot Reader)

# 占卜情境 (Context)
- 詢問者焦點：${selectedTopic.label}
- 抽出牌卡：${card.name} (${card.nameEn})
- 牌面狀態：${orient}
- 核心關鍵字：${card.keywords}

# 解讀策略 (Strategy)
1. ${arcanaFocus}
2. ${orientFocus}

# 你的任務 (Task)
請以溫暖、客觀且具洞察力的語氣，與詢問者進行「雙向互動式」的解讀。請嚴禁教科書式的背誦，請像一位睿智的朋友般對話。
為了讓解讀真正貼近詢問者的現況，請你的【第一次回覆】嚴格依照以下結構輸出：

1. 【初步能量共振】：${topicFocus}，向詢問者大致解釋這張牌 (${card.name} ${orient}) 在此情境下，傳遞了什麼核心氛圍與初步訊息？
2. 【專屬引導提問】：為了讓後續建議更精準，請根據這張牌的特性與當前焦點，主動向詢問者提出 1~2 個具體的「釐清問題」（例如詢問他們目前的真實感受、遇到的具體事件、或面臨的兩難等），引導他們分享更多細節。

※ 隱藏指令（請勿在第一次回覆中輸出）：結語請溫柔地邀請詢問者回答上述問題。等到詢問者回覆真實情況後，你再根據他們的回答，提供客製化的【破局建議】與深層的【靈魂拷問】。

輸出格式：繁體中文，善用列點與粗體確保排版易讀，語氣自然流暢。`;

        // 將組裝好的指令塞入畫面
        els.promptOut.value = promptTxt;
        els.promptOut.classList.add('text-gray-200');
        
        // 啟用複製按鈕
        els.copyBtn.disabled = false;
        els.copyBtn.className = "px-4 py-2 bg-accent-purple text-black rounded-lg text-xs font-bold tracking-wide transition-all hover:bg-white cursor-pointer shadow-[0_0_15px_rgba(191,148,255,0.4)]";
    }

    async function copyPrompt() {
        await navigator.clipboard.writeText(els.promptOut.value);
        els.copyBtn.innerHTML = '<i class="fas fa-check"></i> 複製成功';
        els.copyBtn.classList.replace('bg-accent-purple', 'bg-green-500');
        setTimeout(() => {
            els.copyBtn.innerHTML = '<i class="fas fa-copy"></i> 複製指令';
            els.copyBtn.classList.replace('bg-green-500', 'bg-accent-purple');
        }, 2000);
    }

    init();
});