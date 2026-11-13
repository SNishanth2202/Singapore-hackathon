/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1E3A5F',
          50: '#E8EEF5',
          100: '#C5D4E6',
          200: '#9FB8D5',
          300: '#7A9BC4',
          400: '#5A82B4',
          500: '#3D6BA3',
          600: '#1E3A5F',
          700: '#192F4D',
          800: '#13243B',
          900: '#0D1929',
        },
        teal: {
          DEFAULT: '#0D9488',
          50: '#E0F5F4',
          100: '#B3E5E3',
          200: '#7DD3D0',
          300: '#47C1BC',
          400: '#1DB3AD',
          500: '#0D9488',
          600: '#0B7B72',
          700: '#08625C',
          800: '#064A46',
          900: '#033130',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '8px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
}
