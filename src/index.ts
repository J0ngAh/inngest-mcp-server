import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { InngestClient, type InngestConfig } from './inngest-client.js';

// Create MCP Server
const server = new McpServer({
  name: 'inngest-event-manager',
  version: '1.0.0',
});

// Initialize Inngest client with local dev server defaults
const inngestConfig: InngestConfig = {
  signingKey: process.env.INNGEST_SIGNING_KEY || 'local-dev-key',
  eventKey: process.env.INNGEST_EVENT_KEY,
  baseUrl: process.env.INNGEST_BASE_URL || 'http://localhost:8288',
  env: process.env.INNGEST_ENV,
};

const inngestClient = new InngestClient(inngestConfig);

// Define input schemas
const eventRunsSchema = {
  eventId: z.string().describe('ID of the event to check runs for'),
  limit: z.number().optional().default(10).describe('Number of recent runs to check'),
};

const sendEventSchema = {
  eventName: z.string().describe('Name of the event to send'),
  data: z.record(z.unknown()).describe('Event data payload'),
};

const runHistorySchema = {
  runId: z.string().describe('Specific run ID to get history for'),
};

const runActionSchema = {
  runId: z.string().describe('Specific run ID to act on'),
  action: z.enum(['cancel', 'replay']).describe('Action to perform'),
};

// Register tools
server.registerTool(
  'send_event',
  {
    description: 'Send an event to Inngest to trigger functions',
    inputSchema: sendEventSchema,
  },
  async ({ eventName, data }) => {
    try {
      const result = await inngestClient.sendEvent(eventName, data);

      return {
        content: [
          {
            type: 'text',
            text: `**Event sent successfully**

**Event Name:** ${eventName}
**Event ID:** ${result.id}
**Data:** \`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

The event has been sent to Inngest and will trigger any functions listening for this event.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `**Error sending event:** ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

server.registerTool(
  'get_event_runs',
  {
    description: 'Get runs for a specific event ID',
    inputSchema: eventRunsSchema,
  },
  async ({ eventId, limit }) => {
    try {
      const runs = await inngestClient.getEventRuns(eventId);

      if (runs.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No runs found for event ID: ${eventId}`,
            },
          ],
        };
      }

      let summary = `# Event Runs: ${eventId}\n\n`;
      summary += `**Total runs:** ${runs.length}\n\n`;

      runs.slice(0, limit).forEach((run, index) => {
        summary += `## Run ${index + 1}\n`;
        summary += `**Run ID:** ${run.run_id}\n`;
        summary += `**Status:** ${run.status}\n`;
        summary += `**Started:** ${new Date(run.run_started_at).toLocaleString()}\n`;

        if (run.ended_at) {
          summary += `**Ended:** ${new Date(run.ended_at).toLocaleString()}\n`;
          const duration = Math.round(
            (new Date(run.ended_at).getTime() - new Date(run.run_started_at).getTime()) / 1000
          );
          summary += `**Duration:** ${duration}s\n`;
        }

        if (run.output) {
          summary += `**Output:** \`\`\`json\n${JSON.stringify(run.output, null, 2)}\n\`\`\`\n`;
        }

        summary += '\n';
      });

      return {
        content: [
          {
            type: 'text',
            text: summary,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting event runs: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

server.registerTool(
  'get_run_details',
  {
    description: 'Get run details including status, duration, and output (note: step-by-step timeline not available via REST API)',
    inputSchema: runHistorySchema,
  },
  async ({ runId }) => {
    try {
      const runDetails = await inngestClient.getRunDetails(runId);

      let output = `# Run Details: ${runId}\n\n`;
      
      // Display all available run information
      output += `**Run ID:** ${runDetails.run_id}\n`;
      output += `**Function ID:** ${runDetails.function_id}\n`;
      output += `**Function Version:** ${runDetails.function_version}\n`;
      output += `**Environment ID:** ${runDetails.environment_id}\n`;
      output += `**Event ID:** ${runDetails.event_id}\n`;
      output += `**Status:** ${runDetails.status}\n`;
      output += `**Started:** ${new Date(runDetails.run_started_at).toLocaleString()}\n`;

      if (runDetails.ended_at) {
        output += `**Ended:** ${new Date(runDetails.ended_at).toLocaleString()}\n`;
        const totalDuration = Math.round(
          (new Date(runDetails.ended_at).getTime() -
            new Date(runDetails.run_started_at).getTime()) /
            1000
        );
        output += `**Duration:** ${totalDuration}s\n`;
      }

      if (runDetails.output) {
        output += `\n**Output:**\n\`\`\`json\n${JSON.stringify(runDetails.output, null, 2)}\n\`\`\`\n`;
      }

      // Check if steps are included in the run details response (some APIs include basic step info)
      if (runDetails.steps && runDetails.steps.length > 0) {
        output += `\n## Steps (${runDetails.steps.length} found in run response)\n\n`;
        runDetails.steps.forEach((step, index) => {
          output += `**${index + 1}. ${step.name}** (${step.status})\n`;
          if (step.duration_ms) {
            output += `   - Duration: ${step.duration_ms}ms\n`;
          }
          if (step.error) {
            output += `   - Error: ${step.error}\n`;
          }
          output += '\n';
        });
      } else {
        output += `\n> **Note:** Step-by-step execution timeline is only available in the Inngest dashboard (uses GraphQL). The REST API provides run-level details only.`;
      }

      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting run details: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }
);

server.registerTool(
  'manage_run',
  {
    description: 'Cancel or replay specific Inngest runs',
    inputSchema: runActionSchema,
  },
  async ({ runId, action }) => {
    try {
      let result: string;

      switch (action) {
        case 'cancel':
          await inngestClient.cancelRun(runId);
          result = `Cancelled run ${runId}`;
          break;

        case 'replay':
          await inngestClient.replayRun(runId);
          result = `Replayed run ${runId}`;
          break;

        default:
          result = `Unknown action: ${action}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error managing run: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

server.registerTool(
  'debug_connection',
  {
    description: 'Debug Inngest API connection and configuration',
    inputSchema: {},
  },
  async () => {
    const lastError = inngestClient.getLastError();
    const lastResponse = inngestClient.getLastResponse();
    return {
      content: [
        {
          type: 'text',
          text: `**Inngest Configuration:**
- Base URL: ${inngestConfig.baseUrl}
- Has Signing Key: ${!!inngestConfig.signingKey}
- Environment: ${inngestConfig.env || 'not set'}

**Last API Response:** ${lastResponse ? JSON.stringify(lastResponse, null, 2) : 'None'}

**Last Error:** ${lastError ? JSON.stringify(lastError, null, 2) : 'None'}`,
        },
      ],
    };
  }
);

// Register resources for event management
server.registerResource(
  'event-dashboard',
  'inngest://dashboard',
  {
    description: 'Live dashboard view of event management capabilities',
    mimeType: 'text/markdown',
  },
  async () => {
    try {
      const content = `# Inngest Event Manager

## Available Tools
- **send_event**: Send events to trigger Inngest functions
- **get_event_runs**: Get runs for a specific event ID
- **get_run_details**: Get detailed execution history for a run
- **manage_run**: Cancel or replay specific runs
- **debug_connection**: Debug API connection issues

## Configuration
- Base URL: ${inngestConfig.baseUrl}
- Signing Key: ${inngestConfig.signingKey ? 'Configured' : 'Missing'}
- Event Key: ${inngestConfig.eventKey ? 'Configured' : 'Optional'}
- Environment: ${inngestConfig.env || 'Default'}

## Supported Operations
- 📤 Send events to trigger functions
- 📊 Monitor event runs and execution status
- 🔍 Debug run execution with step-by-step details
- ⚡ Replay or cancel individual runs
- 🔧 Troubleshoot API connection issues
`;

      return {
        contents: [
          {
            uri: 'inngest://dashboard',
            text: content,
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: 'inngest://dashboard',
            text: `Error loading dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }
);

// Start the server
async function main() {
  // Remove all console.log statements to prevent stdout pollution
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Handle process signals
process.on('SIGINT', async () => {
  process.exit(0);
});

process.on('SIGTERM', async () => {
  process.exit(0);
});

main().catch((error) => {
  // Only exit on error, no logging
  process.exit(1);
});
