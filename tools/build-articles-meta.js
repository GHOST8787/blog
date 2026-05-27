#!/usr/bin/env node
// 掃 EXP/article_*.html，從 h1 + 日期 + 第一個紫色主標 tag 抽出 metadata，更新 articles.json
// 用法：node tools/build-articles-meta.js [--en]
//   無 flag → 掃 EXP/，寫回 articles.json
//   --en   → 掃 en/EXP/，寫回 en/articles.json

const fs = require('fs');
const path = require('path');

const isEn = process.argv.includes('--en');
const root = path.resolve(__dirname, '..');
const baseDir = isEn ? path.join(root, 'en') : root;
const expDir = path.join(baseDir, 'EXP');
const outJson = path.join(baseDir, 'articles.json');

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
