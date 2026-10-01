#!/usr/bin/env node
// 掃 EXP/article_*.html，從 h1 + 日期 + 第一個紫色主標 tag 抽出 metadata，更新 articles.json；
// 同一趟也掃 EXP/project_*.html，把日期補進既有 projects.json（首頁 Latest 那格要算進專案）。
// projects.json 的 url / category 是手動維護的（category 那套 dev/ai 分類 HTML 裡抽不到），
// 所以專案這邊只「補 date 欄位」，不重產整份檔案。
// 用法：node tools/build-articles-meta.js [--en]
//   無 flag → 掃 EXP/，寫回 data/articles.json 與 data/projects.json
//   --en   → 掃 en/EXP/，寫回 en/data/ 下的那兩份

const fs = require('fs');
const path = require('path');

const isEn = process.argv.includes('--en');
const root = path.resolve(__dirname, '..');
const baseDir = isEn ? path.join(root, 'en') : root;
const expDir = path.join(baseDir, 'EXP');
const outJson = path.join(baseDir, 'data', 'articles.json');
const projJson = path.join(baseDir, 'data', 'projects.json');

function extractTitle(html) {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!h1Match) return null;
  const inner = h1Match[1];
  const mainBeforeSpan = inner.split(/<span/)[0];
  const main = mainBeforeSpan.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const spanMatch = inner.match(/<span[^>]*text-gradient[^>]*>([\s\S]*?)<\/span>/);
  const sub = spanMatch ? spanMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
  return { main, sub };
}

function extractDate(html) {
  const m = html.match(/fa-calendar[^>]*><\/i>\s*(\d{4}\.\d{2}\.\d{2})/);
  return m ? m[1] : null;
}

/* 專案頁的日期有三種寫法，正規化成 YYYY.MM.DD 一種，前端才只要一套解析：
     2026.09.27             完整日期 → 原樣
     2026.06                只有年月 → 當月 1 號（寧可顯示得舊一點，不要讓首頁宣稱比實際新）
     2026.06 — 2026.07      區間    → 取後面那個（完成時間），再照上面的規則補日
   被正規化過的另外留一個 dateRaw 記原文，看 json 的人才知道畫面上寫的是區間。 */
function normalizeProjectDate(raw) {
  const txt = String(raw).replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&nbsp;/g, ' ').trim();
  // 只認破折號與波浪號當區間分隔，不認 '-'，免得把 2026-09-27 切壞
  const seg = txt.split(/[—–~]/).map(x => x.trim()).filter(Boolean);
  const last = seg[seg.length - 1] || '';
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(last)) return { date: last };
  const ym = last.match(/^(\d{4})\.(\d{2})$/);
  if (ym) return { date: `${ym[1]}.${ym[2]}.01`, dateRaw: txt };
  return null;
}

function extractProjectDate(html) {
  const m = html.match(/fa-calendar[^>]*><\/i>\s*([^<]+)/);
  return m ? normalizeProjectDate(m[1]) : null;
}

function extractCategory(html) {
  const m = html.match(/<span[^>]*text-accent-purple[^>]*rounded[^>]*>([\s\S]*?)<\/span>/);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, '').trim();
}

const files = fs.readdirSync(expDir)
  .filter(n => /^article_\d+\.html$/.test(n))
  .sort((a, b) => {
    const na = parseInt(a.match(/\d+/)[0], 10);
    const nb = parseInt(b.match(/\d+/)[0], 10);
    return na - nb;
  });

const entries = [];
for (const fname of files) {
  const html = fs.readFileSync(path.join(expDir, fname), 'utf8');
  const title = extractTitle(html);
  const date = extractDate(html);
  const category = extractCategory(html);
  const entry = { url: `EXP/${fname}` };
  if (title) {
    entry.title = title.main;
    if (title.sub) entry.subtitle = title.sub;
  }
  if (date) entry.date = date;
  if (category) entry.category = category;
  entries.push(entry);
  console.log(`[${fname}] title="${title?.main || '?'}" date=${date || '?'} category=${category || '?'}`);
}

fs.writeFileSync(outJson, JSON.stringify(entries, null, 2) + '\n', 'utf8');
console.log(`\nWrote ${entries.length} entries to ${path.relative(root, outJson)}`);

/* ---- 專案：以磁碟上實際存在的 project 檔為準，同步 projects.json ----
   url / category 是手動維護的（category 那套 dev/ai 分類 HTML 裡抽不到），所以：
     - json 已有的那筆，原欄位全部保留，只補 date / dateRaw
     - json 指到不存在的檔 → 移除（英文版還沒翻的那幾篇就是這種；翻好之後下一趟自己補回來）
     - 磁碟有檔但 json 沒列 → 補一筆，category 去中文那份抄同一個 url 的值
   這樣中英兩邊跑完腳本就會各自對上自己實際有的檔，不會再出現點了是 404 的連結。 */
const zhProjects = isEn
  ? JSON.parse(fs.readFileSync(path.join(root, 'data', 'projects.json'), 'utf8'))
  : [];
const projects = JSON.parse(fs.readFileSync(projJson, 'utf8'));
const byUrl = new Map(projects.map(x => [x.url, x]));
const onDisk = fs.readdirSync(expDir)
  .filter(n => /^project_\d+\.html$/.test(n))
  .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));

const out = [];
const added = [];
const noDate = [];
for (const fname of onDisk) {
  const url = `EXP/${fname}`;
  let item = byUrl.get(url);
  if (!item) {
    const zh = zhProjects.find(x => x.url === url);
    item = { url };
    if (zh && zh.category) item.category = zh.category;
    added.push(fname);
  }
  byUrl.delete(url);
  const got = extractProjectDate(fs.readFileSync(path.join(expDir, fname), 'utf8'));
  if (got) {
    item.date = got.date;
    if (got.dateRaw) item.dateRaw = got.dateRaw; else delete item.dateRaw;
  } else {
    noDate.push(fname);
  }
  out.push(item);
}
const removed = [...byUrl.keys()];

fs.writeFileSync(projJson, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`\nWrote ${out.length} projects to ${path.relative(root, projJson)}`);
console.log(`  磁碟上 ${onDisk.length} 個檔、有日期 ${out.filter(x => x.date).length} 筆`);
if (added.length) console.log(`  新增 ${added.length} 筆：${added.join(', ')}`);
if (removed.length) console.log(`  移除 ${removed.length} 筆（檔案不存在）：${removed.map(u => u.replace('EXP/', '')).join(', ')}`);
if (noDate.length) console.log(`  抽不到日期 ${noDate.length} 筆：${noDate.join(', ')}`);
