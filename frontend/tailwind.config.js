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
          50: '#EEF2F8',
          100: '#D4DFED',
          200: '#A9BFD9',
          300: '#7F9FC5',
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
        slate: {
          50: '#F8FAFC',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '8px',
        xl: '12px',
        '2xl': '16px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)',
        'card-hover': '0 8px 20px -4px rgba(0,0,0,0.10), 0 4px 8px -4px rgba(0,0,0,0.06)',
        'inner-sm': 'inset 0 1px 2px 0 rgba(0,0,0,0.05)',
        glow: '0 0 0 3px rgba(13,148,136,0.18)',
      },
      backgroundImage: {
        'gradient-navy': 'linear-gradient(135deg, #1E3A5F 0%, #2D5080 100%)',
        'gradient-teal': 'linear-gradient(135deg, #0D9488 0%, #1DB3AD 100%)',
        'gradient-subtle': 'linear-gradient(135deg, #F8FAFC 0%, #EEF2F8 100%)',
      },
    },
  },
  plugins: [],
}
