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
        "bubble-in": {
          "0%": { opacity: "0", transform: "translateY(6px) scale(0.96)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.95)", opacity: "0.6" },
          "70%": { transform: "scale(1.6)", opacity: "0" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
      },
      animation: {
        "ping-dot": "ping-dot 1.6s ease-in-out infinite",
        "bubble-in": "bubble-in 280ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 400ms ease-out both",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0, 0, 0.2, 1) infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
