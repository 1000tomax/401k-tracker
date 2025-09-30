import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [react()],
    server: {
      open: true,
      hmr: {
        overlay: true,
      },
      // Proxy API requests to production in dev mode
      // (Plaid doesn't work well in dev anyway, so just use production)
      proxy: {
        '/api': {
          target: 'https://401k.mreedon.com',
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});