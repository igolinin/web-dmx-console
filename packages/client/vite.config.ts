import { defineConfig } from 'vite';
import type { ProxyOptions } from 'vite';
import type { Socket } from 'node:net';
import type { ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';

/**
 * Attach an error handler to a proxy so aborted/long-running requests (e.g. the
 * PDF upload + LLM call) that reset the connection surface as a 502 instead of
 * crashing the Vite dev server with an uncaught `write EPIPE` / `ECONNRESET`.
 */
const swallowProxyErrors: ProxyOptions['configure'] = (proxy) => {
  proxy.on('error', (err: NodeJS.ErrnoException, _req, resOrSocket) => {
    console.warn(`[vite-proxy] ${err.code ?? err.message}`);
    // HTTP response: reply 502 if we still can.
    const res = resOrSocket as ServerResponse;
    if (typeof res.writeHead === 'function') {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json' });
      }
      res.end(JSON.stringify({ error: `Proxy error: ${err.code ?? err.message}` }));
      return;
    }
    // WebSocket upgrade socket: just tear it down.
    (resOrSocket as Socket).destroy?.();
  });
};

const proxyTarget = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        configure: swallowProxyErrors,
      },
      '/socket.io': {
        target: proxyTarget,
        changeOrigin: true,
        ws: true,
        configure: swallowProxyErrors,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
