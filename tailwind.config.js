/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        cyber: {
          50:  '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        neon: {
          cyan: '#22d3ee',
          violet: '#a855f7',
          pink: '#ec4899',
          lime: '#a3e635',
        },
        ink: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#05070f',
        },
      },
      boxShadow: {
        neon: '0 0 24px rgba(34, 211, 238, 0.35)',
        'neon-violet': '0 0 24px rgba(139, 92, 246, 0.35)',
        'inner-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.18)',
        card: '0 20px 40px -24px rgba(15, 23, 42, 0.25)',
        'card-dark': '0 24px 48px -20px rgba(0, 0, 0, 0.7)',
      },
    },
  },
  plugins: [],
}
