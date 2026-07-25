/** @type {import('tailwindcss').Config} */

// Every colour resolves to an OKLCH channel triplet held in a CSS variable
// (see src/index.css), wrapped so Tailwind's `<alpha-value>` opacity modifiers
// keep working: `bg-primary/10`, `ring-ring/50`, `hover:bg-muted/50` all
// compile to valid `oklch(L C H / A)`. Redefining the variable under `.dark`
// is what flips the whole palette between light and dark.
const ramp = (name) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((shade) => [
      shade,
      `oklch(var(--${name}-${shade}) / <alpha-value>)`,
    ]),
  );

const token = (name) => `oklch(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ---- semantic tokens (the new component vocabulary) ----
        background: token('background'),
        foreground: token('foreground'),
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        // `canvas` is retained as an alias of the page background so existing
        // `bg-canvas` usages flip with the theme instead of staying light.
        canvas: token('background'),
        card: {
          DEFAULT: token('card'),
          foreground: token('card-foreground'),
          2: token('card-2'),
        },
        popover: {
          DEFAULT: token('popover'),
          foreground: token('popover-foreground'),
        },
        primary: {
          DEFAULT: token('primary'),
          foreground: token('primary-foreground'),
          hover: token('primary-hover'),
        },
        secondary: {
          DEFAULT: token('secondary'),
          foreground: token('secondary-foreground'),
        },
        muted: {
          DEFAULT: token('muted'),
          foreground: token('muted-foreground'),
        },
        accent: {
          DEFAULT: token('accent'),
          foreground: token('accent-foreground'),
        },
        destructive: {
          DEFAULT: token('destructive'),
          foreground: token('destructive-foreground'),
        },
        success: {
          DEFAULT: token('success'),
          foreground: token('success-foreground'),
        },
        warning: {
          DEFAULT: token('warning'),
          foreground: token('warning-foreground'),
        },
        info: {
          DEFAULT: token('info'),
          foreground: token('info-foreground'),
        },
        panel: {
          DEFAULT: token('panel'),
          foreground: token('panel-foreground'),
        },
        sidebar: {
          DEFAULT: token('sidebar'),
          foreground: token('sidebar-foreground'),
          accent: token('sidebar-accent'),
          'accent-foreground': token('sidebar-accent-foreground'),
          border: token('sidebar-border'),
          primary: token('sidebar-primary'),
          'primary-foreground': token('sidebar-primary-foreground'),
          ring: token('sidebar-ring'),
        },
        chart: {
          1: token('chart-1'),
          2: token('chart-2'),
          3: token('chart-3'),
          4: token('chart-4'),
          5: token('chart-5'),
        },

        // ---- legacy numeric ramps (theme-flipping) ----
        // slate carries a 950 shade (used for the strongest headings); the
        // other ramps only expose 50–900, which is all the app uses.
        slate: { ...ramp('slate'), 950: 'oklch(var(--slate-950) / <alpha-value>)' },
        brand: ramp('brand'),
        red: ramp('red'),
        emerald: ramp('emerald'),
        amber: ramp('amber'),
        blue: ramp('blue'),
        cyan: ramp('cyan'),
        violet: ramp('violet'),
        orange: ramp('orange'),
        rose: ramp('rose'),
      },
      borderRadius: {
        sm: 'calc(var(--radius) * 0.6)',
        md: 'calc(var(--radius) * 0.8)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) * 1.4)',
        '2xl': 'calc(var(--radius) * 1.8)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px 0 oklch(0 0 0 / 0.05), 0 1px 3px 0 oklch(0 0 0 / 0.08)',
        popover: '0 4px 16px -2px oklch(0 0 0 / 0.12), 0 2px 6px -2px oklch(0 0 0 / 0.08)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
