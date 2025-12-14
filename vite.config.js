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
    outDir: '../dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/index.html'),
        control: path.resolve(__dirname, 'src/control.html'),
        room1: path.resolve(__dirname, 'src/room1.html'),
        room2: path.resolve(__dirname, 'src/room2.html'),
        'game-room': path.resolve(__dirname, 'src/game-room.html'),
        'game-room2': path.resolve(__dirname, 'src/game-room2.html')
      },
      output: {
        manualChunks: undefined // Let Vite handle chunking for optimal caching
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
  },
  optimizeDeps: {
    include: ['p5', 'socket.io-client']  // Pre-bundle P5.js and Socket.IO client
  }
})