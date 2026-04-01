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
        display: ['var(--font-display)', 'Montserrat', 'sans-serif'],
        body:    ['var(--font-body)',    'Lato',       'sans-serif'],
      },
      colors: {
        // Primary accent — brand gold from brand board
        brand: {
          50:  '#fdf8ec',
          100: '#faefc8',
          200: '#f5df93',
          300: '#f0cc5e',
          400: '#f5cc7f',   // gold light
          500: '#EBAF4E',   // ← THE accent color
          600: '#c49035',   // gold dim
          700: '#9e7220',
          800: '#7d591a',
          900: '#624615',
        },
        // Deep navy dark scale — matches index.html exactly
        dark: {
          900: '#06111C',   // main page background
          800: '#0c1e2d',   // card backgrounds
          700: '#0d2035',   // elevated surfaces
          600: '#152435',   // borders / dividers
          500: '#1e3448',   // border mid
          400: '#2a4460',   // border light / hover
        },
        navy:  '#0A2F4F',   // brand navy accent bg
        steel: '#5C6B73',   // brand slate
        gold:  '#EBAF4E',   // alias for convenience
        taupe: '#D4B29D',   // brand cream
        rdw: {
          text:  '#c5d3de',
          muted: '#6a8090',
          dim:   '#3a5060',
          white: '#F0F4F8',
          green: '#3ecf8e',
          red:   '#e05252',
        },
      },
      animation: {
        'fade-up':    'fadeInUp .6s ease both',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'shimmer':    'shimmer 6s linear infinite',
        'glow-gold':  'glowGold 3s ease-in-out infinite',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-300% 0' },
          '100%': { backgroundPosition:  '300% 0' },
        },
        glowGold: {
          '0%,100%': { boxShadow: '0 0 20px rgba(235,175,78,.12)' },
          '50%':     { boxShadow: '0 0 40px rgba(235,175,78,.28)' },
        },
      },
    },
  },
  plugins: [],
}
