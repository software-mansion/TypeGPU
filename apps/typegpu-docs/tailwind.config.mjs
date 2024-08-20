/** @type {import('tailwindcss').Config} */
import defaultTheme from 'tailwindcss/defaultTheme';

export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Aeonik', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        grayscale: {
          100: '#000000',
          80: '#333333',
          60: '#808080',
          20: '#EBEBED',
          0: '#FFF',
        },
        special: {
          stroke: '#2a0a6629',
        },
        gradient: {
          purple: '#C464FF',
          'purple-dark': '#A91EFF',
          blue: '#1D72F0',
          'blue-dark': '#0058DD',
        },
      },
    },

    screens: {
      sm: '601px',
      md: '1025px',
      lg: '1441px',
    },
  },
  plugins: [],
};
