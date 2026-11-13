import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  // Cast process to any to avoid TS error: Property 'cwd' does not exist on type 'Process'
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    base: './',
    plugins: [react(), viteSingleFile()],
    build: {
      outDir: 'dist',
      sourcemap: false
    },
    optimizeDeps: {
      include: ['xlsx', 'idb', '@google/genai'],
    }
  };
});