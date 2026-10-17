import type { Config } from "tailwindcss";

// Colour tokens (v2 orange theme) (see src/app/globals.css).
// They are exposed as RGB triplets so Tailwind opacity modifiers work, e.g.
// bg-primary/10 for a light tint of the same palette colour.
const token = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: token("forest"), // #7C2D12
        primary: token("primary"), // #C2410C
        action: token("action"), // #F97316
        ink: token("ink"), // RGB(31, 41, 55)
        muted: token("muted"), // RGB(100, 116, 139)
        canvas: token("canvas"), // RGB(248, 250, 252)
        line: token("line"), // RGB(219, 227, 234)
        danger: token("danger"), // RGB(185, 28, 28)
        warn: token("warn"), // RGB(180, 83, 9)
        ok: token("ok"),
        sky: token("sky"),
        skyline: token("skyline"),
        skyink: token("skyink"),
        skyd: token("skyd"),
        hot: token("hot"),
        white: "#FFFFFF",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter Variable", "system-ui", "sans-serif"],
        display: ["var(--font-poppins)", "Poppins", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
        "2xl": "1rem",
      },
      boxShadow: {
        card: "0 1px 2px rgb(31 41 55 / 0.06)",
        raised: "0 2px 8px rgb(31 41 55 / 0.08)",
      },
      spacing: {
        "safe-b": "env(safe-area-inset-bottom)",
        "safe-t": "env(safe-area-inset-top)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "sheet-up": { from: { transform: "translateY(24px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "sheet-up": "sheet-up 180ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
