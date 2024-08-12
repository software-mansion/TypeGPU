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
          stroke: '#00000029',
        },
        gradient: {
          purple: '#C464FF',
          blue: '#1D72F0',
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
