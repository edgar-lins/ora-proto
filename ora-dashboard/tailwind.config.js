/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ora: {
          bg: "#0F0F0F",
          accent: "#00E0A4",
          text: "#E0E0E0",
        },
      },
    },
  },
  plugins: [],
};
