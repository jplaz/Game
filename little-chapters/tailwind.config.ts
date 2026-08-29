import type { Config } from "tailwindcss";

/**
 * Little Chapters design tokens.
 *
 * Warm editorial aesthetic: premium print brand, not SaaS. Warm neutrals,
 * serif display for emotional headings, generous whitespace, soft radii.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        cream: {
          50: "#FDFBF7",
          100: "#FAF6EE",
          200: "#F4EDDF",
          300: "#EAE0CB",
        },
        sand: {
          100: "#F0E9DC",
          200: "#E3D8C4",
          300: "#D2C3A8",
          400: "#B8A585",
        },
        clay: {
          400: "#C58F6D",
          500: "#B07A55",
          600: "#96613F",
          700: "#7A4D31",
        },
        ink: {
          300: "#8B857B",
          400: "#6E6960",
          500: "#524E47",
          600: "#3B382F",
          700: "#2B2823",
          800: "#1F1D19",
        },
        sage: {
          100: "#E8EDE3",
          300: "#B9C7AC",
          500: "#7E9370",
          600: "#64775A",
        },
        blush: {
          100: "#F8E9E4",
          300: "#EBC4B8",
          500: "#D69686",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "1.25rem",
        photo: "0.875rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(43,40,35,0.04), 0 8px 24px rgba(43,40,35,0.06)",
        lifted: "0 2px 4px rgba(43,40,35,0.06), 0 16px 40px rgba(43,40,35,0.10)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
        shimmer: "shimmer 1.8s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
