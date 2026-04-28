import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#EEF6F1',
          100: '#CEEADE',
          200: '#9ED4BC',
          300: '#65B898',
          400: '#3A9C7A',
          500: '#1B6B4A',  // hoofdkleur — islamitisch groen
          600: '#155A3D',
          700: '#0F4530',
          800: '#0A3023',
          900: '#061E16',
        },
        gold: {
          50:  '#FDF8EE',
          100: '#F8EDD0',
          200: '#F0D79C',
          300: '#E5BC5E',
          400: '#D4A030',
          500: '#B8861A',
          600: '#9A6F14',
          700: '#7C570F',
          800: '#5E420B',
          900: '#3F2C07',
        },
        navy: {
          50:  '#EEF2F8',
          100: '#CBD8EE',
          200: '#97B0DC',
          300: '#5E84C6',
          400: '#3563AE',
          500: '#1E3A5F',  // donker marineblauw
          600: '#183050',
          700: '#122540',
          800: '#0D1B30',
          900: '#081120',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          warm:    '#F8F7F4',  // warme off-white achtergrond
          card:    '#FFFFFF',
        },
        border: {
          DEFAULT: '#E5E3DC',
          light:   '#F0EDE8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        arabic: ['Amiri', 'serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'card':  '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        'modal': '0 20px 60px rgba(0,0,0,0.15)',
      },
      animation: {
        'fade-in':     'fadeIn 0.2s ease-out',
        'slide-up':    'slideUp 0.3s ease-out',
        'slide-in':    'slideIn 0.25s ease-out',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideIn: { from: { opacity: '0', transform: 'translateX(-8px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
      },
    },
  },
  plugins: [],
}

export default config
