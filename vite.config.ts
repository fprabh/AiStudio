import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/AiStudio/',
  plugins: [react()],
  server: {
    port: 3000, // Optional: specify a port
    open: true,   // Optional: automatically open the app in the browser
  },
});
