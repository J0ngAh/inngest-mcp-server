# Inngest MCP Server

Connect AI assistants to your Inngest event-driven workflows. Send events, monitor runs, and debug execution using natural language.

**What it does**: Lets you ask Claude things like "send a user.created event", "check the status of run abc123", or "get details for event xyz456 runs".

## Prerequisites

- Node.js 22+
- [Claude Desktop](https://claude.ai/download) (recommended) or any MCP client
- Inngest account with functions deployed (Cloud) or local dev server

## Quick Start

1. **Install and build**:
```bash
git clone <this-repo>
cd inngest-mcp-server
npm install && npm run build
```

2. **Configure for your environment**:

**For Inngest Cloud:**
```bash
export INNGEST_SIGNING_KEY="signkey-prod-xxxxx"  # From Inngest dashboard
export INNGEST_BASE_URL="https://api.inngest.com"
export INNGEST_ENV="production"  # or your environment name
npm start
```

**For local development:**
```bash
npx inngest-cli@latest dev  # Start Inngest dev server first
npm start  # Uses localhost:8288 by default
```

3. **Add to Claude Desktop** (`~/.config/claude_desktop_config.json` on macOS):

**For Inngest Cloud:**
```json
{
  "mcpServers": {
    "inngest": {
      "command": "node",
      "args": ["/absolute/path/to/inngest-mcp-server/build/index.js"],
      "env": {
        "INNGEST_SIGNING_KEY": "signkey-prod-xxxxx",
        "INNGEST_BASE_URL": "https://api.inngest.com",
        "INNGEST_ENV": "production"
      }
    }
  }
}
```

**For local development:**
```json
{
  "mcpServers": {
    "inngest": {
      "command": "node",
      "args": ["/absolute/path/to/inngest-mcp-server/build/index.js"]
    }
  }
}
```

4. **Test it works**:
   - Restart Claude Desktop
   - Ask: "Debug connection to Inngest"
   - You should see your configuration details

## Available Tools

| Tool | Purpose | What it provides |
|------|---------|------------------|
| `send_event` | Send events to trigger functions | Event ID confirmation |
| `get_event_runs` | Get runs triggered by an event | List of runs with status, duration, output |
| `get_run_details` | Get detailed run information | Run metadata, status, output (no step timeline) |
| `manage_run` | Cancel or replay specific runs | Success/failure confirmation |
| `debug_connection` | Debug API connection issues | Configuration and last error details |

## What You Can Ask Claude

### 🚀 Send Events
```
"Send a user.created event with data {userId: 123, email: 'test@example.com'}"
"Trigger a batch.process event with 100 items"
```

### 📊 Monitor Runs
```
"Get runs for event 01HXXX"
"Check the status of run 01KXXX"
"Show me the output of run 01JXXX"
```

### 🐛 Debug Issues
```
"Get details for run 01K2WHNRVEG4H92FVKVGM5VSJY"
"Debug connection to Inngest"
"What was the last API error?"
```

### ⚡ Manage Runs
```
"Cancel run 01KXXX"
"Replay run 01JXXX"
```

## Important Limitations

**Step-by-step execution details are NOT available via REST API.** The detailed timeline with individual steps that you see in the Inngest dashboard uses GraphQL and is not exposed through the public REST API.

**What you get:**
- ✅ Run status, duration, start/end times
- ✅ Function metadata (ID, version, environment)
- ✅ Event ID that triggered the run
- ✅ Final output data
- ❌ Individual step timeline
- ❌ Step-by-step execution details

For detailed execution debugging, use the Inngest dashboard at https://app.inngest.com.

## Environment Configuration

### Inngest Cloud (Recommended)
```bash
INNGEST_SIGNING_KEY="signkey-prod-xxxxx"  # Required: From Inngest dashboard → Manage → Keys
INNGEST_BASE_URL="https://api.inngest.com"  # Required: Always this for cloud
INNGEST_ENV="production"  # Optional: Environment/branch name
INNGEST_EVENT_KEY="..."  # Optional: For sending events
```

### Local Development
```bash
# Defaults work for local dev server
INNGEST_BASE_URL="http://localhost:8288"  # Default
INNGEST_SIGNING_KEY="local-dev-key"  # Default
# Start dev server: npx inngest-cli@latest dev
```

## HTTP Server Mode

For web applications or remote access:

```bash
# Start HTTP server
npm run start:http
# Server runs on http://127.0.0.1:3000/mcp
```

**Claude Desktop HTTP config:**
```json
{
  "mcpServers": {
    "inngest": {
      "type": "http", 
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

**Note**: Set environment variables before starting the HTTP server, not in Claude config.

## Development

```bash
npm run dev          # Watch mode (stdio)
npm run dev:http     # Watch mode (HTTP)
npm run test         # Run tests
npm run lint         # Check code style
npm run build        # Build for production
```

## API Compatibility

This MCP server uses Inngest's **REST API**, which provides:
- Event management
- Run listing and basic details  
- Run management (cancel/replay)
- Basic run metadata

For advanced features like step-by-step execution timeline, use the [Inngest dashboard](https://app.inngest.com) which uses GraphQL.

## Troubleshooting

**"Connection refused"**: 
- Cloud: Check your `INNGEST_SIGNING_KEY` and `INNGEST_BASE_URL`
- Local: Ensure `npx inngest-cli@latest dev` is running

**"No runs found"**: 
- Normal for new events/functions
- Local dev server may not persist run history

**"Inngest API error: 404"**: 
- Run ID doesn't exist or wrong environment
- Check your `INNGEST_ENV` setting

**Claude can't find the server**: 
- Verify absolute path in Claude config
- Restart Claude Desktop after config changes

## What's MCP?

[Model Context Protocol](https://modelcontextprotocol.io) lets AI assistants connect to external tools and data sources. This server makes your Inngest event system available to Claude and other AI assistants.