// tailwind.config.js 檔案內容
tailwind.config = {
    theme: {
        extend: {
            colors: {
                bg: '#050505',
                surface: '#0A0A0A',
                border: 'rgba(255, 255, 255, 0.05)',
                accent: {
                    blue: '#3B82F6',
                    purple: '#BF94FF', 
                    cyan: '#06B6D4',
                    success: '#4ADE80'
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