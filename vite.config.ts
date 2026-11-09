import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base: './' => toàn bộ asset dùng đường dẫn tương đối, copy thư mục dist/
// vào bất kỳ thư mục con nào của XAMPP (htdocs/caro) hay web server tĩnh đều chạy.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
