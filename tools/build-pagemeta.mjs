// 掃全站 HTML，把「路徑 → 顯示標題」寫成 pagemeta.json，給 stats.html 顯示用。
// 資料庫只存路徑，標題在這裡查；查不到的頁面儀表板會退回顯示路徑，不會壞。
// 新增文章之後跑一次：pnpm run build:pagemeta
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'PNG', 'tools', 'components']);
const SKIP_FILES = new Set(['article.example.html', 'article_NEW.html']);

function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
            if (!SKIP_DIRS.has(name)) out.push(...walk(p));
        } else if (name.endsWith('.html') && !SKIP_FILES.has(name)) {
            out.push(p);
        }
    }
    return out;
}

function strip(html) {
    return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

// h1 最貼近讀者看到的標題；沒有 h1 才退回 <title>
function titleOf(src) {
    const h1 = src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) {
        const t = strip(h1[1]);
        if (t) return t.slice(0, 80);
    }
    const t = src.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return t ? strip(t[1]).slice(0, 80) : '';
}

const meta = {};
let skipped = 0;
for (const file of walk(ROOT)) {
    const rel = relative(ROOT, file).split(sep).join('/');
    const t = titleOf(readFileSync(file, 'utf8'));
    if (t) meta[rel] = t; else skipped++;
}

const sorted = {};
for (const k of Object.keys(meta).sort()) sorted[k] = meta[k];
writeFileSync(join(ROOT, 'data', 'pagemeta.json'), JSON.stringify(sorted, null, 1) + '\n', 'utf8');
console.log(`pagemeta.json：${Object.keys(sorted).length} 個頁面有標題，${skipped} 個抓不到（儀表板會顯示路徑）`);
