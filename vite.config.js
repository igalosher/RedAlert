import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import orefHistoryPlugin from './oref-history-plugin.js';

export default defineConfig({
  plugins: [react(), orefHistoryPlugin()],
  server: {
    proxy: {
      '/api/oref': {
        target: 'https://www.oref.org.il',
        changeOrigin: true,
        rewrite: () => '/warningMessages/alert/Alerts.json',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('X-Requested-With', 'XMLHttpRequest');
            proxyReq.setHeader('Referer', 'https://www.oref.org.il/');
          });
        },
      },
      '/api/ifttt': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
