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
          base:  '#060810',
          panel: '#0b0f1a',
          card:  '#0f1623',
          bar:   '#080b12',
        },
        border: {
          DEFAULT: '#1a2035',
          subtle:  '#111827',
          strong:  '#1f2937',
        },
        accent: {
          DEFAULT: '#10b981',
          dim:     '#0d2b1e',
          muted:   '#1a3b2e',
          bright:  '#6ee7b7',
        },
        danger: {
          DEFAULT: '#f87171',
          dim:     '#2d1a1a',
          muted:   '#3b2020',
        },
        warn: {
          DEFAULT: '#f59e0b',
          dim:     '#2a1f0a',
          muted:   '#3b2d10',
        },
        text: {
          primary:   '#d1d5db',
          secondary: '#9ca3af',
          muted:     '#6b7280',
          faint:     '#4b5563',
          ghost:     '#374151',
        },
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
}
