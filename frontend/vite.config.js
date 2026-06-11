import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Remove crossorigin from built script/link tags — avoids CORS mode for same-origin LAN/tunnel. */
function stripCrossOrigin() {
  return {
    name: 'financeos-strip-crossorigin',
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin/g, '');
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY || 'http://localhost:3001';
  const host = env.VITE_HOST || '0.0.0.0';
  const port = parseInt(env.VITE_PORT || '5173', 10);

  return {
    plugins: [react(), stripCrossOrigin()],
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
