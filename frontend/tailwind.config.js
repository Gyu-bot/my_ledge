/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        accent: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
        },
        canvas: '#F8FAFC',
        panel: '#FFFFFF',
        ink: '#1E3A8A',
        line: '#DBEAFE',
      },
      boxShadow: {
        glow: '0 24px 60px rgba(30, 64, 175, 0.12)',
        soft: '0 12px 30px rgba(15, 23, 42, 0.06)',
      },
      fontFamily: {
        sans: ['"Fira Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      backgroundImage: {
        'dashboard-grid':
          'radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 30%), radial-gradient(circle at top right, rgba(245, 158, 11, 0.10), transparent 26%), linear-gradient(180deg, rgba(255,255,255,0.78), rgba(248,250,252,0.95))',
      },
    },
  },
  plugins: [],
};
