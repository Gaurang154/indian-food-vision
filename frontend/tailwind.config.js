/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          50: "#FFFDF7",
          100: "#FEF9F0",
          200: "#FDF3E1",
          300: "#FCECD0",
        },
        brutal: {
          pink: "#FE9CE8",
          lime: "#CDF77E",
          green: "#99E885",
          gold: "#F7CB46",
          cream: "#FFDC89",
          black: "#000000",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        neo: "5px 5px 0px #000",
        "neo-sm": "3px 3px 0px #000",
        "neo-lg": "7px 7px 0px #000",
        "neo-hover": "7px 7px 0px #000",
        "neo-pressed": "0px 0px 0px #000",
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "44px 44px",
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "float-slow": "floatSlow 9s ease-in-out infinite",
        "float-delay": "floatDelay 7s ease-in-out infinite",
        "pulse-slow": "pulseSlow 3s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
        morph: "morph 10s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-14px) rotate(3deg)" },
        },
        floatDelay: {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "33%": { transform: "translateY(-10px) rotate(-2deg)" },
          "66%": { transform: "translateY(-5px) rotate(2deg)" },
        },
        pulseSlow: {
          "0%, 100%": { opacity: "0.8" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        morph: {
          "0%, 100%": { borderRadius: "16px" },
          "25%": { borderRadius: "24px 8px" },
          "50%": { borderRadius: "8px 24px" },
          "75%": { borderRadius: "20px 12px 20px 12px" },
        },
      },
    },
  },
  plugins: [],
};
