import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0B0B0B",
          950: "#070707",
          900: "#0B0B0B",
          800: "#141414",
          700: "#1C1C1C",
          600: "#262626",
        },
        bone: {
          DEFAULT: "#F4EDDF",
          50: "#FBF8F1",
          100: "#F4EDDF",
          200: "#E7DDC7",
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
        "marquee": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "stamp-drop": {
          "0%": { opacity: "0", transform: "translateY(-24px) rotate(-18deg) scale(0.85)" },
          "60%": { opacity: "1", transform: "translateY(2px) rotate(7deg) scale(1.02)" },
          "100%": { opacity: "1", transform: "translateY(0) rotate(6deg) scale(1)" },
        },
        "rise": {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.85)" },
        },
        "bubble-in": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.96)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "marquee": "marquee 32s linear infinite",
        "stamp-drop": "stamp-drop 900ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "rise": "rise 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "fade": "fade 800ms ease-out both",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
        "bubble-in": "bubble-in 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
