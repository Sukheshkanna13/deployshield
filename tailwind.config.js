/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        void:    '#040D1A',
        ink:     '#060F1E',
        surface: '#0A1828',
        edge:    '#0D1E35',
        muted:   '#1A2E4A',
        dim:     '#2A4060',
        steel:   '#4A7090',
        ghost:   '#6A90B0',
        cloud:   '#8AAFD0',
        frost:   '#C8D8EE',
        signal:  '#0EA5E9',
        ok:      '#22C55E',
        warn:    '#EAB308',
        crit:    '#F97316',
        danger:  '#EF4444',
        purple:  '#A855F7',
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 1.8s ease-in-out infinite',
        'slide-up': 'slideUp 0.25s ease',
      },
      keyframes: {
        glow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(14,165,233,0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(14,165,233,0)' },
        },
        slideUp: {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        }
      }
    }
  },
  plugins: []
}
