import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InngestClient,
  type InngestConfig,
  type WorkflowRun,
  type WorkflowStep,
} from '../inngest-client.js';

describe('InngestClient', () => {
  let client: InngestClient;
  let mockFetch: ReturnType<typeof vi.fn<[], Promise<Response>>>;

  const mockConfig: InngestConfig = {
    signingKey: 'test-key',
    baseUrl: 'https://api.inngest.com', // Use cloud URL for testing
  };

  const mockWorkflowRun: WorkflowRun = {
    run_id: 'run-123',
    run_started_at: '2024-01-01T00:00:00Z',
    function_id: 'func-123',
    function_version: 1,
    environment_id: 'env-123',
    event_id: 'event-123',
    status: 'Completed',
    ended_at: '2024-01-01T00:01:00Z',
    output: { result: 'success' },
  };

  const mockWorkflowStep: WorkflowStep = {
    id: 'step-1',
    name: 'process-data',
    status: 'Completed',
    started_at: '2024-01-01T00:00:10Z',
    ended_at: '2024-01-01T00:00:50Z',
    duration_ms: 40000,
    output: { processed: 100 },
  };

  beforeEach(() => {
    client = new InngestClient(mockConfig);
    mockFetch = vi.fn<[], Promise<Response>>();
    global.fetch = mockFetch;
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

  describe('constructor', () => {
    it('should create client with provided config', () => {
      const config = client.getConfig();
      expect(config).toEqual(mockConfig);
    });
  });

  describe('API authentication', () => {
    it('should include Authorization header for production keys', async () => {
      const prodClient = new InngestClient({
        signingKey: 'signkey-prod-abc123',
        baseUrl: 'https://api.inngest.com',
      });

      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      await prodClient.getEventRuns('event-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.inngest.com/v1/events/event-123/runs',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer signkey-prod-abc123',
          }),
        })
      );
    });

    it('should not include Authorization header for local dev key', async () => {
      // Create a client with localhost URL to test local dev behavior
      const localClient = new InngestClient({
        signingKey: 'local-dev-key',
        baseUrl: 'http://localhost:8288',
      });
      
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [] }));

      await localClient.getEventRuns('event-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8288/v1/events/event-123/runs',
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.anything(),
          }),
        })
      );
    });
  });

  describe('getEventRuns', () => {
    it('should fetch event runs successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [mockWorkflowRun] }));

      const result = await client.getEventRuns('event-123');

      expect(result).toEqual([mockWorkflowRun]);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.inngest.com/v1/events/event-123/runs',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 404, 'Not Found'));

      await expect(client.getEventRuns('event-123')).rejects.toThrow(
        'Inngest API error: 404 Not Found'
      );
    });
  });

  describe('getFunctionRuns', () => {
    it('should fetch function runs successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [mockWorkflowRun] }));

      const result = await client.getFunctionRuns('func-123', 10);

      expect(result).toEqual([mockWorkflowRun]);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.inngest.com/v1/functions/func-123/runs?limit=10',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });

    it('should use default limit when not provided', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: [mockWorkflowRun] }));

      await client.getFunctionRuns('func-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.inngest.com/v1/functions/func-123/runs?limit=20',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });
  });

  describe('getRunDetails', () => {
    it('should fetch run details successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: mockWorkflowRun }));

      const result = await client.getRunDetails('run-123');

      expect(result).toEqual(mockWorkflowRun);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.inngest.com/v0/runs/run-123',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });
  });

  describe('getRunSteps', () => {
    it('should return empty array as step details are not available via REST API', async () => {
      const result = await client.getRunSteps('run-123');

      expect(result).toEqual([]);
      // No fetch should be called since we immediately return empty array
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('cancelRun', () => {
    it('should cancel run successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      const result = await client.cancelRun('run-123');

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.inngest.com/v0/runs/run-123/cancel',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });
  });

  describe('replayRun', () => {
    it('should replay run successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      const result = await client.replayRun('run-123');

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.inngest.com/v0/runs/run-123/replay',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });
  });

  describe('bulkCancelRuns', () => {
    it('should handle API errors during bulk cancel', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 400, 'Bad Request'));
      
      await expect(
        client.bulkCancelRuns({
          functionId: 'func-123',
          startedAfter: '2024-01-01T00:00:00Z',
        })
      ).rejects.toThrow('Inngest API error: 400 Bad Request');
    });

    it('should perform bulk cancellation successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ cancellationId: 'cancel-123' }));

      const result = await client.bulkCancelRuns({
        functionId: 'func-123',
        startedAfter: '2024-01-01T00:00:00Z',
        startedBefore: '2024-01-01T12:00:00Z',
        condition: 'status == "Running"',
      });

      expect(result).toEqual({ cancellationId: 'cancel-123' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.inngest.com/v1/cancellations',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
          body: JSON.stringify({
            function_id: 'func-123',
            started_after: '2024-01-01T00:00:00Z',
            started_before: '2024-01-01T12:00:00Z',
            if: 'status == "Running"',
          }),
        })
      );
    });

    it('should handle optional parameters correctly', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ cancellationId: 'cancel-456' }));

      await client.bulkCancelRuns({
        functionId: 'func-123',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.inngest.com/v1/cancellations',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
          body: JSON.stringify({
            function_id: 'func-123',
          }),
        })
      );
    });
  });

  describe('sendEvent', () => {
    it('should send event successfully', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          id: 'event-123',
        })
      );

      const result = await client.sendEvent('test.event', { message: 'hello' });

      expect(result).toEqual({ id: 'event-123' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.inngest.com/v1/events',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
          body: expect.stringContaining('"name":"test.event"'),
        })
      );
    });

    it('should handle event send errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 400));

      await expect(client.sendEvent('test.event', {})).rejects.toThrow('Inngest API error: 400');
    });
  });
});
