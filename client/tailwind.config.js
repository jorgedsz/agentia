/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#25282A',        // PANTONE 426 C - main background
          sidebar: '#1E2022',   // Darker variant for sidebar
          card: '#2D3033',      // Lighter variant for cards
          hover: '#593D3B',     // PANTONE 438 C - hover/secondary
          border: '#3D4043',    // Border color
        },
        accent: {
          red: '#B07878',       // Dusty terracotta
          mauve: '#593D3B',     // PANTONE 438 C
          gray: '#D7D2CB',      // PANTONE Warm Gray 1 C
        },
        primary: {
          50: '#FBF5F5',
          100: '#F7E8E8',
          200: '#F0D2D2',
          300: '#E0AFAF',
          400: '#CC8F8F',
          500: '#B07878',       // Dusty terracotta - main
          600: '#9A6666',
          700: '#805555',
          800: '#6A4747',
          900: '#583C3C',
        },
        red: {
          50: '#FBF5F5',
          100: '#F7E8E8',
          200: '#F0D2D2',
          300: '#E0AFAF',
          400: '#CC8F8F',
          500: '#B07878',
          600: '#9A6666',
          700: '#805555',
          800: '#6A4747',
          900: '#583C3C',
        }
      }
    },
  },
  plugins: [],
}
