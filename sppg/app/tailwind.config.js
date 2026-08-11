/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
      colors: {
        leaf: {
          50: '#f3f6f4',
          100: '#e4ebe6',
          200: '#c8d4cc',
          300: '#9aada1',
          400: '#6b8573',
          500: '#4a7a55',
          600: '#3a6b46',
          700: '#2e5538',
          800: '#1a221e',
          900: '#121816',
          950: '#080b09',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--muted)',
          faint: 'var(--faint)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          raised: 'var(--surface-raised)',
          soft: 'var(--surface-soft)',
        },
        line: 'var(--line)',
        canvas: 'var(--canvas)',
      },
    },
  },
  plugins: [],
}
