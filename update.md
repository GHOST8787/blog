## 網路用×實驗中
Linkedin++
#Automation #coding

### 優先級分類
A_大BUG不修會死 / B_痾應該要做一下 / C_花里胡俏的東西
以後修完他嘛的給我放日期喔 20260207

### 頁面架構
- 主頁面/自己/聯絡
- 文章
- 專案
- 星球 (專案/其他有的沒的隱藏版東西)
- 隱藏版_感謝名單?感激的人?
- 隱藏版_錄音檔放置空間


### 1. 待更新內容 (重要程度_內容)

#### 🗂 暫存未上架（2026-04-11，已部分歸檔）
- `article_09~14.html` → 改名為 `NA_01~06.html`，已從 `articles.json` 移除，之後要上架再改回編號並加回 JSON
- `project_09~13.html` → 改名為 `NP_01~05.html`，已從 `projects.json` 移除，同上
- ⚠️ 2026-04-21 已 cascade rename：NY1 歸位為 P03，原 P03-P08 推到 P04-P09，新增 P10 密室逃脫 + P11 device-tabs-opener；本機仍有未推 P12 草稿

#### A_大BUG不修會死
(目前無)

#### B_痾應該要做一下
- B_My Little Planet：視覺升級（心智圖層級結構，嘗試過但體驗不佳，暫緩）
- B_錄音檔放置空間 頁面

#### 📝 文章待寫清單
> ⚠️ 提醒：想到新文章時，記得寫下 3~5 個重點/關鍵句，不然久了會忘記當初要寫什麼！

1. B_你視AI為...? — 觀點型文章
2. B_關於拖延 GEMINI 個人系統 — 方法論
3. B_台大賽局理論 — 學術延伸
4. B_品牌迷思？cp值? — 商業思考
5. B_把時間開發到極限 做最有效的事情 — 效率方法論
6. B_關於閱讀與體驗 — 生活觀察
7. B_Claude 使用心得 — AI 工具深度體驗
8. B_DISPUTE 投履歷文章 — AI 履歷 Agent 實作
9. B_AI 操縱手機 (A22) — 自動化實驗
10. B_Vibe Coding 的流程 — 開發方法論
11. B_Claude 各種斜線指令 /insights — 工具教學
12. B_大陸程序員 VIDEO 心得 — 觀點分析
13. B_底層邏輯探討學用落差 — 教育/職涯思考
14. B_AI 是否會使人停止思考 — 如果你真的夠懶，你不會停止思考
15. B_記憶力縮短這件事 — 感覺是拿去記真正想要的東西，足夠想要就會想盡方法記住

#### C_花里胡俏的東西
- C_把過去社群的東西整理成紀錄(熱研社那邊)，看要放哪
- C_解鎖畫面
- C_偷塞音樂在背景
- C_唱歌區域->V皮? https://www.youtube.com/watch?v=39Rrh6CKtrU&t=6s
- C_新增AI整理區 心得/源頭/AI內容
- C_關於神仙教母 文章 https://www.instagram.com/reels/DKZYwVbSuij/
- C_關於戀愛 文章 https://www.instagram.com/p/DUQCO6_Emw4/


### 2. 已更新內容 (更新時間_內容)
- 20260510B_padding 加大 + whiteboard hero spacing 微調（whiteboard.html + index.html main 改 px-6 sm:px-8 lg:px-10）
- 20260510B_robots.txt 加 Disallow whiteboard-admin、sitemap.xml 加 whiteboard.html 條目
- 20260510B_index hero CTA 加「Open Whiteboard」按鈕（不放 nav，避免 nav 過度膨脹）
- 20260510A_Whiteboard 公開頁 + admin 頁完整功能（Firebase Auth + ADMIN_UID 比對、pending → approved → done schema、愛心去重靠 likedBy/<uid>、大小階梯 + 王者光環、投稿 modal、admin 審核/駁回/畢業）
- 20260510B_INTJ 去 emoji 規則（UI 文字一律不用 emoji 裝飾，愛心改 fa-heart icon、pulse scale 動畫）
- 20260421B_NY1 cascade rename → project_03（P02 下篇歸位），原 P03-P08 推到 P04-P09
- 20260421B_articles.html 加 filter dropdown（5 選項）+ 卡片編號 badge（A01-A09）
- 20260421B_projects.html 卡片加編號 badge（P01-P11）
- 20260420B_新增 P10 密室逃脫整理表（Claude CoWork + Google Sheets）+ P11 device-tabs-opener（Chrome Extension 上架）
- 20260420B_確立 INTJ 寫作風格 5 條紅線（不踩一捧一、不推銷、只留可佐證、無反思 section、高冷不給壓力）
- 20260420B_確立「不擅自重寫 confirmed 文章」規則（A01-A10 + P01-P09 受保護）
- 20260420B_projects.html filter 從橫向藥丸改成 dropdown（仿 planet 樣式）
- 20260420B_引入 Sheet DEMO 圖（PNG/project_09.1.png）+ Chrome Web Store 截圖（PNG/project_10.1.png）
- 20260419B_GHOST8787 帳號 repo 整理（README 中文化、description 修正）
- 20260406B_Planet workData 全面更新（成果導向描述 + 4 分類對齊 + 座標打散）
- 20260406B_Planet View Work 按鈕（卡片內連結到文章/專案/外部網址）
- 20260406B_Planet Filter 手機支援（CSS hover + JS click toggle 雙模式）
- 20260406B_Planet 觸控旋轉/縮放支援（enablePan=false + touch 設定）
- 20260406B_Planet Loading spinner（Three.js 載入前顯示旋轉圈）
- 20260406B_Planet Canvas 無障礙（role="img" + aria-label）
- 20260406B_Planet OrbitControls 綁定修正（canvas 層，解決 View Work 按鈕無法點擊）
- 20260406B_Open Source 併入 Engineering，金色只給 SECRET 秘密星星
- 20260406B_錄音檔星星連結已連結
- 20260406B_新增 4 篇文章 HTML（海科館/澎湖實習/創業競賽/社展總召）待修改內容
- 20260406B_articles.json 更新（article_09~12）
- 20260406B_projects.json 移除熱研社（未完成不上線）
- 20260406B_planet.js 所有 ??? 連結修正完畢
- 20260406B_update.md 文章待寫清單獨立區塊（20 篇）


### 3. 註解區 (已完成內容)

#### 功能與互動
- 技能循環播放或切換樣式
- 在同一頁重複點擊導覽列時，標題閃爍提示
- 技能顯示速度調整，或設定逐字跳出效果
- 愛心按鈕點擊後顯示數字

#### 頁面與架構
- 頁首頁尾拆分為獨立模板
- 頁首頁尾嵌回主程式 (目前有BUG，顯示不出來)
- 個人架構導引，集中放置所有內容
- My Little Planet 建置
- 寫文章與整理作品集，考慮拆分為兩個頁面
- Email Me 按鈕更換為其他形式

#### 導覽與連結
- project 頁面點擊 about 連結出現 File not found
- about 頁面點擊 contact 連結出現 File not found
- 上方地球圖示更換

#### 版面與樣式
- 主頁面下方三個區塊考慮刪除，或新增照片 (目前無想法)
- 手機版版面有重大BUG需修復
- 網站整體風格調整為更放鬆(Chill)的感覺

#### 已完成的更新項目
- 20260207A_portaly 搬遷
- 20260207A_文章改為三格顯示
- 20260207A_文章左右兩側留白
- 20260208B_關於囚徒困境的文章 https://audreyt.github.io/trust-zh-TW/
- 20260211B_project頁面補上標題
- 20260211B_優化可點擊元素，加入連結或移除點擊特效
- 20260211B_感謝名單錄音檔放置空間連結至星球
- 20260212B_愛心計數從區域儲存改為全域累計 (firebase)
- 20260212B_修復標題閃爍效果
- 20260212B_文章順序調整為從舊到新
- 20260212B_感謝名單以星星視覺化呈現
- 20260223A_統一文章口吻 (INTJ、持續學習、年薪千萬?)
- 20260223A_補上文章圖片，統一 hashtag


### 感謝名單
TMR、魷魚