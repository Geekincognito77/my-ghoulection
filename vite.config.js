import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Content Security Policy for the packaged app (dev mode needs inline scripts for hot reload).
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: ghoul: https://cdn.shopify.com https://creations.mattel.com https://mhcollector.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "script-src 'self'",
  "connect-src 'self'",
].join('; ');

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'ghoul-csp',
      apply: 'build',
      transformIndexHtml: (html) =>
        html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    },
  ],
  server: { port: 5173, strictPort: true },
});
