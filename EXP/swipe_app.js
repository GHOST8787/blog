/* ============================================================
   滑卡問卷互動模組（嵌在 NP_11 文章內）
   互動：拖曳最上面那張卡，往右放開＝同意、往左＝不同意
   流程：6 張題目卡 → 結果頁顯示「型別」＋「你 vs 大家」鏡子
   所有 DOM 都在文章內 #sw-module 容器裡，靠 sw- 前綴 ID 取得
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {

  // 沒有這個模組的頁面（其他文章）直接跳過
  const stage = document.getElementById('sw-stage');
  if (!stage) return;

  // ----- 題庫：crowdYes＝大家答「同意」的比例（示意用假資料） -----
  const QUESTIONS = [
    { text: '我習慣把手機通知幾乎全部關掉',            crowdYes: 0.38 },
    { text: '待辦清單沒打勾，我會渾身不對勁',           crowdYes: 0.61 },
    { text: '比起先排好計畫，我更喜歡臨時決定',          crowdYes: 0.44 },
    { text: '一個人吃飯，比揪一桌還自在',              crowdYes: 0.52 },
    { text: '新的 App 我喜歡自己亂點摸索，不看教學',      crowdYes: 0.73 },
    { text: '我會為了真的喜歡的東西熬夜',              crowdYes: 0.66 },
  ];

  // ----- 結果型別：依「同意」題數落點，給一個輕鬆的型別 -----
  const TYPES = [
    { min: 0, max: 1, name: '穩定派',   desc: '你對大部分事情都有保留，不輕易說同意。問卷在你手上會很誠實，因為你不會為了填完而亂選。' },
    { min: 2, max: 3, name: '選擇派',   desc: '你只對在意的事點頭，其他都隨意。這代表你的每個「同意」都比別人更有份量。' },
    { min: 4, max: 5, name: '投入派',   desc: '你願意對很多事說好，行動力強。代價是有時會一次扛太多，記得幫自己留白。' },
    { min: 6, max: 6, name: '全壘打派', desc: '你對每一題都同意。要嘛你真的很開放，要嘛你滑得太快了，這正是長問卷最後會發生的事。' },
  ];

  // ----- DOM 參照 -----
  const els = {
    stage,
    progressFill: document.getElementById('sw-progress-fill'),
    progressText: document.getElementById('sw-progress-text'),
    hint: document.getElementById('sw-hint'),
    pills: document.getElementById('sw-pills'),
    result: document.getElementById('sw-result'),
    typeName: document.getElementById('sw-type-name'),
    typeDesc: document.getElementById('sw-type-desc'),
    mirrorRows: document.getElementById('sw-mirror-rows'),
    btnYes: document.getElementById('sw-yes'),
    btnNo: document.getElementById('sw-no'),
    restart: document.getElementById('sw-restart'),
  };

  let current = 0;       // 目前在最上面的卡片 index
  const answers = [];    // 每題答案：true=同意 / false=不同意
  let cardNodes = [];    // 卡片 DOM 陣列
  let drag = null;       // 拖曳狀態

  // ----- 建立全部卡片並堆疊 -----
  function buildCards() {
    els.stage.innerHTML = '';
    cardNodes = QUESTIONS.map((q, i) => {
      const card = document.createElement('div');
      card.className = 'sw-card';
      card.innerHTML = `
        <div class="sw-stamp yes">同意</div>
        <div class="sw-stamp no">不同意</div>
        <div class="sw-q-index">第 ${i + 1} 題</div>
        <div class="sw-q-text">${q.text}</div>
        <div class="sw-q-foot">往右滑同意，往左滑不同意</div>`;
      els.stage.appendChild(card);
      return card;
    });
    layoutStack();
    attachDrag();
  }

  // ----- 依與 current 的距離排版：最上面那張正常，後面的縮小往下退 -----
  function layoutStack() {
    cardNodes.forEach((card, i) => {
      const depth = i - current;                 // 0=最上面，<0=已答完
      if (depth < 0 || depth > 2) { card.style.display = 'none'; return; }
      card.style.display = 'flex';
      card.style.zIndex = String(100 - depth);
      card.style.transition = 'transform .4s cubic-bezier(.23,1,.32,1)';
      card.style.transform = `translateY(${depth * 14}px) scale(${1 - depth * 0.05})`;
      card.style.opacity = depth === 2 ? '0.6' : '1';
      card.style.pointerEvents = depth === 0 ? 'auto' : 'none';   // 只有最上面那張可互動
    });
  }

  // ----- 拖曳手勢 -----
  function attachDrag() {
    cardNodes.forEach((card, i) => {
      card.addEventListener('pointerdown', (e) => {
        if (i !== current) return;               // 只有 current 卡可拖
        card.setPointerCapture(e.pointerId);
        drag = { startX: e.clientX, startY: e.clientY, card };
        card.style.transition = 'none';          // 拖曳中關掉過渡，跟手
      });
      card.addEventListener('pointermove', (e) => {
        if (!drag || drag.card !== card) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
        card.querySelector('.sw-stamp.yes').style.opacity = dx > 0 ? Math.min(dx / 90, 1) : 0;
        card.querySelector('.sw-stamp.no').style.opacity  = dx < 0 ? Math.min(-dx / 90, 1) : 0;
      });
      const endDrag = (e) => {
        if (!drag || drag.card !== card) return;
        const dx = e.clientX - drag.startX;
        const threshold = 95;                    // 超過就算作答，否則彈回
        if (dx > threshold) commit(true);
        else if (dx < -threshold) commit(false);
        else snapBack(card);
        drag = null;
      };
      card.addEventListener('pointerup', endDrag);
      card.addEventListener('pointercancel', endDrag);
    });
  }

  // ----- 沒滑到位 → 彈回原位 -----
  function snapBack(card) {
    card.style.transition = 'transform .3s cubic-bezier(.23,1,.32,1)';
    card.style.transform = 'translateY(0) scale(1)';
    card.querySelector('.sw-stamp.yes').style.opacity = 0;
    card.querySelector('.sw-stamp.no').style.opacity = 0;
  }

  // ----- 確定一題答案：把卡甩出容器 → 換下一張 / 收尾 -----
  function commit(isYes) {
    const card = cardNodes[current];
    answers[current] = isYes;
    const flyX = (els.stage.clientWidth + 200) * (isYes ? 1 : -1);
    card.style.transition = 'transform .45s ease-in, opacity .45s';
    card.style.transform = `translate(${flyX}px, -40px) rotate(${isYes ? 22 : -22}deg)`;
    card.style.opacity = '0';

    current++;
    updateProgress();
    if (current >= QUESTIONS.length) setTimeout(showResult, 320);
    else layoutStack();
  }

  // ----- 進度條 -----
  function updateProgress() {
    const done = Math.min(current, QUESTIONS.length);
    els.progressFill.style.width = (done / QUESTIONS.length * 100) + '%';
    els.progressText.textContent = current < QUESTIONS.length
      ? `第 ${current + 1} / ${QUESTIONS.length} 題`
      : '完成';
  }

  // ----- 結果頁：算型別 + 畫「你 vs 大家」鏡子 -----
  function showResult() {
    els.stage.style.display = 'none';
    els.hint.style.display = 'none';
    els.pills.style.display = 'none';

    const yesCount = answers.filter(Boolean).length;
    const type = TYPES.find(t => yesCount >= t.min && yesCount <= t.max) || TYPES[1];
    els.typeName.textContent = type.name;
    els.typeDesc.textContent = type.desc;

    els.mirrorRows.innerHTML = '';
    QUESTIONS.forEach((q, i) => {
      const youAgree = answers[i];
      const crowdPct = Math.round(q.crowdYes * 100);
      const crowdMajorityAgree = q.crowdYes >= 0.5;
      const isOdd = youAgree !== crowdMajorityAgree;     // 你跟多數人相反

      const row = document.createElement('div');
      row.className = 'sw-row' + (isOdd ? ' odd' : '');
      row.innerHTML = `
        <div class="sw-label">
          <span>${q.text}</span>
          <span class="sw-you ${youAgree ? 'agree' : 'disagree'}">${youAgree ? '你同意' : '你不同意'}</span>
        </div>
        <div class="sw-bar"><span></span></div>
        <div class="sw-crowd">${crowdPct}% 的人同意這題${isOdd ? ' · 你跟多數人相反' : ''}</div>`;
      els.mirrorRows.appendChild(row);
      setTimeout(() => { row.querySelector('.sw-bar > span').style.width = crowdPct + '%'; }, 120 + i * 90);
    });

    els.result.style.display = 'block';
  }

  // ----- 鍵盤左右鍵 / 備援按鈕（主互動仍是滑） -----
  function answerTop(isYes) {
    if (current >= QUESTIONS.length || !cardNodes[current]) return;
    const card = cardNodes[current];
    card.style.transition = 'transform .12s';
    card.style.transform = `translate(${isYes ? 40 : -40}px,0) rotate(${isYes ? 5 : -5}deg)`;
    setTimeout(() => commit(isYes), 80);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    // 只有模組捲動到畫面內、且還有題目時才回應，避免干擾閱讀其他段落
    const r = els.stage.getBoundingClientRect();
    const inView = r.top < window.innerHeight && r.bottom > 0;
    if (!inView || current >= QUESTIONS.length) return;
    e.preventDefault();
    answerTop(e.key === 'ArrowRight');
  });
  els.btnYes.addEventListener('click', () => answerTop(true));
  els.btnNo.addEventListener('click', () => answerTop(false));

  // ----- 重玩 -----
  els.restart.addEventListener('click', () => {
    current = 0; answers.length = 0;
    els.result.style.display = 'none';
    els.stage.style.display = 'block';
    els.hint.style.display = 'block';
    els.pills.style.display = 'flex';
    updateProgress();
    buildCards();
  });

  // ----- 啟動 -----
  buildCards();
  updateProgress();
});
