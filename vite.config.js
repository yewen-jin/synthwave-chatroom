import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src',
  server: {
    port: 5173,
    host: true,
    open: false,
    proxy: {
      '/socket.io': {
        target: 'ws://localhost:3000',  // WebSocket connection to your Socket.IO server
        ws: true,                       // Enable WebSocket proxying
        changeOrigin: true             // Changes the origin of the host header to the target URL
      }
    }
  },
    build: {
        // output directory for production build
        outDir: '../dist',

        // Directory for Chunk files
        assetsDir: 'assets',

        // Clean output directory before each build
        emptyOutDir: true,

        // Source map generation
        sourcemap: true,

    // Add optimization settings
    rollupOptions: {
      output: {
        //chunk splitting strategy
        manualChunks: {
          'vendor':['p5', 'socket.io-client'],
          'styles':['./src/styles.css']
        }
      }
    },

    // Minification options
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console logs for debugging
        drop_debugger: true, // Remove debugger statements in production
        dead_code: true, // Remove unreachable code
        booleans_as_integers: true, // Convert boolean literals to integers
      },
      mangle: {
        // shorten variable names
        toplevel: true, // Mangle top-level variable names
      }
    }
  },
  optimizeDeps: {
    include: ['p5']  // Pre-bundle P5.js
  }
})