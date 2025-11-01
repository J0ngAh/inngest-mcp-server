// Inngest client with proper separation for testing

export interface InngestConfig {
  signingKey: string;
  eventKey?: string;
  baseUrl: string;
  env?: string;
}

export interface WorkflowRun {
  run_id: string;
  run_started_at: string;
  function_id: string;
  function_version: number;
  environment_id: string;
  event_id: string;
  status: 'Running' | 'Completed' | 'Failed' | 'Cancelled' | 'Paused';
  ended_at?: string;
  output?: unknown;
  steps?: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  name: string;
  status: 'Running' | 'Completed' | 'Failed' | 'Skipped';
  started_at: string;
  ended_at?: string;
  output?: unknown;
  error?: string;
  duration_ms?: number;
}

export interface ApiResponse {
  url: string;
  status: number;
  data: unknown;
  timestamp: string;
}

export interface ApiError {
  message: string;
  timestamp: string;
}

export interface Event {
  id: string;
  name: string;
  data: unknown;
  timestamp: string;
}

export interface FunctionInfo {
  id: string;
  name: string;
  slug?: string;
  triggers?: Array<{
    event?: string;
    cron?: string;
  }>;
  concurrency?: Array<{
    limit: number;
    key?: string;
    scope?: string;
  }>;
  steps?: Array<{
    id: string;
    name: string;
    retries?: number;
  }>;
}

export class InngestClient {
  private config: InngestConfig;
  private _lastResponse?: ApiResponse;
  private _lastError?: ApiError;

  constructor(config: InngestConfig) {
    this.config = config;
  }

  private async apiRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${this.config.baseUrl}${endpoint}`;

    // For local dev server, we might not need authentication
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // Add environment header for Inngest Cloud
    if (this.config.env) {
      headers['X-Inngest-Env'] = this.config.env;
    }

    // Only add auth header if we have a real signing key (not local dev)
    // For local development, no authentication is required
    if (
      this.config.signingKey &&
      this.config.signingKey !== 'local-dev-key' &&
      !this.config.baseUrl.includes('localhost') &&
      !this.config.baseUrl.includes('127.0.0.1')
    ) {
      headers.Authorization = `Bearer ${this.config.signingKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Inngest API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const responseData = await response.json();

    // Store response for debugging
    this._lastResponse = {
      url,
      status: response.status,
      data: responseData,
      timestamp: new Date().toISOString(),
    };

    return responseData;
  }

  // Get runs for a specific event
  async getEventRuns(eventId: string): Promise<WorkflowRun[]> {
    const response = (await this.apiRequest(`/v1/events/${eventId}/runs`)) as {
      data?: WorkflowRun[];
    };
    return response.data || [];
  }

  // Get function runs by function ID
  async getFunctionRuns(functionId: string, limit = 20): Promise<WorkflowRun[]> {
    try {
      const response = (await this.apiRequest(
        `/v1/functions/${functionId}/runs?limit=${limit}`
      )) as { data?: WorkflowRun[] };
      return response.data || [];
    } catch (error) {
      // Dev server doesn't support run history - return empty array
      if (this.config.baseUrl.includes('localhost') || this.config.baseUrl.includes('127.0.0.1')) {
        return [];
      }
      throw error;
    }
  }

  // Get specific run details
  async getRunDetails(runId: string): Promise<WorkflowRun> {
    // Dev server doesn't support run details
    if (this.config.baseUrl.includes('localhost') || this.config.baseUrl.includes('127.0.0.1')) {
      throw new Error(
        'Run details not available in development mode. Please use Inngest Cloud for run management features.'
      );
    }

    // Try different API endpoint patterns for Inngest Cloud
    const possibleEndpoints = [
      `/v0/runs/${runId}`,
      `/v1/runs/${runId}`,
      `/runs/${runId}`,
    ];

    let lastError: Error | null = null;

    for (const endpoint of possibleEndpoints) {
      try {
        const response = (await this.apiRequest(endpoint)) as { data?: WorkflowRun } | WorkflowRun;
        
        // Handle different response formats
        if ('data' in response && response.data) {
          return response.data;
        } else if ('run_id' in response) {
          return response as WorkflowRun;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Store error for debugging
        (this as any)._lastError = {
          message: lastError.message,
          timestamp: new Date().toISOString(),
        };
        continue; // Try next endpoint
      }
    }

    throw new Error(`Failed to get run details for ${runId}. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  // Note: Step-by-step execution details are not available via REST API
  // The Inngest dashboard uses GraphQL for timeline/step data
  // This method is kept for backward compatibility but will always return empty
  async getRunSteps(runId: string): Promise<WorkflowStep[]> {
    // Step details are only available via GraphQL (used by dashboard)
    // REST API only provides run-level information
    return [];
  }

  // Cancel specific run
  async cancelRun(runId: string): Promise<{ success: boolean }> {
    // Dev server doesn't support run cancellation
    if (this.config.baseUrl.includes('localhost') || this.config.baseUrl.includes('127.0.0.1')) {
      throw new Error(
        'Run cancellation not available in development mode. Please use Inngest Cloud for run management features.'
      );
    }

    // Try different API endpoint patterns for run cancellation
    const possibleEndpoints = [
      `/v0/runs/${runId}/cancel`,
      `/v1/runs/${runId}/cancel`,
      `/runs/${runId}/cancel`,
    ];

    let lastError: Error | null = null;

    for (const endpoint of possibleEndpoints) {
      try {
        await this.apiRequest(endpoint, {
          method: 'POST',
        });
        return { success: true };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Store error for debugging
        (this as any)._lastError = {
          message: lastError.message,
          timestamp: new Date().toISOString(),
        };
        continue; // Try next endpoint
      }
    }

    throw new Error(`Failed to cancel run ${runId}. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  // Bulk cancel runs
  async bulkCancelRuns(params: {
    functionId?: string;
    startedAfter?: string;
    startedBefore?: string;
    condition?: string;
  }) {
    try {
      const requestBody: Record<string, unknown> = {};
      
      if (params.functionId) requestBody.function_id = params.functionId;
      if (params.startedAfter) requestBody.started_after = params.startedAfter;
      if (params.startedBefore) requestBody.started_before = params.startedBefore;
      if (params.condition) requestBody.if = params.condition;
      
      const response = await this.apiRequest('/v1/cancellations', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      return response as { cancellationId: string };
    } catch (error) {
      // Dev server doesn't support bulk cancellation
      if (this.config.baseUrl.includes('localhost') || this.config.baseUrl.includes('127.0.0.1')) {
        throw new Error(
          'Bulk cancellation not available in development mode. Please use Inngest Cloud for run management features.'
        );
      }
      throw error;
    }
  }

  // Replay/restart run
  async replayRun(runId: string): Promise<{ success: boolean }> {
    // Dev server doesn't support run replay
    if (this.config.baseUrl.includes('localhost') || this.config.baseUrl.includes('127.0.0.1')) {
      throw new Error(
        'Run replay not available in development mode. Please use Inngest Cloud for run management features.'
      );
    }

    // Try different API endpoint patterns for run replay
    const possibleEndpoints = [
      `/v0/runs/${runId}/replay`,
      `/v1/runs/${runId}/replay`,
      `/runs/${runId}/replay`,
      `/v0/runs/${runId}/retry`, // Some APIs use "retry" instead of "replay"
      `/v1/runs/${runId}/retry`,
      `/runs/${runId}/retry`,
    ];

    let lastError: Error | null = null;

    for (const endpoint of possibleEndpoints) {
      try {
        await this.apiRequest(endpoint, {
          method: 'POST',
        });
        return { success: true };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Store error for debugging
        (this as any)._lastError = {
          message: lastError.message,
          timestamp: new Date().toISOString(),
        };
        continue; // Try next endpoint
      }
    }

    throw new Error(`Failed to replay run ${runId}. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  // Send an event to Inngest
  async sendEvent(eventName: string, data: unknown): Promise<{ id: string }> {
    const response = await this.apiRequest('/v1/events', {
      method: 'POST',
      body: JSON.stringify({
        name: eventName,
        data,
        timestamp: Date.now(),
      }),
    });
    return response as { id: string };
  }

  // Get the last error for debugging
  getLastError(): ApiError | undefined {
    return this._lastError;
  }

  // Get the last API response for debugging
  getLastResponse(): ApiResponse | undefined {
    return this._lastResponse;
  }

  // Get configuration (useful for testing)
  getConfig(): InngestConfig {
    return { ...this.config };
  }
}
