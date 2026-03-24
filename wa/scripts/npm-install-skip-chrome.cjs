/**
 * npm install dengan PUPPETEER_SKIP_DOWNLOAD — untuk Windows bila unduhan Chrome Puppeteer gagal / cache rusak.
 * Jalankan dari folder wa: npm run install:safe
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const env = { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true' };
const r = spawnSync('npm', ['install', '--no-fund'], {
  stdio: 'inherit',
  env,
  shell: true,
  cwd: root,
});
process.exit(r.status === null ? 1 : r.status);
