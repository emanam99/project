import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        whatsapp: {
          primary: '#00a884',
          'primary-dark': '#005e4b',
          secondary: '#075e54',
          background: '#111b21',
          'bubble-sent': '#005c4b',
          'bubble-received': '#202c33',
          'bubble-sent-dark': '#0b332d',
          'bubble-received-dark': '#182229',
          header: '#202c33',
          text: '#e9edef',
          'text-secondary': '#8696a0',
          'input-bg': '#2a3942',
          'icon': '#8696a0',
          'icon-strong': '#aebac1',
          'green': '#00a884',
          'green-dark': '#06cf9c',
          'danger': '#ef5350',
          'divider': '#313d45',
          'hover': '#202c33',
          'active': '#2a3942',
          'typing': '#00a884',
        },
        glass: {
          light: 'rgba(255, 255, 255, 0.1)',
          medium: 'rgba(255, 255, 255, 0.15)',
          strong: 'rgba(255, 255, 255, 0.2)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'bubble': '8px',
        'bubble-lg': '16px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s infinite',
        'typing': 'typing 1.4s infinite',
        'bounce-in': 'bounceIn 0.5s ease-out',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        typing: {
          '0%': { transform: 'scaleY(0.4)' },
          '20%': { transform: 'scaleY(1)' },
          '40%': { transform: 'scaleY(0.4)' },
          '100%': { transform: 'scaleY(0.4)' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};

export default config;
