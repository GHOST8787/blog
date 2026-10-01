/* 算首頁 Active 那格的「本月持續開發」= 本月有 push 過的自有 repo 數，
   算完寫進 data/stats.json 與 en/data/stats.json 兩份。
   GitHub Actions 每天跑（.github/workflows/update-stats.yml），也可以本機手動跑。

   用法：
     GH_TOKEN=xxx node tools/count-active-repos.mjs            # 算完寫檔
     GH_TOKEN=xxx node tools/count-active-repos.mjs --dry-run  # 只印不寫
     GH_TOKEN=xxx node tools/count-active-repos.mjs --month=2026-09   # 指定月份（只能印，不寫檔）

   為什麼只看 pushed_at，不用 commits API：
   pushed_at 是該 repo「最後一次 push」的時間，只要 push 就會更新。
   所以對「本月」這個問題，pushed_at >= 本月初 跟「本月有 push 過」是同一件事，
   一次 API 就夠，不必對 43 個 repo 各查一次 commits。
   注意這招只對「當下這個月」成立：拿它回頭數過去的月份會低估——
   9 月推過、10 月又推一次的 repo，pushed_at 已經變 10 月，9 月那次就看不到了。
   真要回頭數歷史月份得改用 commits API 逐 repo 查，這支不做。

   私人 repo 也要算進去（43 個裡有 30 個是私人），所以一定要帶 token。
   token 只需要讀的權限：fine-grained PAT 給 All repositories + Metadata: Read-only 就夠。 */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['data/stats.json', 'en/data/stats.json'];
const TZ = 'Asia/Taipei';            // 「本月」照 Sunny 所在時區算，不照 UTC
const API = 'https://api.github.com';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const monthArg = (args.find(a => a.startsWith('--month=')) || '').slice(8);

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
    console.error('沒有 token。本機跑：GH_TOKEN=$(gh auth token) node tools/count-active-repos.mjs --dry-run');
    process.exit(1);
}

/* 台北時間的「某月第一天 00:00」換成 UTC 的時間戳。
   Intl 拿到台北當下的年月，再用固定的 +08:00 偏移組 ISO 字串（台灣不實施日光節約）。 */
function monthStartUTC(ym) {
    let y, m;
    if (ym) {
        [y, m] = ym.split('-').map(Number);
    } else {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' })
            .format(new Date()).split('-');
        y = Number(parts[0]);
        m = Number(parts[1]);
    }
    // 下個月 1 號不能用 setUTCMonth 推：start 的 UTC 日期是上個月 30/31 號
    // （台北 1 號 00:00 = UTC 前一天 16:00），加一個月會少一天。直接組字串。
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    const pad = n => String(n).padStart(2, '0');
    const start = new Date(`${y}-${pad(m)}-01T00:00:00+08:00`);
    const end = new Date(`${ny}-${pad(nm)}-01T00:00:00+08:00`);
    return { y, m, start, end };
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

const { y, m, start, end } = monthStartUTC(monthArg);
const repos = await listRepos();
// fork 不是自己開發的，不算。archived 的不會有新 push，自然不會進來。
const mine = repos.filter(r => !r.fork);
const active = mine
    .filter(r => {
        const t = new Date(r.pushed_at);
        return t >= start && t < end;
    })
    .sort((a, b) => a.pushed_at < b.pushed_at ? 1 : -1);

console.log(`${y}-${String(m).padStart(2, '0')}（${TZ}）  自有 repo ${mine.length} 個（排除 fork ${repos.length - mine.length} 個）`);
console.log(`區間 ${start.toISOString()} ~ ${end.toISOString()}`);
console.log(`本月有 push 的 ${active.length} 個：`);
active.forEach(r => console.log(`  ${r.pushed_at}  ${r.private ? 'private' : 'public '}  ${r.name}`));

if (monthArg) {
    console.log('\n--month 只用來核對歷史數字，不寫檔（而且回頭數會低估，理由見檔頭註解）');
    process.exit(0);
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
let changed = 0;
for (const rel of TARGETS) {
    const path = join(ROOT, rel);
    const json = JSON.parse(readFileSync(path, 'utf8'));
    const before = json.activeThisMonth;
    if (before === active.length && json.updatedAt === today) {
        console.log(`\n${rel}  ${before} 沒變，不動`);
        continue;
    }
    json.activeThisMonth = active.length;
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
