// Theme: warm charcoal neutrals + one brass accent (matches the public site).
// `slate` and `indigo` are remapped so every existing class picks up the palette.
const neutral = {
  50: "#faf8f5", 100: "#f2efea", 200: "#e3ded6", 300: "#cbc4b9", 400: "#a39b8f",
  500: "#7c7469", 600: "#5c564e", 700: "#423e38", 800: "#2a2723", 900: "#1b1916", 950: "#11100e"
};
const brass = {
  50: "#fdf6ec", 100: "#faead3", 200: "#f3d2a3", 300: "#ebb673", 400: "#e3a35c",
  500: "#d48d46", 600: "#b8723a", 700: "#935731", 800: "#74452c", 900: "#5e3a27", 950: "#331d12"
};

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist Variable", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono Variable", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      colors: {
        slate: neutral,
        indigo: brass,
        ink: "#11100e",
        panel: "#1b1916",
        line: "rgba(227, 222, 214, 0.1)",
        indigoSoft: "#d48d46"
      },
      boxShadow: {
        lift: "0 30px 80px -30px rgba(0, 0, 0, 0.85)"
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
