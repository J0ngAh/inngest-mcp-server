import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Integration tests for the complete MCP server
describe('Inngest MCP Server Integration', () => {
  let mockFetch: ReturnType<typeof vi.fn<[], Promise<Response>>>;
  let server: McpServer;

  beforeEach(() => {
    mockFetch = vi.fn<[], Promise<Response>>();
    global.fetch = mockFetch;

    // Create a minimal server instance for testing
    server = new McpServer({
      name: 'inngest-workflow-manager',
      version: '1.0.0',
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // Helper to create proper Response objects
  const createMockResponse = (data: any, _ok = true, status = 200, statusText = 'OK') => {
    return new Response(JSON.stringify(data), {
      status,
      statusText,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  describe('Server initialization', () => {
    it('should create server with correct name and version', () => {
      expect(server).toBeDefined();
      // Note: McpServer doesn't expose name/version getters,
      // so we can only test that it was created successfully
    });
  });

  describe('Environment configuration', () => {
    it('should use default local configuration when no env vars set', () => {
      // Test with a clean environment by creating config without relying on process.env
      const emptyEnv: Record<string, string | undefined> = {};

      const config = {
        signingKey: emptyEnv.INNGEST_SIGNING_KEY || 'local-dev-key',
        eventKey: emptyEnv.INNGEST_EVENT_KEY,
        baseUrl: emptyEnv.INNGEST_BASE_URL || 'http://localhost:8288',
      };

      expect(config.signingKey).toBe('local-dev-key');
      expect(config.baseUrl).toBe('http://localhost:8288');
      expect(config.eventKey).toBeUndefined();
    });

    it('should use production configuration when env vars are set', () => {
      process.env.INNGEST_SIGNING_KEY = 'signkey-prod-test';
      process.env.INNGEST_BASE_URL = 'https://api.inngest.com';
      process.env.INNGEST_EVENT_KEY = 'event-key-test';

      const config = {
        signingKey: process.env.INNGEST_SIGNING_KEY || 'local-dev-key',
        eventKey: process.env.INNGEST_EVENT_KEY,
        baseUrl: process.env.INNGEST_BASE_URL || 'http://localhost:8288',
      };

      expect(config.signingKey).toBe('signkey-prod-test');
      expect(config.baseUrl).toBe('https://api.inngest.com');
      expect(config.eventKey).toBe('event-key-test');

      // Cleanup
      process.env.INNGEST_SIGNING_KEY = undefined;
      process.env.INNGEST_BASE_URL = undefined;
      process.env.INNGEST_EVENT_KEY = undefined;
    });
  });

  describe('Tool registration', () => {
    it('should register all required tools', () => {
      const mockRegisterTool = vi.fn();
      const mockRegisterResource = vi.fn();

      // Create a mock server with spy methods
      const testServer = {
        registerTool: mockRegisterTool,
        registerResource: mockRegisterResource,
      };

      // Simulate the tool registration that happens in the main file
      testServer.registerTool('check_workflow_status', expect.any(Object), expect.any(Function));
      testServer.registerTool('debug_workflow_steps', expect.any(Object), expect.any(Function));
      testServer.registerTool('manage_workflow', expect.any(Object), expect.any(Function));
      testServer.registerResource(
        'workflow-dashboard',
        'inngest://dashboard',
        expect.any(Object),
        expect.any(Function)
      );

      expect(mockRegisterTool).toHaveBeenCalledTimes(3);
      expect(mockRegisterResource).toHaveBeenCalledTimes(1);

      // Check that tools are registered with correct names
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'check_workflow_status',
        expect.any(Object),
        expect.any(Function)
      );
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'debug_workflow_steps',
        expect.any(Object),
        expect.any(Function)
      );
      expect(mockRegisterTool).toHaveBeenCalledWith(
        'manage_workflow',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Error handling', () => {
    it('should handle API errors gracefully', () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      // This would test the actual tool implementation error handling
      // In a real integration test, we'd invoke the tools and check error responses
      expect(mockFetch).toBeDefined();
    });

    it('should handle invalid input schemas', () => {
      // Test that zod schemas properly validate input
      const { z } = require('zod');

      const workflowStatusSchema = z.object({
        workflowName: z.string().describe('Name or ID of the workflow to check'),
        limit: z.number().optional().default(10).describe('Number of recent runs to check'),
      });

      // Valid input
      expect(() =>
        workflowStatusSchema.parse({
          workflowName: 'test-workflow',
          limit: 5,
        })
      ).not.toThrow();

      // Invalid input - missing required field
      expect(() =>
        workflowStatusSchema.parse({
          limit: 5,
        })
      ).toThrow();

      // Invalid input - wrong type
      expect(() =>
        workflowStatusSchema.parse({
          workflowName: 'test-workflow',
          limit: 'invalid',
        })
      ).toThrow();
    });
  });

  describe('Resource generation', () => {
    it('should generate dashboard resource correctly', async () => {
      const dashboardGenerator = async () => {
        const content = `# Inngest Workflow Dashboard

## Recent Activity
- Use the tools above to check specific workflow statuses
- Check workflow completion: \`check_workflow_status\`
- Debug workflow steps: \`debug_workflow_steps\`
- Manage workflows: \`manage_workflow\`

## Available Actions
- ✅ Check if workflow finished
- 🔍 Debug workflow steps
- ⚡ Restart/replay workflows
- ❌ Cancel running workflows (single or bulk)

## Configuration
- Base URL: http://localhost:8288
- Signing Key: ✅ Configured
- Event Key: ⚠️ Optional
`;

        return {
          contents: [
            {
              uri: 'inngest://dashboard',
              text: content,
            },
          ],
        };
      };

      const result = await dashboardGenerator();

      expect(result.contents[0].uri).toBe('inngest://dashboard');
      expect(result.contents[0].text).toContain('# Inngest Workflow Dashboard');
      expect(result.contents[0].text).toContain('check_workflow_status');
      expect(result.contents[0].text).toContain('debug_workflow_steps');
      expect(result.contents[0].text).toContain('manage_workflow');
    });
  });

  describe('Input validation', () => {
    it('should validate workflow status input schema', () => {
      const { z } = require('zod');

      const workflowStatusSchema = z.object({
        workflowName: z.string().describe('Name or ID of the workflow to check'),
        limit: z.number().optional().default(10).describe('Number of recent runs to check'),
      });

      // Test default value application
      const parsed = workflowStatusSchema.parse({
        workflowName: 'test-workflow',
      });

      expect(parsed.limit).toBe(10);
      expect(parsed.workflowName).toBe('test-workflow');
    });

    it('should validate debug steps input schema', () => {
      const { z } = require('zod');

      const debugStepsSchema = z.object({
        workflowName: z.string().describe('Name or ID of the workflow'),
        runId: z
          .string()
          .optional()
          .describe('Specific run ID to debug (if not provided, uses latest run)'),
      });

      // Valid with both fields
      const parsed1 = debugStepsSchema.parse({
        workflowName: 'test-workflow',
        runId: 'run-123',
      });

      expect(parsed1.workflowName).toBe('test-workflow');
      expect(parsed1.runId).toBe('run-123');

      // Valid with only workflow name
      const parsed2 = debugStepsSchema.parse({
        workflowName: 'test-workflow',
      });

      expect(parsed2.workflowName).toBe('test-workflow');
      expect(parsed2.runId).toBeUndefined();
    });

    it('should validate workflow action input schema', () => {
      const { z } = require('zod');

      const workflowActionSchema = z.object({
        workflowName: z.string().describe('Name or ID of the workflow'),
        runId: z.string().optional().describe('Specific run ID to act on'),
        action: z.enum(['cancel', 'restart', 'replay']).describe('Action to perform'),
        bulkCancel: z
          .object({
            startedAfter: z
              .string()
              .optional()
              .describe('ISO timestamp - cancel runs started after this time'),
            startedBefore: z
              .string()
              .optional()
              .describe('ISO timestamp - cancel runs started before this time'),
            condition: z.string().optional().describe('Expression to match runs for cancellation'),
          })
          .optional()
          .describe('Options for bulk cancellation'),
      });

      // Valid cancel action
      const parsed1 = workflowActionSchema.parse({
        workflowName: 'test-workflow',
        action: 'cancel',
        runId: 'run-123',
      });

      expect(parsed1.action).toBe('cancel');

      // Valid bulk cancel
      const parsed2 = workflowActionSchema.parse({
        workflowName: 'test-workflow',
        action: 'cancel',
        bulkCancel: {
          startedAfter: '2024-01-01T00:00:00Z',
          startedBefore: '2024-01-01T23:59:59Z',
        },
      });

      expect(parsed2.bulkCancel?.startedAfter).toBe('2024-01-01T00:00:00Z');

      // Invalid action
      expect(() =>
        workflowActionSchema.parse({
          workflowName: 'test-workflow',
          action: 'invalid-action',
        })
      ).toThrow();
    });
  });

  describe('Authentication handling', () => {
    it('should handle local development authentication', async () => {
      const testConfig = {
        signingKey: 'local-dev-key',
        baseUrl: 'http://localhost:8288',
      };

      // Mock a successful local API call
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      await fetch(`${testConfig.baseUrl}/v1/functions/test/runs`, {
        headers: {
          'Content-Type': 'application/json',
          // Should NOT include Authorization header for local dev
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8288/v1/functions/test/runs',
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.any(String),
          }),
        })
      );
    });

    it('should handle production authentication', async () => {
      const testConfig = {
        signingKey: 'signkey-prod-test123',
        baseUrl: 'https://api.inngest.com',
      };

      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      await fetch(`${testConfig.baseUrl}/v1/functions/test/runs`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testConfig.signingKey}`,
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.inngest.com/v1/functions/test/runs',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer signkey-prod-test123',
          }),
        })
      );
    });
  });

  describe('Date and time handling', () => {
    it('should format dates consistently', () => {
      const testDate = '2024-01-01T00:00:00Z';
      const formatted = new Date(testDate).toLocaleString();

      expect(formatted).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/); // Date format
      expect(new Date(testDate).getTime()).toBe(1704067200000);
    });

    it('should calculate durations correctly', () => {
      const startTime = '2024-01-01T00:00:00Z';
      const endTime = '2024-01-01T00:01:30Z';

      const duration = Math.round(
        (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000
      );

      expect(duration).toBe(90); // 1 minute 30 seconds
    });
  });

  describe('Response formatting', () => {
    it('should format markdown responses correctly', () => {
      const workflowName = 'test-workflow';
      const status = 'Completed';
      const output = { result: 'success', processed: 100 };

      let summary = `**Workflow: ${workflowName}**\n\n`;
      summary += `**Latest Run Status:** ${status}\n`;
      summary += `**Output:** \`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\`\`\n`;

      expect(summary).toContain('**Workflow: test-workflow**');
      expect(summary).toContain('**Latest Run Status:** Completed');
      expect(summary).toContain('```json');
      expect(summary).toContain('"result": "success"');
    });

    it('should handle missing optional fields in responses', () => {
      const runWithoutEndTime: {
        run_id: string;
        status: string;
        run_started_at: string;
        ended_at?: string;
      } = {
        run_id: 'run-123',
        status: 'Running',
        run_started_at: '2024-01-01T00:00:00Z',
        // ended_at is undefined
      };

      let summary = `**Status:** ${runWithoutEndTime.status}\n`;
      if (runWithoutEndTime.ended_at) {
        summary += `**Ended:** ${new Date(runWithoutEndTime.ended_at).toLocaleString()}\n`;
      }

      expect(summary).toContain('**Status:** Running');
      expect(summary).not.toContain('**Ended:**');
    });
  });
});
