# Intapp MCP Wizard

This file turns an empty repo into a working Intapp MCP server. When it is opened in Claude Code, guide the user through the four steps below. Generate all files directly in the current directory — do not clone anything.

---

## Step 1 — Collect setup information

Ask the user for all of the following before doing anything else. One question at a time is fine.

| # | What to ask | Example |
|---|-------------|---------|
| 1 | **Operating system** — Windows or Mac? | Windows |
| 2 | **Sandbox hostname** — just the hostname, no `https://` | `shalaka2-sand.opensandbox2.intapp.com` |
| 3 | **OAuth Client ID** — from Intapp admin console → OAuth Apps | `PDLCFL4XR0` |
| 4 | **OAuth Redirect URI** — from the same OAuth app config | `https://shalaka2-sand.opensandbox2.intapp.com:443` |
| 5 | **Local install path** — where they want the project on their machine | `C:\Users\name\CODE` or `~/CODE` |

**Do not ask for the Client Secret.** They will paste it themselves in Steps 3 and 4.

For **Mac only**, also ask them to run this in Terminal and share the output — you need it later:
```bash
which node
```

Once you have all answers, move to Step 2.

---

## Step 2 — Generate project files

Create the following files exactly as shown. All configuration comes from environment variables — no values need to be hardcoded.

---

### `.gitignore`

```
node_modules/
tokens.json
.env
```

---

### `package.json`

```json
{
  "name": "intapp-mcp",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "auth": "node src/auth.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "axios": "^1.7.0"
  }
}
```

---

### `src/auth.js`

```js
/**
 * Run once to authenticate with Intapp and save tokens locally.
 * Usage: node src/auth.js
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
  console.error('\nMissing env vars. Set these before running:\n');
  console.error('  INTAPP_APP_HOST, INTAPP_CLIENT_ID, INTAPP_CLIENT_SECRET, INTAPP_REDIRECT_URI');
  process.exit(1);
}

const authUrl =
  `${HOST}/auth/oauth/authorize` +
  `?response_type=code` +
  `&client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&scope=openid`;

console.log('\n=== Intapp OAuth ===\n');
console.log('1. Open this URL in your browser:\n');
console.log('   ' + authUrl);
console.log('\n2. Log in. After login you will be redirected.');
console.log('3. Copy the FULL URL from your browser address bar and paste it below.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste redirect URL: ', async (input) => {
  rl.close();
  let code = input.trim();
  try {
    const parsed = new URL(code);
    code = parsed.searchParams.get('code') ?? code;
  } catch { /* raw code, use as-is */ }

  if (!code) { console.error('No auth code found.'); process.exit(1); }

  try {
    const res = await axios.post(
      `${HOST}/auth/oauth/token`,
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const tokensPath = path.join(__dirname, '..', 'tokens.json');
    fs.writeFileSync(tokensPath, JSON.stringify({ ...res.data, acquired_at: Date.now() }, null, 2));
    console.log('\nSaved to tokens.json — authentication complete.\n');
  } catch (err) {
    console.error('\nFailed:', err.response?.data ?? err.message);
    process.exit(1);
  }
});
```

---

### `src/index.js`

```js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = path.join(__dirname, '..', 'tokens.json');

const _host         = process.env.INTAPP_APP_HOST ?? '';
const HOST          = _host.startsWith('http') ? _host : `https://${_host}`;
const CLIENT_ID     = process.env.INTAPP_CLIENT_ID;
const CLIENT_SECRET = process.env.INTAPP_CLIENT_SECRET;

// ── Token management ─────────────────────────────────────────────────────────

function loadTokens() {
  if (!fs.existsSync(TOKENS_PATH)) return null;
  return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
}

function saveTokens(data) {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify({ ...data, acquired_at: Date.now() }, null, 2));
}

async function getAccessToken() {
  const tokens = loadTokens();
  if (!tokens) throw new Error('Not authenticated. Run: node src/auth.js');
  const expiresAt = tokens.acquired_at + (tokens.expires_in - 60) * 1000;
  if (Date.now() < expiresAt) return tokens.access_token;
  const res = await axios.post(
    `${HOST}/auth/oauth/token`,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  saveTokens(res.data);
  return res.data.access_token;
}

// ── API helper ────────────────────────────────────────────────────────────────

async function api(method, endpoint, params = {}) {
  const token = await getAccessToken();
  const res = await axios({
    method,
    url: `${HOST}${endpoint}`,
    params:  method === 'GET' ? params : undefined,
    data:    method !== 'GET' ? params : undefined,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  return res.data;
}

// ── Tools ─────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'ping',
    description: 'Test that the MCP server can reach and authenticate with Intapp. Call this first.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'list_intake_requests',
    description: 'Get intake requests from Intapp',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max number of results to return' }
      }
    }
  }
];

// ── Server ────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'intapp-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result;
    switch (name) {
      case 'ping': {
        await getAccessToken();
        result = `Connected to ${HOST}\nAuthenticated successfully. Ready to use.`;
        break;
      }
      case 'list_intake_requests': {
        const data = await api('GET', '/api/intake/v1/requests', args.limit ? { limit: args.limit } : {});
        result = JSON.stringify(data, null, 2);
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    const message = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

After creating all files, commit and push them to the repo so the user can clone locally.

---

## Step 3 — Local setup commands

Tell the user to open **PowerShell** (Windows) or **Terminal** (Mac). Give them these commands using their local install path.

### Clone and install

**Windows:**
```powershell
cd "THEIR_INSTALL_PATH"
git clone YOUR_REPO_URL my_custom_intapp_mcp
cd my_custom_intapp_mcp
npm install
```

**Mac:**
```bash
cd THEIR_INSTALL_PATH
git clone YOUR_REPO_URL my_custom_intapp_mcp
cd my_custom_intapp_mcp
npm install
```

### Run the prereq check

After `npm install`, tell them to run:

```
node scripts/check.js
```

This checks Node.js version, Git, dependencies, and Claude Desktop — and fixes any ✗ items before continuing. Tell them to share the output if anything fails.

### Authenticate (run once)

Tell the user to paste their Client Secret where indicated. Keep the same terminal window open so the env vars carry through to the auth script.

**Windows:**
```powershell
$env:INTAPP_APP_HOST      = "THEIR_HOST"
$env:INTAPP_CLIENT_ID     = "THEIR_CLIENT_ID"
$env:INTAPP_CLIENT_SECRET = "PASTE_YOUR_SECRET_HERE"
$env:INTAPP_REDIRECT_URI  = "THEIR_REDIRECT_URI"
node src/auth.js
```

**Mac:**
```bash
export INTAPP_APP_HOST="THEIR_HOST"
export INTAPP_CLIENT_ID="THEIR_CLIENT_ID"
export INTAPP_CLIENT_SECRET="PASTE_YOUR_SECRET_HERE"
export INTAPP_REDIRECT_URI="THEIR_REDIRECT_URI"
node src/auth.js
```

Explain what happens:
1. A URL will be printed — they open it in the browser and log in
2. After login the browser redirects — they copy the **full URL** from the address bar
3. They paste it back into the terminal
4. `tokens.json` is saved locally — gitignored, never committed

Tell them to confirm they see **"Saved to tokens.json"** before continuing.

### Run the check again to get the config block

In the same terminal window (env vars still set), run:

```
node scripts/check.js
```

This time it prints a ready-to-paste Claude Desktop config block with the correct node path and file path for their machine — with their HOST, CLIENT_ID, and REDIRECT_URI already filled in. They only need to add their Client Secret.

---

## Step 4 — Claude Desktop config

Tell the user to **fully quit Claude Desktop first** — right-click the tray/menu bar icon → Quit. Not just close the window.

### Open the config

**Windows:**
```powershell
code "$env:APPDATA\Claude\claude_desktop_config.json"
```

**Mac:**
```bash
code "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
```

### Paste the config block

The config block was printed by `node scripts/check.js` at the end of Step 3. Tell them to:

1. Paste it inside `"mcpServers": { ... }`
2. Replace `YOUR_CLIENT_SECRET` with their actual Client Secret
3. Save the file
4. Reopen Claude Desktop

---

## Verify

Once Claude Desktop is open, tell them to start a new chat and ask:

> "Call the intappCeleste ping tool"

Expected: `Connected to https://... — Authenticated successfully.`

---

## Troubleshooting

**MCP not showing up** — Claude Desktop was open when they saved the config. Kill it and reopen:
- Windows: `Stop-Process -Name "claude" -Force`
- Mac: `pkill -x "Claude"`

**JSON syntax error in config** — missing comma or bracket. Check carefully around the new block.

**Auth error** — tokens missing or expired. Re-run the auth commands in Step 3.

**Test the server directly** — silence means it is running, an error message means something to fix:
- Windows: `& "C:\Program Files\nodejs\node.exe" "THEIR_INSTALL_PATH\my_custom_intapp_mcp\src\index.js"`
- Mac: `node THEIR_INSTALL_PATH/my_custom_intapp_mcp/src/index.js`
