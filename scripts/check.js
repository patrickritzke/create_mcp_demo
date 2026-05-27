/**
 * Prerequisites check + Claude Desktop config snippet generator.
 * Run: node scripts/check.js
 */

import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const ok   = (msg) => console.log(`  ✓  ${msg}`);
const fail = (msg) => console.log(`  ✗  ${msg}`);
const hint = (msg) => console.log(`     → ${msg}`);

console.log('\n=== Intapp MCP — Setup Check ===\n');

// ── Node.js ──────────────────────────────────────────────────────────────────
const [major] = process.versions.node.split('.').map(Number);
if (major >= 18) {
  ok(`Node.js ${process.version}`);
} else {
  fail(`Node.js ${process.version} — version 18+ required`);
  hint('Download: https://nodejs.org');
}

// ── Git ───────────────────────────────────────────────────────────────────────
try {
  const git = execSync('git --version', { encoding: 'utf8' }).trim();
  ok(git);
} catch {
  fail('Git not found');
  hint('Download: https://git-scm.com');
}

// ── npm install ───────────────────────────────────────────────────────────────
if (fs.existsSync(path.join(ROOT, 'node_modules'))) {
  ok('node_modules present');
} else {
  fail('node_modules missing — dependencies not installed');
  hint('Run: npm install');
}

// ── Auth tokens ───────────────────────────────────────────────────────────────
if (fs.existsSync(path.join(ROOT, 'tokens.json'))) {
  ok('tokens.json found (authenticated)');
} else {
  fail('tokens.json missing — not yet authenticated');
  hint('Run: node src/auth.js');
}

// ── OS + Claude Desktop config path ──────────────────────────────────────────
const platform = process.platform;
let configPath;
if (platform === 'win32') {
  configPath = path.join(process.env.APPDATA ?? '', 'Claude', 'claude_desktop_config.json');
} else if (platform === 'darwin') {
  configPath = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
} else {
  configPath = path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

console.log('');
if (fs.existsSync(configPath)) {
  ok(`Claude Desktop config found`);
  hint(configPath);
} else {
  fail('Claude Desktop config not found — is Claude Desktop installed?');
  hint(`Expected at: ${configPath}`);
}

// ── Generated config snippet ──────────────────────────────────────────────────
const indexPath = path.join(ROOT, 'src', 'index.js');
const nodeBin   = process.execPath; // path to the node that is currently running

const snippet = {
  intappCeleste: {
    command: nodeBin,
    args: [indexPath],
    env: {
      INTAPP_APP_HOST:      'shalaka2-sand.opensandbox2.intapp.com',
      INTAPP_CLIENT_ID:     'YOUR_CLIENT_ID',
      INTAPP_CLIENT_SECRET: 'YOUR_CLIENT_SECRET',
      INTAPP_REDIRECT_URI:  'https://shalaka2-sand.opensandbox2.intapp.com:443'
    }
  }
};

console.log('\n=== Add this block inside "mcpServers" in your Claude Desktop config ===\n');
console.log(JSON.stringify(snippet, null, 2));
console.log('\n(Fill in YOUR_CLIENT_ID and YOUR_CLIENT_SECRET from your Intapp OAuth app)\n');
