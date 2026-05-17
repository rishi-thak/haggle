import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FBFBFA",
        ink: {
          DEFAULT: "#0A0A0A",
          900: "#0A0A0A",
          800: "#171717",
          700: "#2A2A2A",
          500: "#525252",
          400: "#737373",
          300: "#A3A3A3",
          200: "#D4D4D4",
          100: "#E5E5E5",
          50: "#F4F4F3",
        },
        haggle: {
          DEFAULT: "#FF2D2D",
          400: "#FF5A5A",
          500: "#FF2D2D",
          600: "#E61F1F",
          700: "#B81717",
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        "ping-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "ping-dot": "ping-dot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
