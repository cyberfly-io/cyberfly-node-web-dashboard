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
          950: '#050a18',
        },
      },
      boxShadow: {
        'neon':        '0 0 20px -4px rgba(34, 211, 238, 0.4), 0 0 6px -1px rgba(34, 211, 238, 0.25)',
        'neon-lg':     '0 0 40px -6px rgba(34, 211, 238, 0.5), 0 0 12px -2px rgba(34, 211, 238, 0.3)',
        'neon-violet': '0 0 20px -4px rgba(139, 92, 246, 0.4), 0 0 6px -1px rgba(139, 92, 246, 0.25)',
        'inner-glow':  'inset 0 1px 0 0 rgba(255, 255, 255, 0.12)',
        'glass':       '0 8px 32px -8px rgba(0, 0, 0, 0.12), 0 2px 8px -2px rgba(0, 0, 0, 0.06)',
        'glass-lg':    '0 16px 48px -12px rgba(0, 0, 0, 0.2), 0 4px 12px -4px rgba(0, 0, 0, 0.08)',
        'glass-dark':  '0 8px 32px -8px rgba(0, 0, 0, 0.5), 0 2px 8px -2px rgba(0, 0, 0, 0.3)',
        'card':        '0 20px 40px -24px rgba(15, 23, 42, 0.25)',
        'card-dark':   '0 24px 48px -20px rgba(0, 0, 0, 0.7)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'gradient':    'gradient-shift 10s ease infinite',
        'float':       'float 3.2s ease-in-out infinite',
        'pulse-glow':  'pulse-glow 2.4s ease-in-out infinite',
        'shimmer':     'shimmer 2s linear infinite',
        'border-flow': 'border-flow 6s linear infinite',
        'fade-in':     'fade-in 0.5s ease-out',
        'slide-up':    'slide-up 0.4s ease-out',
      },
      keyframes: {
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':      { backgroundPosition: '100% 50%' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-10px)' },
        },
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
