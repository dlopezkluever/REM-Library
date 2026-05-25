import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        stone: '#F5F0E8',
        charcoal: '#0F0D0B',
        canvas: '#0C0A08',
        ink: '#1C1917',
        verdigris: {
          DEFAULT: '#4A7C6F',
          light: '#E8F0EE',
          dark: '#1C4A3F',
        },
        terracotta: {
          DEFAULT: '#A0522D',
          light: '#F5EDE8',
          dark: '#5C2E12',
        },
        iris: {
          DEFAULT: '#6B5FA0',
          light: '#EEEAF5',
          dark: '#2A2240',
        },
        tan: {
          DEFAULT: '#8B7355',
          light: '#F0EDE8',
          dark: '#3A2E22',
        },
        violet: {
          DEFAULT: '#8A5A9A',
          light: '#EDE8F2',
          dark: '#2E1A3A',
        },
      },
      fontFamily: {
        display: ['Cinzel', 'Georgia', 'serif'],
        body: ['Lora', 'Georgia', 'serif'],
      },
      borderWidth: {
        '0.5': '0.5px',
      },
      letterSpacing: {
        wordmark: '0.22em',
        label: '0.16em',
        badge: '0.13em',
      },
      lineHeight: {
        reading: '1.78',
        meta: '1.65',
      },
    },
  },
  plugins: [],
}

export default config
