/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        chon: {
          bg: '#0c0a09',
          card: '#1c1917',
          gold: '#f59e0b',
          flame: '#f97316',
        },
      },
    },
  },
  plugins: [],
}
