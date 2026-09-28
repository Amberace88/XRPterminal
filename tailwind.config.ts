import type { Config } from "tailwindcss";

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1440px" } },
    extend: {
      colors: {
        bg: { DEFAULT: token("background"), secondary: token("background-secondary") },
        surface: { DEFAULT: token("surface"), hover: token("surface-hover"), elevated: token("surface-elevated") },
        border: { DEFAULT: token("border"), subtle: token("border-subtle") },
        fg: { DEFAULT: token("text-primary"), secondary: token("text-secondary"), muted: token("text-muted") },
        accent: { DEFAULT: token("accent"), soft: token("accent-soft"), strong: token("accent-strong") },
        success: token("success"),
        warning: token("warning"),
        danger: token("danger"),
        info: token("info"),
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem" },
      boxShadow: {
        card: "0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 8px 24px -12px rgb(0 0 0 / 0.6)",
        glow: "0 0 0 1px rgb(var(--accent) / 0.25), 0 8px 32px -8px rgb(var(--accent) / 0.35)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        pulse2: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".35" } },
        ticker: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
      },
      animation: {
        "fade-up": "fade-up .5s cubic-bezier(.2,.7,.2,1) both",
        shimmer: "shimmer 1.6s infinite",
        pulse2: "pulse2 1.8s ease-in-out infinite",
        ticker: "ticker 60s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
