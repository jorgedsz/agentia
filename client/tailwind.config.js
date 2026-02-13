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
          bg: '#1a1c20',        // Main background - deep gray
          sidebar: '#16181c',   // Darker variant for sidebar
          card: '#22242a',      // Lighter variant for cards
          hover: '#2a2d33',     // Hover/secondary - neutral gray
          border: '#33363d',    // Border color
        },
        accent: {
          red: '#B07878',       // Dusty terracotta
          mauve: '#593D3B',     // PANTONE 438 C
          gray: '#D7D2CB',      // PANTONE Warm Gray 1 C
        },
        primary: {
          50: '#f5f7fa',
          100: '#e4e7ec',
          200: '#c8cdd7',
          300: '#a3abb8',
          400: '#7d8694',
          500: '#636c7a',
          600: '#515868',
          700: '#434956',
          800: '#3a3f4a',
          900: '#333740',
        },
        red: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        }
      }
    },
  },
  plugins: [],
}
