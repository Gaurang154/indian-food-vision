/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: {
          950: "#050508",
          900: "#0a0a12",
          800: "#12121e",
          700: "#1a1a2e",
          600: "#22223a",
          500: "#2a2a48",
        },
        accent: {
          purple: "#a78bfa",
          pink: "#f472b6",
          cyan: "#22d3ee",
          lime: "#bef264",
        },
        neon: {
          purple: "#8b5cf6",
          pink: "#ec4899",
          cyan: "#06b6d4",
          lime: "#a3e635",
          yellow: "#facc15",
          orange: "#f97316",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(139, 92, 246, 0.4)",
        "glow-pink": "0 0 40px rgba(236, 72, 153, 0.3)",
        "glow-cyan": "0 0 40px rgba(6, 182, 212, 0.3)",
        "inner-glow": "inset 0 1px 0 rgba(255,255,255,0.1)",
        brutal: "5px 5px 0px rgba(0, 0, 0, 0.5)",
        "brutal-sm": "3px 3px 0px rgba(0, 0, 0, 0.4)",
        "brutal-purple": "5px 5px 0px rgba(139, 92, 246, 0.3)",
        "brutal-pink": "5px 5px 0px rgba(236, 72, 153, 0.25)",
        "brutal-cyan": "5px 5px 0px rgba(6, 182, 212, 0.25)",
        "brutal-lime": "5px 5px 0px rgba(163, 230, 53, 0.2)",
      },
      backgroundImage: {
        "mesh-gradient":
          "radial-gradient(at 20% 20%, rgba(139,92,246,0.2) 0px, transparent 55%), radial-gradient(at 80% 30%, rgba(236,72,153,0.15) 0px, transparent 50%), radial-gradient(at 50% 100%, rgba(6,182,212,0.12) 0px, transparent 55%)",
        "grid-fade":
          "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "float-slow": "floatSlow 8s ease-in-out infinite",
        "float-delay": "floatDelay 7s ease-in-out infinite",
        "pulse-slow": "pulseSlow 3s ease-in-out infinite",
        shimmer: "shimmer 2.2s linear infinite",
        "spin-slow": "spin 12s linear infinite",
        wiggle: "wiggle 0.5s ease-in-out",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-12px) rotate(2deg)" },
        },
        floatDelay: {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "33%": { transform: "translateY(-10px) rotate(-2deg)" },
          "66%": { transform: "translateY(-4px) rotate(1deg)" },
        },
        pulseSlow: {
          "0%, 100%": { opacity: "0.8" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "20%": { transform: "rotate(-3deg)" },
          "40%": { transform: "rotate(3deg)" },
          "60%": { transform: "rotate(-2deg)" },
          "80%": { transform: "rotate(2deg)" },
        },
      },
    },
  },
  plugins: [],
};
