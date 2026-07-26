import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

// Two ways to run:
//   npm run dev      — plain http://localhost, for desktop + WebXR emulator work.
//                      localhost is a secure context, so WebXR still works.
//   npm run dev:lan  — HTTPS via mkcert, bound to 0.0.0.0, for a Quest on the
//                      same local network. First run installs a local dev CA
//                      (one-time) and the Quest browser shows a one-time
//                      certificate warning — clicking through it is normal.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'lan' ? [mkcert()] : [],
  build: {
    rollupOptions: {
      input: ['./index.html', './report.html'],
    },
  },
  server: {
    host: mode === 'lan' ? '0.0.0.0' : 'localhost',
  },
}));
