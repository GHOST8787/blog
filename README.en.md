[繁體中文](./README.md) | **English**

# Chill Blog — GHOST.ouo Personal Blog

> 📅 Project started: 2026-01

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-live-4285F4?logo=github&logoColor=white)](https://ghost8787.github.io/blog/)
[![Tailwind](https://img.shields.io/badge/Tailwind-CDN-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

A bilingual personal tech blog focused on AI automation, Python, developer tools, and workflow automation write-ups.

🌐 **Live**: <https://ghost8787.github.io/blog/> (English version: <https://ghost8787.github.io/blog/en/>)

---

## ✨ Features

- **Bento Grid layout** — card-based homepage inspired by Japanese bento-box arrangements
- **Bilingual (zh-TW / en)** — the `en/` directory mirrors the English site; both sides are kept in sync
- **Interactive elements** — a rotating planet page (`planet.html`), an audio room (`audio_room.html`), and a Send Love button backed by Firebase Realtime DB
- **No framework** — pure HTML / CSS / JavaScript with Tailwind via CDN; zero build step
- **Articles & portfolio** — lists are managed through `articles.json` and `projects.json`; add content by editing JSON; homepage stats are computed dynamically (Projects counts `projects.json` entries, Active reads `stats.json`)
- **SEO-ready** — ships with `sitemap.xml`, `robots.txt`, and Open Graph meta tags

---

## 📂 Project Structure

```
blog/
├── index.html              ← homepage (Bento Grid)
├── articles.html / .json   ← article list page and data
├── projects.html / .json   ← portfolio page and data
├── stats.json              ← homepage "active this month" number (manually maintained)
├── planet.html / .js / .css ← interactive planet page
├── audio_room.html         ← audio room
├── article.example.html    ← article template
├── main.js                 ← main script
├── style.css               ← global styles
├── components/             ← shared components (navbar, etc.)
├── en/                     ← English mirror site (with its own stats.json)
├── PNG/ / EXP/             ← images and experiments
└── 404.html                ← 404 page
```

---

## 🚀 Local Preview

This is a pure static site — no build required.

```bash
# Any HTTP server works, e.g.:
python -m http.server 8000
# or
npx serve .
```

Open `http://localhost:8000` in your browser.

---

## 📝 Adding an Article

1. Copy `article.example.html` to `your-article.html`
2. Edit the content
3. Add an entry to `articles.json`:
   ```json
   {
     "title": "Article title",
     "date": "2026-04-19",
     "url": "your-article.html",
     "summary": "One-line summary"
   }
   ```
4. Make the corresponding update under `en/` (keep zh/en in sync)
5. Before publishing, update the "active this month" number in both `stats.json` files (root and `en/`)
6. Commit + push; GitHub Pages deploys automatically

---

## 🛠️ Tech Stack

| Item | Details |
|---|---|
| Frontend | HTML / CSS / JavaScript (no framework) |
| Styling | Tailwind CSS (CDN) |
| Interactivity | Three.js (planet page), Firebase Realtime DB (Send Love) |
| Fonts | Plus Jakarta Sans / JetBrains Mono / Fredoka |
| Icons | Font Awesome 6.4 |
| Deployment | GitHub Pages |

---

## 📄 License

Personal project; content copyrighted. Code may be used for reference and learning.
