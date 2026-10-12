import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync } from 'node:fs'
import { defineConfig } from 'vite'

// base matches the nginx mount path (/agent-tools/) in branch deploys --
// see deploy/nginx.branch.conf. Without this, built asset URLs resolve
// against "/" instead of "/agent-tools/" and 404 once this app isn't
// served from the domain root.
export default defineConfig({
  base: '/agent-tools/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // demo.html is the guided-demo entry point (see src/demo/README.md).
      // Built when present; the app does not need it.
      input: existsSync('demo.html') ? ['index.html', 'demo.html'] : ['index.html'],
    },
  },
  server: {
    // Fixed, not auto-incrementing -- apps/portfolio's colibri-widgets
    // demo iframe hardcodes this port for local dev.
    port: 5174,
    strictPort: true,
    // Vite binds to localhost only by default. This app gets reached over
    // Tailscale both directly and via the portfolio shell's embedding
    // iframe (see apps/portfolio/src/components/demos/IframeDemo.tsx).
    host: true,
    // Mirrors nginx's production proxy (see deploy/nginx.branch.conf) so
    // src/resolve.ts can use the same relative "/agent-tools-api" path in
    // both environments. Without this, the browser's fetch would be a
    // genuine cross-origin request from Vite's dev server to
    // localhost:8000 and get blocked by CORS -- unlike ssr-agent's
    // pickTool, this app's fetch runs client-side, not server-side.
    proxy: {
      '/agent-tools-api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/agent-tools-api/, ''),
      },
    },
  },
})
