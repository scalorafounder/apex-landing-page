/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
      colors: {
        // Brand orange — warm amber-orange from the logo swoosh
        brand: {
          50:  '#fef5ec',
          100: '#fde6cc',
          200: '#fbc99a',
          300: '#f8a660',
          400: '#f48b2e',
          500: '#E07820', // primary brand orange
          600: '#c4620f',
          700: '#a35010',
          800: '#854110',
          900: '#6d360f',
        },
        // Deep navy dark scale — based on #0A2F4F brand navy
        dark: {
          900: '#040d1a', // page background
          800: '#071629', // card backgrounds
          700: '#0c2040', // elevated surfaces / section bg
          600: '#112b55', // borders, dividers
          500: '#1a3a6b', // hover states
          400: '#244d85', // subtle highlights
        },
        // Brand navy (use directly as bg color e.g. bg-navy)
        navy: '#0A2F4F',
        // Steel blue-gray from brand board
        steel: '#5C6B73',
        // Gold / amber accent
        gold: '#EBAF4E',
        // Sandy taupe
        taupe: '#D4B29D',
      },
      animation: {
        'fade-up':    'fadeUp 0.5s ease forwards',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'shimmer':    'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
    },
  },
  plugins: [],
}
