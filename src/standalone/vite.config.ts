import {fileURLToPath} from 'node:url';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {defineConfig} from 'vite';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  root: path('./'),
  base: './',
  cacheDir: path('../../node_modules/.cache/bettergi-web'),
  publicDir: false,
  plugins: [react(), tailwind()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      {find: 'loom-frame/ui/styles.css', replacement: path('../../moduloom/webui/src/styles.css')},
      {find: 'loom-frame/ui', replacement: path('../../moduloom/webui/src/index.ts')},
      {find: 'react', replacement: path('../../node_modules/react')},
      {find: 'react-dom', replacement: path('../../node_modules/react-dom')},
    ],
  },
  build: {
    outDir: path('../../dist/bettergi-web'),
    emptyOutDir: true,
  },
});
