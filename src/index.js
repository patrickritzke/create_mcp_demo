import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = path.join(__dirname, '..', 'tokens.json');

const HOST          = process.env.INTAPP_APP_HOST;
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
    name: 'search_matters',
    description: 'Search for matters in Intapp by name or number',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Matter name or number to search for' },
        limit: { type: 'number',  description: 'Max results to return (default 10)' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_matter',
    description: 'Get full details for a specific matter',
    inputSchema: {
      type: 'object',
      properties: {
        matter_id: { type: 'string', description: 'The matter ID' }
      },
      required: ['matter_id']
    }
  },
  {
    name: 'search_clients',
    description: 'Search for clients in Intapp',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Client name to search for' },
        limit: { type: 'number',  description: 'Max results to return (default 10)' }
      },
      required: ['query']
    }
  },
  {
    name: 'list_time_entries',
    description: 'List time entries for a given matter',
    inputSchema: {
      type: 'object',
      properties: {
        matter_id: { type: 'string', description: 'Matter ID' },
        limit:     { type: 'number', description: 'Max results (default 20)' }
      },
      required: ['matter_id']
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let data;
    switch (name) {
      case 'search_matters':
        data = await api('GET', '/api/v1/matters', { search: args.query, limit: args.limit ?? 10 });
        break;
      case 'get_matter':
        data = await api('GET', `/api/v1/matters/${args.matter_id}`);
        break;
      case 'search_clients':
        data = await api('GET', '/api/v1/clients', { search: args.query, limit: args.limit ?? 10 });
        break;
      case 'list_time_entries':
        data = await api('GET', '/api/v1/time/entries', { matterId: args.matter_id, limit: args.limit ?? 20 });
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };

  } catch (err) {
    const message = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true
    };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
