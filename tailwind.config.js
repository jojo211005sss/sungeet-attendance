// Colours live as CSS variables in src/styles.css; these names expose them to utilities.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist Variable", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono Variable", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      colors: {
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        line: "var(--line)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        muted: "var(--muted)",
        subtle: "var(--subtle)",
        brand: "var(--brand)",
        "brand-soft": "var(--brand-soft)",
        ok: "var(--ok)",
        warn: "var(--warn)",
        bad: "var(--bad)"
      }
    }
  },
  plugins: []
};
