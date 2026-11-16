/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Singtel Brand Colors
        singtelRed: {
          DEFAULT: '#EE133B',
          50: '#FEE6EB',
          100: '#FCC7D2',
          200: '#F99DAE',
          300: '#F5748B',
          400: '#F24064',
          500: '#EE133B',
          600: '#D0102F',
          700: '#A70C26',
          800: '#7E091C',
          900: '#550613',
        },
        singtelGray: {
          DEFAULT: '#231F20',
          50: '#F7F7F7',
          100: '#E8E8E8',
          200: '#D1D1D1',
          300: '#B4B4B4',
          400: '#959595',
          500: '#6B6B6B',
          600: '#4A4A4A',
          700: '#333333',
          800: '#231F20',
          900: '#1A1718',
        },
        // Keep legacy colors for backward compatibility during migration
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
        glow: '0 0 0 3px rgba(238,19,59,0.15)',
        'glow-singtel': '0 0 0 3px rgba(238,19,59,0.15)',
        'glow-teal': '0 0 0 3px rgba(13,148,136,0.18)',
      },
      backgroundImage: {
        'gradient-singtel': 'linear-gradient(135deg, #EE133B 0%, #D0102F 100%)',
        'gradient-singtel-light': 'linear-gradient(135deg, #F5748B 0%, #F24064 100%)',
        'gradient-gray': 'linear-gradient(135deg, #F7F7F7 0%, #E8E8E8 100%)',
        // Legacy gradients for backward compatibility
        'gradient-navy': 'linear-gradient(135deg, #1E3A5F 0%, #2D5080 100%)',
        'gradient-teal': 'linear-gradient(135deg, #0D9488 0%, #1DB3AD 100%)',
        'gradient-subtle': 'linear-gradient(135deg, #F8FAFC 0%, #EEF2F8 100%)',
      },
    },
  },
  plugins: [],
}
