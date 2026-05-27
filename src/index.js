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

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

function loadTokens() {
  if (!fs.existsSync(TOKENS_PATH)) return null;
  return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
}

function saveTokens(data) {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify({ ...data, acquired_at: Date.now() }, null, 2));
}

async function getAccessToken() {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error('Not authenticated. Run "npm run auth" in the intapp-mcp directory first.');
  }

  const expiresAt = tokens.acquired_at + (tokens.expires_in - 60) * 1000;
  if (Date.now() < expiresAt) return tokens.access_token;

  // Refresh the token
  const res = await axios.post(
    `${HOST}/auth/oauth/token`,
    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token:  tokens.refresh_token,
      client_id:      CLIENT_ID,
      client_secret:  CLIENT_SECRET
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  saveTokens(res.data);
  return res.data.access_token;
}

// ---------------------------------------------------------------------------
// Generic API helper
// ---------------------------------------------------------------------------

async function api(method, endpoint, params = {}) {
  const token = await getAccessToken();
  const res = await axios({
    method,
    url: `${HOST}${endpoint}`,
    params:  method === 'GET' ? params : undefined,
    data:    method !== 'GET' ? params : undefined,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return res.data;
}

// ---------------------------------------------------------------------------
// MCP server definition
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'intapp-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: 'ping',
    description: 'Test that the MCP server can authenticate with Intapp. Call this first to confirm everything is wired up.',
    inputSchema: { type: 'object', properties: {} }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  if (name !== 'ping') {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }

  try {
    const token = await getAccessToken();
    return {
      content: [{
        type: 'text',
        text: `Connected to ${HOST}\nAuthenticated successfully. Ready to add tools.`
      }]
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Auth failed: ${err.message}` }],
      isError: true
    };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
