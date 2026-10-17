/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: {
          50: '#fefef9',
          100: '#fdfdf3',
          200: '#faf8ee',
          300: '#f5f2e4',
          400: '#ede8d0',
        },
        forest: {
          50: '#fbf4f6',
          100: '#f6e3e9',
          200: '#eec6d1',
          300: '#e09cb0',
          400: '#cd6886',
          500: '#b44164',
          600: '#9a2f51',
          700: '#7f2542',
          800: '#671e36',
          900: '#50182a',
          950: '#34101b',
        },
        terracotta: {
          50: '#fdf5f0',
          100: '#fae8dc',
          200: '#f4cfc0',
          300: '#ecac95',
          400: '#e08468',
          500: '#d4634a',
          600: '#bf4d3a',
          700: '#a03e30',
          800: '#84362b',
          900: '#6e3028',
        },
        charcoal: {
          50: '#f6f6f5',
          100: '#e7e7e5',
          200: '#d0d0cd',
          300: '#a9a9a5',
          400: '#7a7a76',
          500: '#5a5a56',
          600: '#444441',
          700: '#333331',
          800: '#262624',
          900: '#1a1a19',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-up': 'fadeUp 0.6s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      boxShadow: {
        soft: '0 2px 12px rgba(80, 24, 42, 0.06)',
        card: '0 4px 24px rgba(80, 24, 42, 0.08)',
        elevated: '0 8px 32px rgba(80, 24, 42, 0.13)',
      },
    },
  },
  plugins: [],
};
