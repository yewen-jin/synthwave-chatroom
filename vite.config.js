import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  root: 'src',
  server: {
    port: 5173,
    host: true,
    open: false,
    proxy: {
      '/socket.io': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../dist',  // Changed to relative path
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/index.html')
      },
      output: {
        manualChunks: {
          'vendor': ['p5'],
          'socket': ['socket.io-client'],
          'style': ['./src/style.css']
        }
      }
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        dead_code: true,
        booleans_as_integers: true
      },
      mangle: {
        toplevel: true
      }
    }
  }
})