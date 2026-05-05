export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      colors: {
        ink: "#0f172a",
        panel: "#111827",
        line: "rgba(148, 163, 184, 0.18)",
        indigoSoft: "#6366f1"
      },
      boxShadow: {
        lift: "0 24px 70px -40px rgba(99, 102, 241, 0.75)"
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.48" },
          "50%": { opacity: "0.9" }
        }
      },
      animation: {
        rise: "rise 520ms cubic-bezier(0.16, 1, 0.3, 1) both",
        pulseSoft: "pulseSoft 2.4s ease-in-out infinite"
      }
    }
  },
  plugins: []
};
