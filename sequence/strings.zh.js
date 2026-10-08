// 時序圖工具的中文字串。鍵名必須跟 strings.en.js 一致。
export const title = 'UML 時序圖';
export const subtitle = '鍵盤優先 · 檔案只存在你自己的電腦';

export const btn = {
    save: '下載 .json',
    svg: '下載 .svg',
    open: '開啟 .json / .svg',
    png: '下載 .png',
    copy: '複製 Mermaid 文字',
    copied: '已複製',
    clear: '清空',
    viewDiagram: '圖',
    viewSplit: '分割',
    viewSource: '原始碼',
};
export const hint = {
    file: '檔案',
    view: '檢視',
    saveTip: '把整張圖存成 .json 下載到你自己的電腦',
    svgTip: '下載向量圖 .svg，圖的資料也嵌在裡面，之後可以再開回來編輯',
    openTip: '讀回 .json，或讀 .svg（本工具匯出的完整還原；別處產的會盡量反推並列出認不出來的部分）',
    pngTip: '把目前畫面輸出成 .png 圖檔下載',
    copyTip: '複製 Mermaid sequenceDiagram 文字到剪貼簿',
    clearTip: '清掉所有列（Ctrl+Z 可以救回來）',
};

export const layer = {
    partWhat: (name, kind) => `參與者 ${name}（${kind}）`,
    partKeys: '<b>←→</b> 選隔壁 · <b>Alt+←→</b> 搬欄位 · <b>Tab</b> actor／object · <b>打字</b> 改名',
    blockWhat: (kind, label, a, b) => `區塊 ${kind}「${label}」第 ${a}–${b} 列`,
    blockKeys: '<b>Shift+↑↓</b> 改結束列 · <b>Alt+↑↓</b> 整塊搬 · <b>Tab</b> loop/alt/opt · <b>打字</b> 改名',
    pointWhat: (who, name) => `端點 · ${who} @ ${name}`,
    pointKeys: '<b>←→</b> 換 lifeline · <b>↑↓</b> 換上下一列 · <b>Tab</b> 換另一顆 · <b>Esc</b> 回列',
    rowKeys: '<b>←→</b> 接收方 · <b>Shift+←→</b> 發送方 · <b>Tab</b> 型別 · <b>Shift+Tab</b> 線條 · <b>打字</b> 改內容',
    emptyWhat: '空白',
    emptyKeys: '<b>Alt+M</b> 新增訊息 · <b>Alt+S</b> 階段帶 · <b>Alt+P</b> 參與者',
    more: '全部快捷鍵看右上角 ?',
    sender: '發送端',
    receiver: '接收端',
    selfCall: (name) => `${name} 自呼叫`,
    rowSpan: (a, b) => (a === b ? `第 ${a} 列` : `第 ${a}–${b} 列`),
    phaseWhat: (t) => `階段帶「${t}」`,
    dash: ' · 紫虛線',
};

export const typeLabel = { sync: '同步呼叫', return: '回傳', async: '非同步', self: '自呼叫' };

export const msg = {
    newRow: '新訊息',
    newNote: '備註',
    newPhase: '新階段',
    newPart: '新參與者',
    unnamed: '(未命名)',
    blockLabel: '條件',
    mmHead: 'MERMAID — 邊打邊套用到右邊的圖',
    foot: (p, r, m, s, n, ph, b) =>
        `${p} 個參與者 · ${r} 列（訊息 ${m}、自呼叫 ${s}、Note ${n}、階段帶 ${ph}）· 區塊 ${b}`,
    errLine: (n, m) => `第 ${n} 行：${m}`,
    errFirst: '第一行要是 sequenceDiagram',
    errEnd: '多了一個 end',
    errNoEnd: '有區塊沒有 end',
    errNoPart: '至少要有一個 participant',
    errUnknown: (t) => `看不懂「${t}」`,
    errOrphan: '有訊息指到沒宣告的參與者',
    errFile: '這個檔案看不懂，沒有載入',
    openTitle: '開啟 .json / .svg',
    namePlaceholder: '這張圖的名字',
    nameTip: '取個名字，下載 .json／.svg／.png 就用它當檔名',
    svgBadXml: 'SVG 檔壞了，XML 解析不過',
    svgNotSvg: '這不是 SVG 檔（根節點不是 <svg>）',
    svgNoLifelines: '找不到時序圖的垂直生命線，看起來不是時序圖',
    svgNoRows: '認得出生命線，但一條訊息都抓不出來',
    impOk: (r) => `讀進來了：${r.parts} 個參與者、訊息 ${r.msgs}、自呼叫 ${r.selfs}、Note ${r.notes}、階段帶 ${r.phases}、虛線 ${r.dashed}、圖例 ${r.legend}`,
    impNative: '這是本工具匯出的檔，完整還原',
    impUnknown: (n) => `有 ${n} 個圖形認不出來`,
    impLeftover: (n) => `有 ${n} 段文字沒接上任何元素`,
    impDetail: '看不懂的部分',
    impClose: '關掉',
};

/* 開場示範圖的文字。順序對應 state.js 的 sampleDiagram()，不要調換。 */
export const sample = {
    parts: ['使用者', '前端', 'API', '資料庫'],
    rows: [
        '登入流程', '點擊登入', 'POST /login', '查詢帳號', '回傳雜湊密碼', '比對密碼',
        '回傳 JWT', '存進 httpOnly cookie', '導向首頁',
        '權杖換新', '權杖快過期時自動換新', '新的 JWT',
    ],
    block: '最多重試 3 次',
};

export const legendInit = [
    { tone: 'solid', text: '實線＝一般呼叫' },
    { tone: 'dash', text: '虛線＝待確認／外部相依' },
];

export const help = {
    head: '鍵盤操作',
    lead: '焦點分四層。方向鍵做什麼，看你現在在哪一層 —— 畫面上那條狀態列永遠寫著。',
    secCross: '跨層移動',
    secCrossNote: '（任何時候都能按）',
    secRow: '列層',
    secRowNote: '（預設）',
    secPoint: '端點層',
    secPointNote: '（Ctrl+←→ 進入）',
    secBlock: '區塊層',
    secBlockNote: '（Ctrl+↑ 進入）',
    secPart: '參與者層',
    secPartNote: '（↑ 到頂 或 點頂框）',
    secAdd: '新增與檔案',
    rows: {
        cross: [
            ['Ctrl+←→', '進「端點層」，單獨抓住箭頭的頭或尾'],
            ['Ctrl+↑', '往上一層：列 → 包住它的區塊 → 參與者'],
            ['Ctrl+↓ ／ Esc', '退回下一層'],
            ['Ctrl+Z', '復原（Ctrl+Shift+Z 重做）'],
        ],
        row: [
            ['↑↓', '換列。停在第 1 列再按 ↑ 就上到參與者那一排'],
            ['←→', '移動接收方。經過發送方那一條時自動變成自呼叫'],
            ['Shift+←→', '移動發送方'],
            ['Tab', '切箭頭型別（同步／回傳／非同步）'],
            ['Shift+Tab', '切線條標註（實線／紫虛線）'],
            ['Enter 或直接打字', '進編輯，整段反白；Enter 送出、Shift+Enter 送出並接著打下一列'],
            ['Ctrl+Enter（編輯中）', '在文字裡斷一行。訊息、Note、階段帶都可以多行'],
            ['Alt+↑↓', '把這列往上下搬'],
            ['Shift+↑↓', '擴選連續幾列（滑鼠 Shift+點 也可以）'],
            ['Ctrl+Enter', '把選取的列包成區塊'],
            ['Backspace', '刪掉選取的列'],
        ],
        point: [
            ['←→', '這一顆端點換到別條 lifeline'],
            ['↑↓', '直接換上下一列，順便退回列層，不用先按 Esc'],
            ['Tab', '在頭 / 尾兩顆之間切'],
            ['Backspace', '刪掉這一列'],
        ],
        block: [
            ['↑↓', '在同一位置的多層區塊之間換'],
            ['Shift+↑↓', '改這個區塊框到第幾列結束'],
            ['Alt+↑↓', '整塊連內容一起搬'],
            ['Tab ／ Enter ／ Backspace', '切 loop／alt／opt ／ 改名 ／ 拆掉'],
        ],
        part: [
            ['←→', '選隔壁那一個'],
            ['Alt+←→', '搬動欄位順序'],
            ['Tab ／ Enter ／ Backspace', '切 actor／object ／ 改名 ／ 刪掉'],
            ['刪掉一欄', '指著它的訊息不會消失，會自動改接左邊鄰居'],
        ],
        add: [
            ['Alt+M', '新增一條訊息'],
            ['Alt+N', '在這一列上方插入 Note'],
            ['Alt+S', '插入階段分隔帶'],
            ['Alt+P', '新增參與者'],
            ['Ctrl+Enter', '把選取的列包成區塊'],
            ['Backspace', '刪掉選取的東西'],
            ['Ctrl+Z', '復原（Ctrl+Shift+Z 重做）'],
        ],
    },
    pin: '選到任何東西直接打字就開始改，跟雙擊文字一樣。滑鼠：點什麼就選什麼，端點、Note、參與者頂框都能拖。點一下這個 <b>?</b> 把面板釘住。',
};
