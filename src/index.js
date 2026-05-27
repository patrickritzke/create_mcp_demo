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
        const data = await api('GET', '/api/intake/v1/requests', args?.limit ? { limit: args.limit } : {});
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

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
