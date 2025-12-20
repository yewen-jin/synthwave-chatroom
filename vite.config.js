import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  root: 'src',
  publicDir: '../public', // Copy files from public dir to dist
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
    chunkSizeWarningLimit: 2000, // Increased to 2MB to handle large dependencies like p5.js
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/index.html'),
        control: path.resolve(__dirname, 'src/control.html'),
        room1: path.resolve(__dirname, 'src/room1.html'),
        room2: path.resolve(__dirname, 'src/room2.html'),
        'player-room': path.resolve(__dirname, 'src/player-room.html'),
        'narrator-room': path.resolve(__dirname, 'src/narrator-room.html')
      },
      output: {
        manualChunks: (id) => {
          // Split vendor libraries into separate chunks for better caching
          if (id.includes('node_modules')) {
            if (id.includes('p5')) {
              return 'vendor-p5';
            }
            if (id.includes('socket.io-client')) {
              return 'vendor-socket';
            }
            return 'vendor'; // Other vendor code
          }
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
  },
  optimizeDeps: {
    include: ['p5', 'socket.io-client']  // Pre-bundle P5.js and Socket.IO client
  }
})