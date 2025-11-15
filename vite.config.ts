import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/AiStudio/',
  plugins: [react()],
  server: {
    port: 3000, // Optional: specify a port
    // Opens the browser in InPrivate mode.
    // Note: The app name might be 'msedge' or 'microsoft-edge' depending on your system.
    // FIX: The `server.open` option accepts an object, but the project's type definitions may be outdated. Using @ts-ignore to suppress the resulting type error.
    // @ts-ignore
    open: {
      app: {
        name: 'msedge',
        arguments: ['--inprivate'],
      },
    },
  },
});
