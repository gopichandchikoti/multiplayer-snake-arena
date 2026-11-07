// One-step setup for a fresh clone: checks the toolchain, installs dependencies, optionally installs the
// browser used by the end-to-end tests. Usage: node scripts/bootstrap.mjs [--browsers]
import { spawnSync } from 'node:child_process';

const REQUIRED_NODE = [22, 12];
const withBrowsers = process.argv.includes('--browsers');

function fail(message) {
  process.stderr.write(`bootstrap: ${message}\n`);
  process.exit(1);
}

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
if (major < REQUIRED_NODE[0] || (major === REQUIRED_NODE[0] && minor < REQUIRED_NODE[1])) {
  fail(`Node ${REQUIRED_NODE.join('.')} or newer is required, found ${process.versions.node}`);
}

function run(command, args) {
  process.stdout.write(`> ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) fail(`"${command} ${args.join(' ')}" failed with exit code ${String(result.status)}`);
}

const pnpm = spawnSync('pnpm', ['--version'], { shell: process.platform === 'win32', encoding: 'utf8' });
if (pnpm.status !== 0) fail('pnpm was not found. Install it with: npm install -g pnpm@11.28.3');
process.stdout.write(`node ${process.versions.node}, pnpm ${pnpm.stdout.trim()}\n`);

run('pnpm', ['install', '--frozen-lockfile']);
if (withBrowsers) run('pnpm', ['exec', 'playwright', 'install', 'chromium']);

process.stdout.write(
  [
    '',
    'Ready. Next:',
    '  pnpm dev       game at http://127.0.0.1:5720 (server on 5722)',
    '  pnpm verify    lint, format check, typecheck, tests with coverage, build',
    '  pnpm e2e       browser tests (needs: node scripts/bootstrap.mjs --browsers)',
    '  pnpm start     production server on http://127.0.0.1:5722 after pnpm build',
    '',
  ].join('\n'),
);
