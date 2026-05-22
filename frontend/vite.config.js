import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY || 'http://localhost:3001';
  const host = env.VITE_HOST || '0.0.0.0';
  const port = parseInt(env.VITE_PORT || '5173', 10);

  return {
    plugins: [react()],
    server: {
      host,
      port,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      host,
      port,
    },
  };
});
