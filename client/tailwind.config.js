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
          red: '#EF3340',       // PANTONE Red 032 C
          mauve: '#593D3B',     // PANTONE 438 C
          gray: '#D7D2CB',      // PANTONE Warm Gray 1 C
        },
        primary: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#EF3340',       // PANTONE Red 032 C - main
          600: '#DC2626',
          700: '#B91C1C',
          800: '#991B1B',
          900: '#7F1D1D',
        }
      }
    },
  },
  plugins: [],
}
