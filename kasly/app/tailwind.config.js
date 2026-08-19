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
          50: '#fdf4f7',
          100: '#fce7f3',
          200: '#fbcfe8',
          300: '#f9a8d4',
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
          800: '#3d1a28',
          900: '#24141c',
          950: '#14080e',
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
