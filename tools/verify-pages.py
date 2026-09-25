# -*- coding: utf-8 -*-
"""
GHOST.ouo 部落格頁面驗證器（BLOG_SOP §10.4）

固定用這一支，不要每次現寫拋棄式腳本。

用法：
    python tools/verify-pages.py EXP/project_30.html en/EXP/project_30.html
    python tools/verify-pages.py --all-changed          # git status 有動過的 .html
    python tools/verify-pages.py --shot EXP/project_30.html   # 另外存 375/1280 截圖

檢查項（每個檔在 375 與 1280 各跑一次）：
    段落數 / 中位字數 / 最長段落 / 正文字數
    章節清單（h3）/ h4 / 引用塊 / 清單 / 程式塊 / 連結數
    圖片是否載入、可見 figure 數
    橫向溢出（扣掉 overflow-auto 容器內的合法溢出）
    404、JS 錯誤
    禁用句型（否定對比）、裝飾性 emoji

回傳碼：全部通過 0，任一項有問題 1。
"""
import argparse
import asyncio
import functools
import http.server
import pathlib
import re
import socketserver
import statistics
import subprocess
import sys
import threading

ROOT = pathlib.Path(__file__).resolve().parent.parent   # blog/
PORT = 8791

BANNED = re.compile(r'並非|不是.{0,12}而是|不只是|而不(是|靠|用|在|由|為)')
EMOJI = re.compile('[\U0001F300-\U0001FAFF☀-➿]')

PAGE_JS = r"""() => {
  const de = document.documentElement;
  const art = document.querySelector('article');
  const ps = art ? [...art.querySelectorAll(':scope > p')]
      .map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(t => t.length) : [];
  const over = [...document.querySelectorAll('main *')].filter(e => {
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1))) return false;
    let a = e.parentElement;
    while (a && a !== document.body) {
      const ox = getComputedStyle(a).overflowX;
      if (ox === 'auto' || ox === 'scroll') return false;
      a = a.parentElement;
    }
    return true;
  }).slice(0, 4).map(e => e.tagName + '.' + (e.className || '').toString().slice(0, 32));
  return {
    overflowX: de.scrollWidth - de.clientWidth,
    realOverflow: over,
    images: [...document.images].map(i => ({ n: i.src.split('/').pop(), ok: i.naturalWidth > 0 })),
    visibleFigures: [...document.querySelectorAll('figure')]
        .filter(f => getComputedStyle(f).display !== 'none').length,
    plens: ps.map(t => t.length),
    total: ps.join('').length,
    heads: art ? [...art.querySelectorAll('h3')].map(h => h.textContent.replace(/\s+/g, ' ').trim()) : [],
    h4: art ? art.querySelectorAll('h4').length : 0,
    quotes: art ? art.querySelectorAll('blockquote').length : 0,
    lists: art ? art.querySelectorAll('ul,ol').length : 0,
    pre: art ? art.querySelectorAll('pre').length : 0,
    links: art ? art.querySelectorAll('a').length : 0,
  };
}"""


def changed_html():
    out = subprocess.run(['git', 'status', '--porcelain'], cwd=ROOT,
                         capture_output=True, text=True).stdout
    files = []
    for line in out.splitlines():
        p = line[3:].strip().strip('"')
        if p.endswith('.html') and (ROOT / p).exists():
            files.append(p)
    return files


def static_scan(rel):
    """不開瀏覽器也能查的：禁用句型、emoji、檔案大小。"""
    text = (ROOT / rel).read_text(encoding='utf-8')
    problems = []
    for m in BANNED.finditer(text):
        line = text[:m.start()].count('\n') + 1
        problems.append('第 %d 行禁用句型「%s」' % (line, m.group(0)))
    emo = EMOJI.findall(text)
    if emo:
        problems.append('裝飾性 emoji %d 個：%s' % (len(emo), ''.join(emo[:5])))
    return problems, text.count('\n') + 1


async def run(files, shot):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', PORT),
                                   functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    from playwright.async_api import async_playwright

    failed = False
    shots = ROOT.parent / '_verify_shots'
    if shot:
        shots.mkdir(exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for rel in files:
            print('=' * 8, rel)
            probs, nlines = static_scan(rel)
            print('  檔案 %d 行' % nlines)
            for x in probs:
                print('  [風格] ' + x)
                failed = True
            if not probs:
                print('  [風格] 禁用句型 0、emoji 0')

            for width in (375, 1280):
                page = await browser.new_page(viewport={'width': width, 'height': 900})
                errors, bad = [], []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('response', lambda r: bad.append('%d %s' % (r.status, r.url.split('/')[-1]))
                        if r.status >= 400 and 'favicon' not in r.url else None)
                await page.goto('http://127.0.0.1:%d/%s' % (PORT, rel.replace('\\', '/')),
                                wait_until='networkidle')
                await page.wait_for_timeout(1300)
                # 捲到底再回頂，逼 loading="lazy" 的圖真的發請求，
                # 否則視窗外的圖 naturalWidth 為 0 會被誤判成壞圖
                await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                await page.wait_for_timeout(1200)
                await page.evaluate('window.scrollTo(0, 0)')
                await page.wait_for_timeout(400)
                info = await page.evaluate(PAGE_JS)

                if width == 1280:
                    pl = info['plens']
                    if pl:
                        print('  段落 %d ｜ 中位 %d ｜ 最長 %d ｜ 正文 %d 字'
                              % (len(pl), int(statistics.median(pl)), max(pl), info['total']))
                    print('  h3 %d ｜ h4 %d ｜ 引用 %d ｜ 清單 %d ｜ 程式塊 %d ｜ 連結 %d'
                          % (len(info['heads']), info['h4'], info['quotes'],
                             info['lists'], info['pre'], info['links']))
                    for h in info['heads']:
                        print('    § ' + h)

                broken = [i['n'] for i in info['images'] if not i['ok']]
                line = '  @%-5d 溢出 %s' % (width, info['overflowX'])
                if info['realOverflow']:
                    line += ' ⚠ %s' % info['realOverflow']
                    failed = True
                if broken:
                    line += ' ｜ 壞圖 %s' % broken
                    failed = True
                if bad:
                    line += ' ｜ 404 %s' % bad
                    failed = True
                if errors:
                    line += ' ｜ JS錯 %s' % errors
                    failed = True
                if not (info['realOverflow'] or broken or bad or errors):
                    line += ' ｜ 圖 %d 張全載入 ｜ 無 404 無 JS 錯' % len(info['images'])
                print(line)

                if shot:
                    name = rel.replace('/', '_').replace('\\', '_').replace('.html', '')
                    await page.screenshot(path=str(shots / ('%s_%d.png' % (name, width))),
                                          full_page=(width == 1280))
                await page.close()
        await browser.close()
    httpd.shutdown()
    if shot:
        print('\n截圖存在 %s（看完請刪，BLOG_SOP §10.5）' % shots)
    return failed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='*', help='相對 blog/ 的 html 路徑')
    ap.add_argument('--all-changed', action='store_true', help='吃 git status 有動過的 html')
    ap.add_argument('--shot', action='store_true', help='另外存 375/1280 截圖')
    args = ap.parse_args()

    files = list(args.files)
    if args.all_changed:
        files += [f for f in changed_html() if f not in files]
    if not files:
        print('沒有要驗的檔。用法看檔頭 docstring。')
        return 0

    missing = [f for f in files if not (ROOT / f).exists()]
    if missing:
        print('找不到：%s' % missing)
        return 1

    failed = asyncio.run(run(files, args.shot))
    print('\n%s（%d 個檔）' % ('有問題，看上面 ⚠' if failed else '全部通過', len(files)))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
