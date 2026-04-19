# Chill Blog — GHOST.ouo 個人部落格

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-live-4285F4?logo=github&logoColor=white)](https://ghost8787.github.io/blog/)
[![Tailwind](https://img.shields.io/badge/Tailwind-CDN-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

一個專注於 AI 自動化、Python、開發工具與流程自動化實作分享的個人技術部落格。

🌐 **線上預覽**：<https://ghost8787.github.io/blog/>

---

## ✨ 特色

- **Bento Grid 版型** — 參考日式便當盒排版的卡片式首頁
- **互動元素** — 有會轉動的星球頁面（`planet.html`）跟 audio room（`audio_room.html`）
- **無框架** — 純 HTML / CSS / JavaScript，Tailwind 走 CDN，零建置流程
- **文章與作品集** — 透過 `articles.json`、`projects.json` 管理列表，更新 JSON 即可新增內容
- **SEO 最佳化** — 具備 `sitemap.xml`、`robots.txt`、Open Graph meta 標籤

---

## 📂 專案結構

```
blog/
├── index.html              ← 首頁（Bento Grid）
├── articles.html / .json   ← 文章列表頁與資料
├── projects.html / .json   ← 作品集頁與資料
├── planet.html / .js / .css ← 星球互動頁
├── audio_room.html         ← 音樂房
├── article.example.html    ← 文章範本
├── main.js                 ← 主程式
├── style.css               ← 全域樣式
├── components/             ← navbar 等共用元件
├── PNG/ / EXP/             ← 圖片與實驗檔案
└── 404.html                ← 404 頁面
```

---

## 🚀 本地預覽

此專案為純靜態網站，不需 build。

```bash
# 任意 HTTP server 都能跑，例如：
python -m http.server 8000
# 或
npx serve .
```

開瀏覽器到 `http://localhost:8000`。

---

## 📝 新增一篇文章

1. 在 `article.example.html` 複製一份為 `your-article.html`
2. 編輯內容
3. 到 `articles.json` 新增一筆：
   ```json
   {
     "title": "文章標題",
     "date": "2026-04-19",
     "url": "your-article.html",
     "summary": "一句簡介"
   }
   ```
4. commit + push，GitHub Pages 會自動部署

---

## 🛠️ 技術棧

| 項目 | 說明 |
|---|---|
| 前端 | HTML / CSS / JavaScript（無框架） |
| 樣式 | Tailwind CSS（CDN） |
| 字型 | Plus Jakarta Sans / JetBrains Mono / Fredoka |
| 圖示 | Font Awesome 6.4 |
| 部署 | GitHub Pages |

---

## 📄 授權

個人專案，內容版權所有。程式碼可供參考學習。
