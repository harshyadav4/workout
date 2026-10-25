import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        popover: "hsl(var(--popover))",
        "popover-foreground": "hsl(var(--popover-foreground))",
        well: "hsl(var(--well))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        // The accent as text, rings and tints. Lime on Graphite, deep green on
        // Paper. `primary` stays the lime fill in both skins.
        brand: "hsl(var(--brand))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
        "danger-foreground": "hsl(var(--danger-foreground))"
      },
      // Plaques are 22, keys 16, wells and inner panels 14. Pills stay `full`.
      borderRadius: {
        lg: "14px",
        xl: "16px",
        "2xl": "20px",
        "3xl": "22px"
      },
      boxShadow: {
        plaque: "var(--shadow-plaque)",
        key: "var(--shadow-key)",
        quiet: "var(--shadow-quiet)",
        well: "var(--shadow-well)",
        dock: "var(--shadow-dock)",
        // Old name, still on a few call sites until step 2 retires it.
        glow: "var(--shadow-key)"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        // One typeface. `font-mono` sites get Inter with tabular figures, so the
        // digits still line up while the mono caps are retired screen by screen.
        mono: [
          ["var(--font-sans)", "system-ui", "sans-serif"],
          { fontFeatureSettings: '"tnum"' }
        ]
      }
    }
  },
  plugins: []
};

export default config;
