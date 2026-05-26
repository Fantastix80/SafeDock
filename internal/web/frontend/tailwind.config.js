/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        bg: {
          base: '#0b0e18',
          surface: '#111827',
          card: '#151d2e',
          elevated: '#1a2235',
          hover: '#1e2840',
        },
        border: {
          DEFAULT: 'rgba(255,255,255,0.06)',
          strong: 'rgba(255,255,255,0.12)',
        },
        brand: {
          DEFAULT: '#4F8EF7',
          hover: '#6BA3F9',
          muted: 'rgba(79,142,247,0.15)',
        },
      },
    },
  },
  plugins: [],
}
