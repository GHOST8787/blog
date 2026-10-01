/* 算首頁 Active 那格的「近 30 天持續開發」= 最近 30 天有 push 過的自有 repo 數，
   算完寫進 data/stats.json 與 en/data/stats.json 兩份。
   GitHub Actions 每天跑（.github/workflows/update-stats.yml），也可以本機手動跑。

   用法：
     GH_TOKEN=xxx node tools/count-active-repos.mjs            # 算完寫檔
     GH_TOKEN=xxx node tools/count-active-repos.mjs --dry-run  # 只印不寫
     GH_TOKEN=xxx node tools/count-active-repos.mjs --days=90  # 換視窗長度（只印，不寫檔）

   為什麼用滾動 30 天，不用日曆月：
   日曆月每到 1 號就歸零，首頁那格會從 10 掉到 1、2，看起來像整個站停擺，
   而且得處理台北時區的月初邊界與跨年（這裡原本就寫錯過一次）。
   滾動視窗只要 now - 30 天，沒有邊界問題，數字也平滑。

   為什麼只看 pushed_at，不用 commits API：
   pushed_at 是該 repo「最後一次 push」的時間，只要 push 就會更新，
   所以 pushed_at >= 30 天前 跟「這 30 天內有 push 過」是同一件事。
   一次 API 就夠，不必對 31 個 repo 各查一次 commits。

   私人 repo 也要算進去（自有 repo 裡有 30 個是私人），所以一定要帶 token。
   token 只需要讀的權限：fine-grained PAT 給 All repositories + Metadata: Read-only 就夠。 */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['data/stats.json', 'en/data/stats.json'];
const FIELD = 'activeLast30Days';
const TZ = 'Asia/Taipei';            // updatedAt 寫 Sunny 所在時區的日期，不寫 UTC
const API = 'https://api.github.com';
const DEFAULT_DAYS = 30;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const daysArg = Number((args.find(a => a.startsWith('--days=')) || '').slice(7)) || 0;
const days = daysArg || DEFAULT_DAYS;

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
    console.error('沒有 token。本機跑：GH_TOKEN=$(gh auth token) node tools/count-active-repos.mjs --dry-run');
    process.exit(1);
}

async function listRepos() {
    const out = [];
    for (let page = 1; page <= 10; page++) {
        const r = await fetch(`${API}/user/repos?per_page=100&page=${page}&affiliation=owner`, {
            headers: {
                authorization: `Bearer ${token}`,
                accept: 'application/vnd.github+json',
                'user-agent': 'ghost-blog-stats'
            }
        });
        if (!r.ok) throw new Error(`列 repo 失敗 HTTP ${r.status} ${await r.text()}`);
        const batch = await r.json();
        out.push(...batch);
        if (batch.length < 100) break;
    }
    return out;
}

const since = new Date(Date.now() - days * 86400000);
const repos = await listRepos();
// fork 不是自己開發的，不算。archived 的不會有新 push，自然不會進來。
const mine = repos.filter(r => !r.fork);
const active = mine
    .filter(r => new Date(r.pushed_at) >= since)
    .sort((a, b) => a.pushed_at < b.pushed_at ? 1 : -1);

console.log(`近 ${days} 天  自有 repo ${mine.length} 個（排除 fork ${repos.length - mine.length} 個）`);
console.log(`區間 ${since.toISOString()} ~ 現在`);
console.log(`有 push 的 ${active.length} 個：`);
active.forEach(r => console.log(`  ${r.pushed_at}  ${r.private ? 'private' : 'public '}  ${r.name}`));

if (daysArg) {
    console.log(`\n--days 只用來試算，不寫檔（檔案欄位是 ${FIELD}，固定 ${DEFAULT_DAYS} 天）`);
    process.exit(0);
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
let changed = 0;
for (const rel of TARGETS) {
    const path = join(ROOT, rel);
    const json = JSON.parse(readFileSync(path, 'utf8'));
    const before = json[FIELD];
    if (before === active.length && json.updatedAt === today) {
        console.log(`\n${rel}  ${before} 沒變，不動`);
        continue;
    }
    json[FIELD] = active.length;
    json.updatedAt = today;
    if (dryRun) {
        console.log(`\n${rel}  ${before} → ${active.length}（dry-run，沒寫）`);
        continue;
    }
    writeFileSync(path, JSON.stringify(json, null, 2) + '\n', 'utf8');
    console.log(`\n${rel}  ${before} → ${active.length}  updatedAt=${today}`);
    changed++;
}
// workflow 靠這一行決定要不要 commit
console.log(`\nCHANGED=${changed}`);
