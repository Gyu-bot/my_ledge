/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
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
