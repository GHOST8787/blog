// push 前的檢查。專治換成預編譯 Tailwind 之後最容易出的三種錯：
//   1. 還有頁面在引 cdn.tailwindcss.com（改到一半）
//   2. 有頁面用了 Tailwind class 卻沒引 tw.css（樣式整頁消失）
//   3. 改過 class 忘記重跑 build，tw.css 跟原始碼對不上（線上少那個樣式）
// 外加 JS 語法檢查（2026-09-26 補）：
//   4. 每支 .js 都解析一次。有 import/export 的必須用 module 模式，
//      因為 `node --check 檔.js` 是 CommonJS 解析，遇到 import 就放棄，
//      連 const 重複宣告都會回 exit 0。實際踩過：meet.js 的 slotMount 重複宣告
//      逃過 node --check，靠瀏覽器 pageerror 才抓到。
// 用法：pnpm lint
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const problems = [];

function walk(dir, ext, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === '.git' || name === 'node_modules' || name === 'PNG') continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, ext, out);
        else if (name.endsWith(ext)) out.push(p);
    }
    return out;
}

const pages = walk(ROOT, '.html');
let missing = 0, cdn = 0;
for (const p of pages) {
    const rel = relative(ROOT, p).replace(/\\/g, '/');
    const s = readFileSync(p, 'utf8');
    // 只認真正的 script 標籤；註解裡提到這個網域不算
    if (/<script[^>]*src=["']https:\/\/cdn\.tailwindcss\.com/.test(s)) {
        problems.push(`${rel} 還在引 Tailwind CDN`);
        cdn++;
    }
    // 元件片段沒有 <head>，不算
    if (!s.includes('<head')) continue;
    if (!s.includes('tw.css')) {
        problems.push(`${rel} 沒有引 tw.css`);
        missing++;
    }
}
console.log(`掃 ${pages.length} 個 HTML：引 CDN 的 ${cdn} 個、缺 tw.css 的 ${missing} 個`);

// JS 語法：含 import/export 的一律走 module 模式，其餘用一般模式
const scripts = walk(ROOT, '.js').concat(walk(ROOT, '.mjs'));
let broken = 0, asModule = 0;
for (const p of scripts) {
    const rel = relative(ROOT, p).replace(/\\/g, '/');
    const src = readFileSync(p, 'utf8');
    // module 判定看有沒有 top-level import / export
    const isModule = p.endsWith('.mjs') || /^\s*(import|export)\s/m.test(src);
    if (isModule) asModule++;
    // node --check 認副檔名，所以 module 要先落成 .mjs 再檢查
    const target = isModule && !p.endsWith('.mjs') ? join(ROOT, '.syntax-check.mjs') : p;
    try {
        if (target !== p) writeFileSync(target, src);
        execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' });
    } catch (e) {
        // node 的錯誤訊息裡是暫存檔名，換回真實檔名才看得懂
        const msg = (e.stderr?.toString() || e.message)
            .replace(/.*\.syntax-check\.mjs/g, rel)
            .split('\n').filter(Boolean).slice(0, 3).join(' / ');
        problems.push(`${rel} 語法錯誤：${msg}`);
        broken++;
    } finally {
        if (target !== p && existsSync(target)) rmSync(target);
    }
}
console.log(`掃 ${scripts.length} 個 JS（其中 ${asModule} 個用 module 模式）：語法錯誤 ${broken} 個`);

// tw.css 是不是最新的
const TMP = join(ROOT, '.tw-check.css');
try {
    execFileSync('pnpm', ['dlx', 'tailwindcss@3', '-i', 'tools/tailwind-input.css', '-o', '.tw-check.css', '--minify'],
        { cwd: ROOT, stdio: 'pipe', shell: process.platform === 'win32' });
    const fresh = readFileSync(TMP, 'utf8');
    const shipped = readFileSync(join(ROOT, 'tw.css'), 'utf8');
    if (fresh === shipped) {
        console.log(`tw.css 是最新的（${shipped.length} bytes）`);
    } else {
        problems.push(`tw.css 跟原始碼對不上（現有 ${shipped.length} bytes，重新 build 出來 ${fresh.length} bytes）— 跑 pnpm run build:css`);
    }
} catch (e) {
    problems.push('重新 build 失敗，無法確認 tw.css 是最新的：' + (e.stderr?.toString().slice(0, 200) || e.message));
} finally {
    if (existsSync(TMP)) rmSync(TMP);
}

if (problems.length) {
    console.error('\n有問題 ' + problems.length + ' 項：');
    for (const x of problems) console.error('  !! ' + x);
    process.exit(1);
}
console.log('全部通過');
