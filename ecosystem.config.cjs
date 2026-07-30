// pm2 process definition for the VPS.
//
// .cjs, not .js: package.json declares "type": "module", so a .js file here
// would be parsed as ESM and module.exports would throw.
//
// Apply once on the VPS (check `pm2 list` first — if the running process has
// a different name, delete it rather than ending up with two on port 3000):
//
//   pm2 start ecosystem.config.cjs && pm2 save
//
// After that `pm2 restart chatroom` keeps working, which is what
// scripts/update-vps.sh calls via RESTART_CMD.
module.exports = {
  apps: [
    {
      name: "chatroom", // matches RESTART_CMD="pm2 restart chatroom"
      script: "server.js",

      // The point of this file. pm2's watch mode is off by default, but that
      // default is easy to lose to a stray `pm2 start --watch`, and here it
      // would be actively destructive: the server writes room state to
      // data/room-sessions.json on every join and message, so a watcher
      // restarts the process mid-conversation, drops both players' sockets,
      // and the reconnect writes the file again — the same loop nodemon.json
      // fixes in dev, but during a live show. Keep this false.
      watch: false,

      // Belt and braces: if watch is ever turned on deliberately, these are
      // the paths that must never trigger a restart. data/ is runtime session
      // state; dist/ is static and served from disk per request.
      ignore_watch: ["data", "dist", "node_modules", ".git", "audio-assets"],

      // Socket.IO needs every packet of a session to reach the same process.
      // Cluster mode without sticky sessions breaks the websocket handshake,
      // so pin this to a single fork — both the narrative show and the
      // card-game rooms hold their state in this process's memory.
      exec_mode: "fork",
      instances: 1,

      // npm start sets NODE_ENV itself; pm2 runs server.js directly and so
      // must set it here. PORT is deliberately not set — server.js falls back
      // to 3000 and the host's environment stays authoritative.
      env: {
        NODE_ENV: "production",
      },

      // Crash recovery matters more than tidiness during a performance.
      autorestart: true,
      time: true, // timestamped logs, for working out what happened after a show

      // No max_memory_restart on purpose: a memory-triggered restart would
      // land mid-performance and drop the audience. If the process turns out
      // to leak, fix the leak.
    },
  ],
};
