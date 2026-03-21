# Wappalyzer MCP

`wappalyzer-mcp` is a local stdio MCP server that wraps the public Wappalyzer API.

V1 scope:

- local `stdio` transport only
- existing API-key passthrough only
- read-only only
- synchronous only

V1 exclusions:

- no hosted or remote MCP transport
- no Wappalyzer account auth or OAuth
- no async recursive live crawl workflow
- no write endpoints such as lists, alerts, or verify

## Requirements

- Node.js 20+
- A Wappalyzer API key in `WAPPALYZER_API_KEY`

## Install

```bash
cd /Users/elbert/Sites/wappalyzer/mcp
npm install
```

## Run

```bash
WAPPALYZER_API_KEY=your_api_key npx wappalyzer-mcp
```

Environment variables:

- `WAPPALYZER_API_KEY` required
- `WAPPALYZER_API_BASE_URL` optional, defaults to `https://api.wappalyzer.com/v2/`
- `WAPPALYZER_METADATA_BASE_URL` optional, defaults to `WAPPALYZER_API_BASE_URL`
- `WAPPALYZER_HTTP_TIMEOUT_MS` optional, defaults to `30000`

The server fails fast on startup if `WAPPALYZER_API_KEY` is missing.

## Tools

### `lookup_site`

Inputs:

- `url` required
- `live` optional, default `false`
- `sets` optional, default `[]`
- `denoise` optional, default `true`
- `max_age` optional, default `2`

Notes:

- exactly one URL is accepted
- `recursive=false` is always forced
- unsupported async-only parameters are not exposed
- `sets` is limited to `locale`, `email`, `phone`, `contact`, `social`, `meta`, `security`, `trackers`, `company`, `keywords`, `signals`, `createdAt`, `events`, and `all`

Output:

```json
{
  "request": {
    "url": "https://www.wappalyzer.com/",
    "live": false,
    "sets": [
      "company",
      "contact"
    ],
    "denoise": true,
    "max_age": 2,
    "recursive": false
  },
  "data": {},
  "credits": {
    "spent": 1,
    "remaining": 99999
  }
}
```

### `lookup_subdomains`

Inputs:

- `domain` required
- `limit` optional, default `100`
- `after` optional

Notes:

- exactly one domain is accepted
- `limit` must be between `10` and `1000` and a multiple of `10`

Output:

```json
{
  "request": {
    "domain": "example.com",
    "limit": 100
  },
  "data": {},
  "credits": {
    "spent": 1,
    "remaining": 99999
  }
}
```

### `get_credit_balance`

Output:

```json
{
  "credits": 99999
}
```

## Resources

- `wappalyzer://technologies`
- `wappalyzer://technologies/{slug}`
- `wappalyzer://categories`
- `wappalyzer://categories/{slug}`

These resources are read-only and fetch public metadata from:

- `GET /technologies/`
- `GET /technologies/{slug}/`
- `GET /categories/`
- `GET /categories/{slug}/`

Metadata resources do not send the API key and are cached in-process for 5 minutes.

## Client Config

### Claude Desktop

Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wappalyzer": {
      "command": "node",
      "args": [
        "/Users/elbert/Sites/wappalyzer/mcp/index.js"
      ],
      "env": {
        "WAPPALYZER_API_KEY": "your_api_key"
      }
    }
  }
}
```

### Cursor

Add this to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "wappalyzer": {
      "command": "node",
      "args": [
        "/Users/elbert/Sites/wappalyzer/mcp/index.js"
      ],
      "env": {
        "WAPPALYZER_API_KEY": "your_api_key"
      }
    }
  }
}
```

### ChatGPT

OpenAI currently documents remote MCP connectors rather than local `stdio` MCP configuration. Because this package is intentionally local and `stdio`-only in v1, there is no direct ChatGPT config snippet for it yet.

If ChatGPT support matters, that needs a separate remote MCP phase.

## Development

Run automated tests:

```bash
npm test
```

Run live smoke tests with the local secret file:

```bash
npm run test:live
```
