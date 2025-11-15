import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/AiStudio/',
  plugins: [react()],
  server: {
    port: 3000, // Optional: specify a port
    // FIX: The configuration for `server.open` was using an object structure that
    // seems unsupported in the current environment, causing a type error.
    // Switched to a string value to specify the browser directly.
    // Note: This method does not support passing command-line arguments like '--inprivate'.
    open: 'microsoft-edge',
  },
});
