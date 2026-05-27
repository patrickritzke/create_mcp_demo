/**
 * Run this ONCE to authenticate with Intapp and save tokens locally.
 * Usage: node src/auth.js
 *
 * Set these env vars first (see README or .env.example):
 *   INTAPP_APP_HOST, INTAPP_CLIENT_ID, INTAPP_CLIENT_SECRET, INTAPP_REDIRECT_URI
 */

import readline from 'readline';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const _host        = process.env.INTAPP_APP_HOST ?? '';
const HOST         = _host.startsWith('http') ? _host : `https://${_host}`;
const CLIENT_ID    = process.env.INTAPP_CLIENT_ID;
const CLIENT_SECRET = process.env.INTAPP_CLIENT_SECRET;
const REDIRECT_URI = process.env.INTAPP_REDIRECT_URI;

if (!HOST || !CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error('\nMissing environment variables. Set these before running:\n');
  console.error('  $env:INTAPP_APP_HOST      = "https://shalaka2-sand.opensandbox2.intapp.com"');
  console.error('  $env:INTAPP_CLIENT_ID     = "PDLCFL4XR0"');
  console.error('  $env:INTAPP_CLIENT_SECRET = "your-secret"');
  console.error('  $env:INTAPP_REDIRECT_URI  = "https://shalaka2-sand.opensandbox2.intapp.com:443"');
  process.exit(1);
}

const authUrl =
  `${HOST}/auth/oauth/authorize` +
  `?response_type=code` +
  `&client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&scope=openid`;

console.log('\n=== Intapp OAuth Setup ===\n');
console.log('Step 1 — Open this URL in your browser:\n');
console.log('  ' + authUrl);
console.log('\nStep 2 — Log in. You will be redirected somewhere after login.');
console.log('Step 3 — Copy the FULL redirect URL from your browser address bar and paste it below.\n');
console.log('         (It will look like: https://...?code=XXXXXX&...)\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste redirect URL here: ', async (input) => {
  rl.close();

  let code = input.trim();
  try {
    const parsed = new URL(code);
    code = parsed.searchParams.get('code') ?? code;
  } catch {
    // input was already just the raw code
  }

  if (!code) {
    console.error('Could not extract auth code from input.');
    process.exit(1);
  }

  console.log('\nExchanging code for tokens...');

  try {
    const res = await axios.post(
      `${HOST}/auth/oauth/token`,
      new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const tokens = { ...res.data, acquired_at: Date.now() };
    const tokensPath = path.join(__dirname, '..', 'tokens.json');
    fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));

    console.log('\nSaved to tokens.json — you are ready to go!');
    console.log('Claude Desktop will pick up changes on next restart.\n');
  } catch (err) {
    console.error('\nFailed to get tokens:');
    console.error(err.response?.data ?? err.message);
    process.exit(1);
  }
});
