/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bakha: {
          black: "#101010",
          ink: "#1f2933",
          orange: "#f97316",
          warm: "#fff7ed"
        }
      },
      boxShadow: {
        panel: "0 14px 35px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};
