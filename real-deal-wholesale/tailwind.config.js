/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Inter"',
          '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif',
        ],
        display: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Inter"',
          '"Segoe UI"', 'sans-serif',
        ],
        mono: ['"SF Mono"', '"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // 'cream' kept as token name; values are now clean neutrals (was warm cream)
        cream: {
          DEFAULT: '#FFFFFF',
          50:  '#FFFFFF',
          100: '#FAFAFA',   // hover / input fill
          200: '#F4F4F5',   // subtle surface
          300: '#E4E4E7',   // hairline / divider light
          400: '#D4D4D8',   // border medium
        },
        ink: {
          DEFAULT: '#18181B',
          900: '#18181B',
          700: '#3F3F46',
          500: '#71717A',
          400: '#A1A1AA',
          300: '#D4D4D8',
          200: '#E4E4E7',
        },
        amber: {
          50:  '#FEF8E7',
          100: '#FDEFC4',
          200: '#FBE189',
          300: '#F7CD4E',
          400: '#F0B82A',
          500: '#E8A017',   // primary accent — construction yellow
          600: '#C8861A',
          700: '#9F6A19',
          800: '#7A5217',
          900: '#5C3F12',
        },
        flame: {
          400: '#F58A45',
          500: '#F26B1F',   // hot orange
          600: '#D85214',
        },
        ember: {
          500: '#D62828',   // critical red
          600: '#B91D1D',
        },
        moss: {
          500: '#1B998B',
        },
      },
      borderRadius: {
        '4xl': '1.75rem',
      },
      boxShadow: {
        // Less elevation, more hairline. Apple Notes style.
        'soft': '0 0 0 1px rgba(24,24,27,0.05)',
        'lift': '0 1px 3px rgba(24,24,27,0.04), 0 0 0 1px rgba(24,24,27,0.06)',
        'inset-hairline': 'inset 0 0 0 1px rgba(24,24,27,0.06)',
      },
      transitionTimingFunction: {
        'apple': 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      },
    },
  },
  plugins: [],
}
