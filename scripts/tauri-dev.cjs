const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const tauriCli = process.platform === 'win32'
  ? path.join(repoRoot, 'node_modules', '.bin', 'tauri.cmd')
  : path.join(repoRoot, 'node_modules', '.bin', 'tauri');

const env = {
  ...process.env,
  XM_PROFILE: process.env.XM_PROFILE || 'dev',
  XM_API_PORT: process.env.XM_API_PORT || '1457',
  VITE_XM_PROFILE: process.env.VITE_XM_PROFILE || 'dev',
};
const extraArgs = process.argv.slice(2);

const syncResult = spawnSync('npm', ['run', 'sync-version'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

if (syncResult.status !== 0) {
  process.exit(syncResult.status ?? 1);
}

const tauriResult = spawnSync(
  tauriCli,
  ['dev', '--config', 'src-tauri/tauri.dev.conf.json', ...extraArgs],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  },
);

process.exit(tauriResult.status ?? 1);
