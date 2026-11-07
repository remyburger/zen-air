import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base must match the GitHub repo name: https://remyburger.github.io/zen-air/
export default defineConfig({
  base: '/zen-air/',
  plugins: [react()],
});
