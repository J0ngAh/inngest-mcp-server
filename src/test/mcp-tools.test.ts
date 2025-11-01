import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InngestClient, WorkflowRun, WorkflowStep } from '../inngest-client.js';

// Mock the InngestClient
vi.mock('../inngest-client.js', () => ({
  InngestClient: vi.fn(),
}));

describe('MCP Event Tools', () => {
  let mockClient: InngestClient;

  const mockWorkflowRun: WorkflowRun = {
    run_id: 'run-123',
    run_started_at: '2024-01-01T00:00:00Z',
    function_id: 'func-123',
    function_version: 1,
    environment_id: 'env-123',
    event_id: 'event-123',
    status: 'Completed',
    ended_at: '2024-01-01T00:01:00Z',
    output: { result: 'success', processed: 100 },
  };

  const mockWorkflowSteps: WorkflowStep[] = [
    {
      id: 'step-1',
      name: 'validate-input',
      status: 'Completed',
      started_at: '2024-01-01T00:00:10Z',
      ended_at: '2024-01-01T00:00:15Z',
      duration_ms: 5000,
      output: { valid: true },
    },
    {
      id: 'step-2',
      name: 'process-data',
      status: 'Completed',
      started_at: '2024-01-01T00:00:15Z',
      ended_at: '2024-01-01T00:00:50Z',
      duration_ms: 35000,
      output: { processed: 100 },
    },
  ];

  beforeEach(() => {
    mockClient = {
      sendEvent: vi.fn(),
      getEventRuns: vi.fn(),
      getRunDetails: vi.fn(),
      getRunSteps: vi.fn(),
      cancelRun: vi.fn(),
      replayRun: vi.fn(),
      getLastError: vi.fn(),
      getLastResponse: vi.fn(),
      getConfig: vi.fn(),
    } as any;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('send_event tool', () => {
    it('should send event successfully', async () => {
      const sendEvent = async (client: InngestClient, eventName: string, data: unknown) => {
        return await client.sendEvent(eventName, data);
      };

      vi.mocked(mockClient.sendEvent).mockResolvedValue({ id: 'event-123' });

      const result = await sendEvent(mockClient, 'user.created', { userId: '123' });

      expect(result).toEqual({ id: 'event-123' });
      expect(mockClient.sendEvent).toHaveBeenCalledWith('user.created', { userId: '123' });
    });

    it('should handle send event errors', async () => {
      const sendEvent = async (client: InngestClient, eventName: string, data: unknown) => {
        return await client.sendEvent(eventName, data);
      };

      vi.mocked(mockClient.sendEvent).mockRejectedValue(new Error('API Error'));

      await expect(sendEvent(mockClient, 'test.event', {})).rejects.toThrow('API Error');
    });
  });

  describe('get_event_runs tool', () => {
    it('should get event runs successfully', async () => {
      const getEventRuns = async (client: InngestClient, eventId: string) => {
        return await client.getEventRuns(eventId);
      };

      vi.mocked(mockClient.getEventRuns).mockResolvedValue([mockWorkflowRun]);

      const result = await getEventRuns(mockClient, 'event-123');

      expect(result).toEqual([mockWorkflowRun]);
      expect(mockClient.getEventRuns).toHaveBeenCalledWith('event-123');
    });

    it('should handle empty event runs', async () => {
      const getEventRuns = async (client: InngestClient, eventId: string) => {
        return await client.getEventRuns(eventId);
      };

      vi.mocked(mockClient.getEventRuns).mockResolvedValue([]);

      const result = await getEventRuns(mockClient, 'event-456');

      expect(result).toEqual([]);
    });
  });

  describe('get_run_details tool', () => {
    it('should get run details and steps', async () => {
      const getRunDetails = async (client: InngestClient, runId: string) => {
        const [runDetails, steps] = await Promise.all([
          client.getRunDetails(runId),
          client.getRunSteps(runId),
        ]);
        return { runDetails, steps };
      };

      vi.mocked(mockClient.getRunDetails).mockResolvedValue(mockWorkflowRun);
      vi.mocked(mockClient.getRunSteps).mockResolvedValue(mockWorkflowSteps);

      const result = await getRunDetails(mockClient, 'run-123');

      expect(result.runDetails).toEqual(mockWorkflowRun);
      expect(result.steps).toEqual(mockWorkflowSteps);
      expect(mockClient.getRunDetails).toHaveBeenCalledWith('run-123');
      expect(mockClient.getRunSteps).toHaveBeenCalledWith('run-123');
    });
  });

  describe('manage_run tool', () => {
    it('should cancel run successfully', async () => {
      const cancelRun = async (client: InngestClient, runId: string) => {
        return await client.cancelRun(runId);
      };

      vi.mocked(mockClient.cancelRun).mockResolvedValue({ success: true });

      const result = await cancelRun(mockClient, 'run-123');

      expect(result).toEqual({ success: true });
      expect(mockClient.cancelRun).toHaveBeenCalledWith('run-123');
    });

    it('should replay run successfully', async () => {
      const replayRun = async (client: InngestClient, runId: string) => {
        return await client.replayRun(runId);
      };

      vi.mocked(mockClient.replayRun).mockResolvedValue({ success: true });

      const result = await replayRun(mockClient, 'run-123');

      expect(result).toEqual({ success: true });
      expect(mockClient.replayRun).toHaveBeenCalledWith('run-123');
    });
  });

  describe('debug_connection tool', () => {
    it('should return debug information', async () => {
      const getDebugInfo = async (client: InngestClient) => {
        const lastError = client.getLastError();
        const lastResponse = client.getLastResponse();
        return { lastError, lastResponse };
      };

      const mockError = { message: 'Test error', timestamp: '2024-01-01T00:00:00Z' };
      const mockResponse = {
        url: 'http://test',
        status: 200,
        data: {},
        timestamp: '2024-01-01T00:00:00Z',
      };

      vi.mocked(mockClient.getLastError).mockReturnValue(mockError);
      vi.mocked(mockClient.getLastResponse).mockReturnValue(mockResponse);

      const result = await getDebugInfo(mockClient);

      expect(result.lastError).toEqual(mockError);
      expect(result.lastResponse).toEqual(mockResponse);
    });
  });
});
