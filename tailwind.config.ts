import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // LA Signs dark corporate palette
        bg: {
          DEFAULT: '#0a0a0f',
          surface: '#111118',
          elevated: '#1a1a24',
          hover: '#1e1e2a',
          card: '#141420',
        },
        border: {
          DEFAULT: '#232333',
          strong: '#2e2e42',
          accent: '#3d3d5c',
        },
        accent: {
          DEFAULT: '#e8a020',
          dim: '#c48518',
          glow: '#f0b030',
          muted: 'rgba(232, 160, 32, 0.15)',
        },
        text: {
          primary: '#f0f0f5',
          secondary: '#9898b0',
          muted: '#5a5a72',
          inverse: '#0a0a0f',
        },
        status: {
          draft: '#4a4a6a',
          sent: '#2563eb',
          approved: '#16a34a',
          production: '#d97706',
          completed: '#059669',
          cancelled: '#dc2626',
          pending: '#6366f1',
          designing: '#8b5cf6',
          printing: '#0ea5e9',
          installation: '#f59e0b',
          delivered: '#10b981',
        },
        priority: {
          low: '#059669',
          normal: '#6366f1',
          high: '#f59e0b',
          urgent: '#dc2626',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        elevated: '0 4px 16px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)',
        modal: '0 20px 60px rgba(0,0,0,0.7), 0 4px 20px rgba(0,0,0,0.5)',
        accent: '0 0 20px rgba(232, 160, 32, 0.2)',
        glow: '0 0 40px rgba(232, 160, 32, 0.15)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'slide-down': 'slideDown 0.25s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(0.8)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
