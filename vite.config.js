import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        decoder: resolve(__dirname, 'decoder.html'),
        create: resolve(__dirname, 'create.html'),
      },
    },
  },
});
