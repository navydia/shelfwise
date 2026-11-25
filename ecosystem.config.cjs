// pm2 config: keeps Shelfwise running, restarts it if it crashes,
// and restarts it automatically when files in src/ change (e.g. after git pull).
module.exports = {
  apps: [
    {
      name: 'shelfwise',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'src/main.ts',
      cwd: __dirname,
      watch: ['src', 'package.json'],
      ignore_watch: ['data', 'node_modules', '.git', 'public'],
      kill_timeout: 5000,
    },
  ],
};
