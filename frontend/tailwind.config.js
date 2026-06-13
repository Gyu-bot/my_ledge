/** @type {import('tailwindcss').Config} */
// Ledger DS theme — docs/frontend-remake/04-design-system.md
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    fontFamily: {
      sans: ['Pretendard Variable', 'Pretendard', '-apple-system', 'Segoe UI', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
    },
    extend: {
      fontSize: {
        // px 기준 타입 스케일 (html 16px). micro(11px) 미만 금지.
        display: ['2rem', { lineHeight: '2.375rem', fontWeight: '700' }], // 32/38
        kpi: ['1.5rem', { lineHeight: '1.875rem', fontWeight: '700' }], // 24/30
        title: ['1.125rem', { lineHeight: '1.625rem', fontWeight: '600' }], // 18/26
        section: ['0.9375rem', { lineHeight: '1.375rem', fontWeight: '600' }], // 15/22
        body: ['0.875rem', { lineHeight: '1.375rem' }], // 14/22
        label: ['0.8125rem', { lineHeight: '1.125rem' }], // 13/18
        caption: ['0.75rem', { lineHeight: '1rem' }], // 12/16
        micro: ['0.6875rem', { lineHeight: '0.875rem' }], // 11/14
      },
      colors: {
        bg: {
          base: 'var(--ds-bg-base)',
          surface: 'var(--ds-bg-surface)',
          raised: 'var(--ds-bg-raised)',
          inset: 'var(--ds-bg-inset)',
          selected: 'var(--ds-bg-selected)',
        },
        border: {
          subtle: 'var(--ds-border-subtle)',
          DEFAULT: 'var(--ds-border-default)',
          strong: 'var(--ds-border-strong)',
        },
        text: {
          primary: 'var(--ds-text-primary)',
          secondary: 'var(--ds-text-secondary)',
          muted: 'var(--ds-text-muted)',
          faint: 'var(--ds-text-faint)',
        },
        accent: {
          DEFAULT: 'var(--ds-accent-fg)',
          bg: 'var(--ds-accent-bg)',
          border: 'var(--ds-accent-border)',
        },
        income: {
          DEFAULT: 'var(--ds-income-fg)',
          bg: 'var(--ds-income-bg)',
          border: 'var(--ds-income-border)',
        },
        expense: {
          DEFAULT: 'var(--ds-expense-fg)',
          bg: 'var(--ds-expense-bg)',
          border: 'var(--ds-expense-border)',
        },
        transfer: {
          DEFAULT: 'var(--ds-transfer-fg)',
          bg: 'var(--ds-transfer-bg)',
          border: 'var(--ds-transfer-border)',
        },
        warn: {
          DEFAULT: 'var(--ds-warn-fg)',
          bg: 'var(--ds-warn-bg)',
          border: 'var(--ds-warn-border)',
        },
        estimate: {
          DEFAULT: 'var(--ds-estimate-fg)',
          bg: 'var(--ds-estimate-bg)',
          border: 'var(--ds-estimate-border)',
        },
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
      },
      boxShadow: {
        raised: '0 4px 16px rgba(0, 0, 0, 0.24)',
      },
      maxWidth: {
        content: '1280px',
      },
      ringColor: {
        DEFAULT: 'var(--ds-focus-ring)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '200ms',
        slow: '320ms',
      },
    },
  },
  plugins: [],
}
