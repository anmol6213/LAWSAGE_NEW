/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0B1626', 900: '#101F36', 800: '#14243A', 700: '#1D3252', 600: '#2A4468', 500: '#40608C' },
        brass: { 200: '#F0E1BC', 300: '#E6CC94', 400: '#D8B56D', 500: '#C49A45', 600: '#A47E32', 700: '#7F6125' },
        paper: '#F4F5F8',
        line: '#E3E6EC',
      },
      fontFamily: {
        display: ['Newsreader', 'Georgia', 'serif'],
        sans: ['"Public Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,31,54,.05), 0 4px 16px -6px rgba(16,31,54,.10)',
        lift: '0 12px 32px -12px rgba(16,31,54,.35)',
      },
    },
  },
  plugins: [],
};
