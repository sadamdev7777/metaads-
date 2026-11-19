/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#0F5C4D",
        ink: "#16201C",
        muted: "#56615B",
        line: "#E1E5E1",
        ground: "#F6F7F5",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
