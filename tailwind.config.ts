import type { Config } from 'tailwindcss';
export default {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { mint: '#c5f277', ink: '#131a17' },
      fontFamily: { sans: ['Inter', 'Microsoft YaHei', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
