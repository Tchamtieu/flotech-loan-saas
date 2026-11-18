/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        flotech: {
          primary: '#2563EB', // Primary Blue
          primaryHover: '#1D4ED8',
          navy: '#0F172A', // Dark Navy
          navySurface: '#1E293B',
          bg: '#F8FAFC', // Background
          surface: '#FFFFFF', // White
          teal: '#0D9488', // Secondary Teal
          success: '#16A34A', // Success
          warning: '#F59E0B', // Warning
          danger: '#DC2626', // Danger
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(15, 23, 42, 0.06), 0 1px 2px -1px rgba(15, 23, 42, 0.04)',
        elevated: '0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)',
      },
    },
  },
  plugins: [],
};
