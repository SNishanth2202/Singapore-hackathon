const red = {
  DEFAULT: '#E4002B', 50: '#fff3f5', 100: '#ffe3e9', 200: '#ffc4d0',
  300: '#fa96ab', 400: '#ed5877', 500: '#E4002B', 600: '#C8102E',
  700: '#a30e2b', 800: '#801329', 900: '#601223', 950: '#380b16',
}
const neutral = {
  DEFAULT: '#202124', 50: '#F7F8FA', 100: '#eff1f4', 200: '#E5E7EB',
  300: '#c8cdd5', 400: '#778191', 500: '#697386', 600: '#505a69',
  700: '#3d4552', 800: '#2e333b', 900: '#202124', 950: '#15171b',
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        singtelRed: red, singtelGray: neutral,
        brand: red, canvas: neutral[50], ink: neutral[900], muted: neutral[500], line: neutral[200],
        // Retain existing utility names for shared components and runtime class maps.
        teal: red, navy: neutral, gray: neutral,
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { DEFAULT: '8px', xl: '12px', '2xl': '12px' },
      boxShadow: {
        card: '0 1px 3px rgb(32 33 36 / .045)',
        'card-hover': '0 3px 10px rgb(32 33 36 / .08)',
        'inner-sm': 'inset 0 1px 2px rgb(32 33 36 / .05)',
        glow: '0 0 0 3px rgb(228 0 43 / .14)',
        'glow-singtel': '0 0 0 3px rgb(228 0 43 / .14)',
        'glow-teal': '0 0 0 3px rgb(228 0 43 / .14)',
      },
    },
  },
  plugins: [],
}
