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
          50: '#f0f7fd',
          100: '#e3f1fb',
          200: '#c5e3f6',
          300: '#96ccec',
          400: '#5eb3e4',
          500: '#2a96e0',
          600: '#1d82c9',
          700: '#1a679f',
          800: '#143044',
          900: '#0f2434',
          950: '#0b1520',
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
