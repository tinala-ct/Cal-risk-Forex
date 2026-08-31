import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs work both at localhost and under
  // https://tinala-ct.github.io/Cal-risk-Forex/.
  base: './',
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
});
