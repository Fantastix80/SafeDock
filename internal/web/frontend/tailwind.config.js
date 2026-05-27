/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      fontSize: {
        /* Bump default Tailwind sizes up by ~1-2px site-wide */
        'xs':   ['13px', { lineHeight: '1.5' }],
        'sm':   ['15px', { lineHeight: '1.6' }],
        'base': ['16px', { lineHeight: '1.6' }],
      },
      fontFamily: {
        heading: ['Space Grotesk', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        void: '#030304',
        surface: '#0F1115',
        muted: '#94A3B8',
        dim: '#1E293B',
        bitcoin: '#F7931A',
        'bitcoin-dark': '#EA580C',
        gold: '#FFD600',
      },
      boxShadow: {
        'orange-glow':    '0 0 20px -5px rgba(234,88,12,0.5)',
        'orange-glow-lg': '0 0 30px -5px rgba(247,147,26,0.6)',
        'gold-glow':      '0 0 20px rgba(255,214,0,0.3)',
        'card-glow':      '0 0 50px -10px rgba(247,147,26,0.1)',
        'card-hover':     '0 0 30px -10px rgba(247,147,26,0.2)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-20px)' },
        },
      },
      animation: {
        'float':              'float 8s ease-in-out infinite',
        'spin-slow':          'spin 10s linear infinite',
        'spin-slow-reverse':  'spin 15s linear infinite reverse',
        'ping-slow':          'ping 3s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
}
