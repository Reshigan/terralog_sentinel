/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./public/**/*.{html,js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: false,
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0d0f11",
          muted: "#16191d",
          soft: "#1a1e24",
        },
        accent: {
          DEFAULT: "#f5a623",
          ink: "#0d0f11",
        },
        ink: {
          DEFAULT: "#e8ecf0",
          soft: "#aab0b8",
        },
        warn: "#d97757",
        ok: "#22c55e",
        bad: "#c0524f",
      },
      fontFamily: {
        heading: ["Rajdhani", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      fontSize: {
        base: ["1rem", { lineHeight: "1.5" }],
        h1: ["2rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        h2: ["1.5rem", { lineHeight: "1.25", letterSpacing: "-0.02em" }],
        h3: ["1.25rem", { lineHeight: "1.3", letterSpacing: "-0.02em" }],
      },
      spacing: {
        "0.5": "0.125rem",
        "1": "0.25rem",
        "1.5": "0.375rem",
        "2": "0.5rem",
        "2.5": "0.625rem",
        "3": "0.75rem",
        "3.5": "0.875rem",
        "4": "1rem",
        "5": "1.25rem",
        "6": "1.5rem",
        "7": "1.75rem",
        "8": "2rem",
        "9": "2.25rem",
        "10": "2.5rem",
        "11": "2.75rem",
        "12": "3rem",
        "14": "3.5rem",
        "16": "4rem",
      },
      borderRadius: {
        DEFAULT: "6px",
        sm: "4px",
        md: "8px",
        lg: "10px",
        xl: "14px",
        "2xl": "16px",
        full: "9999px",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(0, 0, 0, 0.3)",
        card: "0 2px 8px rgba(0, 0, 0, 0.4)",
        drawer: "-4px 0 16px rgba(0, 0, 0, 0.5)",
      },
    },
  },
  plugins: [],
}
