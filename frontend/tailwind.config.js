/** @type {import('tailwindcss').Config} */
module.exports = {
  // Tailwind scans Go source files for class names used via js interop strings.
  content: [
    "./public/**/*.html",
    "./src/**/*.go",
  ],
  theme: {
    extend: {
      colors: {
        // Porter Galaxy design tokens — refine during implementation
        galaxy: {
          50:  "#f0f4ff",
          100: "#dde6ff",
          200: "#c2cfff",
          300: "#9cb0ff",
          400: "#7485fd",
          500: "#5558f5",
          600: "#4639e8",
          700: "#3b2dd3",
          800: "#3126ab",
          900: "#2d2687",
          950: "#1c1650",
        },
        node: {
          default:  "#5558f5",
          selected: "#f59e0b",
          hover:    "#7485fd",
          muted:    "#4b5563",
        },
        edge: {
          default: "#374151",
          active:  "#5558f5",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
