// Tailwind 設定。2026-09-26 起這支只在 build 時用，瀏覽器不再載它——
// 頁面改吃預先編譯好的 tw.css（跑 `pnpm run build:css` 產生）。
// 改了這裡或任何 class 都要重跑 build，不然線上看不到。
//
// 顏色全部指向 theme.css 定義的 CSS 變數，深淺兩套主題共用同一份 class。
// 寫成 "rgb(var(--x) / <alpha-value>)" 而不是 "var(--x)"，
// 是為了讓 bg-accent-purple/10、border-white/10 這類透明度修飾子繼續生效。
//
// white / black / gray 是刻意覆寫內建色：站上有 2980 處 text-white、
// 1989 處 border-white/N、826 處 bg-white/N、2963 處 text-gray-*，
// 讓它們指向會翻轉的變數，淡色模式下這些既有 class 自動變成深色文字與深色疊層，
// 不必改任何 HTML。bg-white 與 border-white 站上一律帶透明度（純色用法 0 處），
// 角色是「淡淡的疊層」，所以跟著翻轉是對的。
module.exports = {
    // 要掃哪些檔找 class。Tailwind 是純文字比對，
    // 所以 JS 裡寫成完整字串的 class（例如 renderPollRow 的樣板）也抓得到；
    // 用字串相加組出來的就抓不到，全站目前 0 處，要維持。
    content: ['./**/*.html', './**/*.js', '!./node_modules/**', '!./tw.css'],
    theme: {
        extend: {
            colors: {
                bg:      'rgb(var(--c-bg) / <alpha-value>)',
                surface: 'rgb(var(--c-surface) / <alpha-value>)',
                border:  'var(--c-border)',

                // 覆寫內建色
                white:   'rgb(var(--c-ink) / <alpha-value>)',
                black:   'rgb(var(--c-ink-inv) / <alpha-value>)',
                gray: {
                    200: 'rgb(var(--c-g200) / <alpha-value>)',
                    300: 'rgb(var(--c-g300) / <alpha-value>)',
                    400: 'rgb(var(--c-g400) / <alpha-value>)',
                    500: 'rgb(var(--c-g500) / <alpha-value>)',
                    600: 'rgb(var(--c-g600) / <alpha-value>)',
                    700: 'rgb(var(--c-g700) / <alpha-value>)'
                },

                accent: {
                    blue:    'rgb(var(--c-blue) / <alpha-value>)',
                    purple:  'rgb(var(--c-purple) / <alpha-value>)',
                    cyan:    'rgb(var(--c-cyan) / <alpha-value>)',
                    success: 'rgb(var(--c-success) / <alpha-value>)',
                    warn:    'rgb(var(--c-warn) / <alpha-value>)',
                    danger:  'rgb(var(--c-danger) / <alpha-value>)',
                    fill:    'rgb(var(--c-fill) / <alpha-value>)'
                }
            },
            fontFamily: {
                sans: ['"Plus Jakarta Sans"', 'sans-serif'],
                mono: ['"JetBrains Mono"', 'monospace'],
            },
            animation: {
                'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }
        }
    }
}
