# Intapp MCP Setup

Connect Claude Desktop to an Intapp sandbox via MCP. Once set up, Claude can call Intapp APIs directly in conversation.

---

## Prerequisites

- [Node.js](https://nodejs.org) installed (check: `node --version` in PowerShell)
- [Git](https://git-scm.com) installed
- An Intapp sandbox OAuth app (Client ID + Client Secret)
- Claude Desktop installed

---

## Step 1 — Clone and install

Open PowerShell and run:

```powershell
cd "C:\Users\patrickr\OneDrive - Intapp\CODE"
git clone https://github.com/patrickritzke/create_mcp_demo.git intapp-mcp
cd intapp-mcp
npm install
```

---

## Step 2 — Authenticate (once only)

Set your credentials and run the auth script. It will open a browser URL for you to log in.

```powershell
$env:INTAPP_APP_HOST      = "shalaka2-sand.opensandbox2.intapp.com"
$env:INTAPP_CLIENT_ID     = "PDLCFL4XR0"
$env:INTAPP_CLIENT_SECRET = "your-secret-here"
$env:INTAPP_REDIRECT_URI  = "https://shalaka2-sand.opensandbox2.intapp.com:443"
node src/auth.js
```

When prompted:
1. Copy the URL printed to the terminal and open it in your browser
2. Log in with your Intapp sandbox credentials
3. After login you will be redirected — copy the full URL from the browser address bar
4. Paste it back into the terminal

A `tokens.json` file will be saved locally. This is gitignored and never committed.

---

## Step 3 — Add to Claude Desktop config

Open the Claude Desktop config file:

```powershell
code "$env:APPDATA\Claude\claude_desktop_config.json"
```

> Quit Claude Desktop fully before editing (right-click tray icon → Quit).

Add this inside `"mcpServers"`:

```json
"intappCeleste": {
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": [
    "C:\\Users\\patrickr\\OneDrive - Intapp\\CODE\\intapp-mcp\\src\\index.js"
  ],
  "env": {
    "INTAPP_APP_HOST": "shalaka2-sand.opensandbox2.intapp.com",
    "INTAPP_CLIENT_ID": "PDLCFL4XR0",
    "INTAPP_CLIENT_SECRET": "your-secret-here",
    "INTAPP_REDIRECT_URI": "https://shalaka2-sand.opensandbox2.intapp.com:443"
  }
}
```

Save and reopen Claude Desktop.

---

## Step 4 — Verify

In Claude Desktop, ask:

> "Call the intappCeleste ping tool"

You should see: `Connected to https://shalaka2-sand.opensandbox2.intapp.com — Authenticated successfully.`

---

## Step 5 — Add tools

Tools live in `src/index.js`. Each tool needs two things:

**1. A definition** (add to the `TOOLS` array):
```js
{
  name: 'search_matters',
  description: 'Search for matters by name or number',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search term' }
    },
    required: ['query']
  }
}
```

**2. A handler** (add a case to the `switch` in `setRequestHandler`):
```js
case 'search_matters':
  data = await api('GET', '/api/v1/matters', { search: args.query });
  break;
```

After editing, kill and restart Claude Desktop to pick up changes:

```powershell
Stop-Process -Name "claude" -Force
```

---

## Troubleshooting

**MCP not showing up** — Claude Desktop was open when you saved the config. Kill it fully and reopen:
```powershell
Stop-Process -Name "claude" -Force
```

**Auth failed** — Your `tokens.json` may be expired. Re-run Step 2.

**Test the server manually** — If Claude Desktop won't load it, run the server directly and check for errors:
```powershell
& "C:\Program Files\nodejs\node.exe" "C:\Users\patrickr\OneDrive - Intapp\CODE\intapp-mcp\src\index.js"
```
Silence = running correctly. An error message = something to fix.

**Pull latest changes**:
```powershell
cd "C:\Users\patrickr\OneDrive - Intapp\CODE\intapp-mcp"
git pull
npm install
```
