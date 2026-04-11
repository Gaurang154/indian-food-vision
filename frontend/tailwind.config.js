/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: {
          950: "#07070c",
          900: "#0a0a12",
          800: "#10101a",
          700: "#161624",
          600: "#1c1c2e",
          500: "#252538",
        },
        accent: {
          purple: "#a78bfa",
          pink: "#f472b6",
          cyan: "#22d3ee",
          lime: "#bef264",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(167, 139, 250, 0.35)",
        "glow-pink": "0 0 40px rgba(244, 114, 182, 0.25)",
        "inner-glow": "inset 0 1px 0 rgba(255,255,255,0.08)",
      },
      backgroundImage: {
        "mesh-gradient":
          "radial-gradient(at 20% 20%, rgba(167,139,250,0.22) 0px, transparent 55%), radial-gradient(at 80% 30%, rgba(244,114,182,0.18) 0px, transparent 50%), radial-gradient(at 50% 100%, rgba(34,211,238,0.14) 0px, transparent 55%)",
        "grid-fade":
          "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "32px 32px",
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "pulse-slow": "pulseSlow 3s ease-in-out infinite",
        shimmer: "shimmer 2.2s linear infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        pulseSlow: {
          "0%, 100%": { opacity: "0.8" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
