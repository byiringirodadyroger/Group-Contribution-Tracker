/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        forest: {
          50: "#effaf4",
          100: "#d9f2e3",
          500: "#1d9a5b",
          600: "#167d49",
          700: "#12633c",
          900: "#103d2b"
        }
      },
      boxShadow: {
        card: "0 8px 30px rgba(15, 23, 42, .045)"
      }
    }
  },
  plugins: []
};
