/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontSize: {
        // Semantic type scale — rem-based, scales with html { font-size }
        // Base reference: 14px html = original sizes; 21px html = 1.5× scale
        'nano':    ['0.571rem', { lineHeight: '1.2' }],  // ~8px  → badge labels, status tags
        'micro':   ['0.643rem', { lineHeight: '1.3' }],  // ~9px  → table headers, timestamps
        'caption': ['0.714rem', { lineHeight: '1.4' }],  // ~10px → secondary labels, descriptions
        'label':   ['0.786rem', { lineHeight: '1.5' }],  // ~11px → section titles, nav items
        'body-sm': ['0.857rem', { lineHeight: '1.5' }],  // ~12px → compact body, dropdowns
        'body-md': ['0.929rem', { lineHeight: '1.5' }],  // ~13px → UI chrome, brand name
        'body':    ['1rem',     { lineHeight: '1.5' }],  // ~14px → primary body content
        'kpi':     ['1.286rem', { lineHeight: '1.3' }],  // ~18px → KPI values
        'display': ['1.714rem', { lineHeight: '1.2' }],  // ~24px → large display text
      },
      colors: {
        surface: {
          base: 'var(--color-surface-base)',
          panel: 'var(--color-surface-panel)',
          card: 'var(--color-surface-card)',
          bar: 'var(--color-surface-bar)',
          section: 'var(--color-surface-section)',
          input: 'var(--color-surface-input)',
          tint: 'var(--color-surface-tint)',
          selected: 'var(--color-surface-selected)',
          edited: 'var(--color-surface-edited)',
          danger: 'var(--color-surface-danger)',
          'danger-muted': 'var(--color-surface-danger-muted)',
          'danger-strong': 'var(--color-surface-danger-strong)',
        },
        border: {
          DEFAULT: 'var(--color-border-default)',
          subtle: 'var(--color-border-subtle)',
          strong: 'var(--color-border-strong)',
          faint: 'var(--color-border-faint)',
          info: 'var(--color-border-info)',
        },
        accent: {
          DEFAULT: 'var(--color-accent-default)',
          strong: 'var(--color-accent-strong)',
          dim: 'var(--color-accent-dim)',
          muted: 'var(--color-accent-muted)',
          bright: 'var(--color-accent-bright)',
        },
        danger: {
          DEFAULT: 'var(--color-danger-default)',
          dim: 'var(--color-danger-dim)',
          muted: 'var(--color-danger-muted)',
        },
        warn: {
          DEFAULT: 'var(--color-warn-default)',
          dim: 'var(--color-warn-dim)',
          muted: 'var(--color-warn-muted)',
        },
        info: {
          DEFAULT: 'var(--color-info-default)',
          bright: 'var(--color-info-bright)',
          dim: 'var(--color-info-dim)',
          soft: 'var(--color-info-soft)',
          muted: 'var(--color-info-muted)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          faint: 'var(--color-text-faint)',
          ghost: 'var(--color-text-ghost)',
          inverse: 'var(--color-text-inverse)',
        },
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
}
