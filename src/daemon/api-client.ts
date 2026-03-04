/**
 * NeuralDiff Daemon - Cloud API Client
 * Handles communication with the NeuralDiff cloud API for deep analysis.
 * Supports bidirectional agent communication: the daemon sends analysis requests
 * and the API agent can call back into local daemon tools.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type { ToolRegistry } from './tool-registry';
import type {
  APIClientConfig,
  APIAuthResponse,
  CloudAnalysisRequest,
  CloudAnalysisResponse,
  ToolCallRequest,
  ToolCallResponse,
  SessionContext,
  Logger,
} from './types';

/** How many ms before a token is considered expired (5 minute buffer) */
const TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000;

/** Default timeout for API requests (60 seconds, analysis can be slow) */
const DEFAULT_TIMEOUT = 60_000;

/** Maximum number of retry attempts */
const DEFAULT_RETRY_ATTEMPTS = 3;

/** Base delay between retries (exponential backoff) */
const DEFAULT_RETRY_DELAY = 1000;

export class APIClient {
  private config: APIClientConfig;
  private client: AxiosInstance;
  private toolRegistry: ToolRegistry | null = null;
  private authToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private tier: string = 'free';
  private logger: Logger;

  constructor(config: APIClientConfig, logger: Logger) {
    this.config = {
      timeout: DEFAULT_TIMEOUT,
      retryAttempts: DEFAULT_RETRY_ATTEMPTS,
      retryDelay: DEFAULT_RETRY_DELAY,
      ...config,
    };
    this.logger = logger;

    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-SDK-Version': '0.1.0',
        'User-Agent': 'neuraldiff-daemon/0.1.0',
      },
    });
  }

  /**
   * Connect the tool registry so the API agent can call back into local tools.
   */
  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  /**
   * Authenticate with the cloud API using the API key.
   * Returns the auth token and account tier.
   */
  async authenticate(): Promise<APIAuthResponse> {
    this.logger.info('Authenticating with NeuralDiff cloud API');

    try {
      const response = await this.retryRequest(() =>
        this.client.post<APIAuthResponse>('/auth/token', {
          apiKey: this.config.apiKey,
        })
      );

      this.authToken = response.data.token;
      this.tokenExpiresAt = response.data.expiresAt;
      this.tier = response.data.tier;

      // Set the token for future requests
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.authToken}`;

      this.logger.info(`Authenticated successfully (tier: ${this.tier})`);
      return response.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Authentication failed: ${message}`);
      throw new Error(`NeuralDiff API authentication failed: ${message}`);
    }
  }

  /**
   * Ensure we have a valid auth token, refreshing if necessary.
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.authToken || Date.now() >= this.tokenExpiresAt - TOKEN_EXPIRY_BUFFER) {
      await this.authenticate();
    }
  }

  /**
   * Send a comparison for deep analysis by the cloud AI.
   */
  async analyzeComparison(request: CloudAnalysisRequest): Promise<CloudAnalysisResponse> {
    await this.ensureAuthenticated();

    this.logger.info('Sending comparison to cloud for analysis');

    try {
      const response = await this.retryRequest(() =>
        this.client.post<CloudAnalysisResponse>('/analysis/compare', request)
      );

      const result = response.data;

      // Check if the cloud API wants to call back into local tools
      if (result.status === 'pending') {
        return await this.pollAnalysisResult(result.requestId);
      }

      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Cloud analysis failed: ${message}`);
      throw new Error(`Cloud analysis failed: ${message}`);
    }
  }

  /**
   * Send session context to the cloud API (forwarded from MCP).
   */
  async sendContext(context: SessionContext): Promise<void> {
    await this.ensureAuthenticated();

    try {
      await this.retryRequest(() =>
        this.client.post('/context/session', context)
      );
      this.logger.info(`Session context sent: ${context.sessionId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to send session context: ${message}`);
    }
  }

  /**
   * Register available local tools with the cloud API so the agent knows
   * what it can call back into.
   */
  async registerTools(): Promise<void> {
    if (!this.toolRegistry) {
      this.logger.warn('No tool registry connected, skipping tool registration');
      return;
    }

    await this.ensureAuthenticated();

    const tools = this.toolRegistry.listTools();

    try {
      await this.retryRequest(() =>
        this.client.post('/agent/tools/register', { tools })
      );
      this.logger.info(`Registered ${tools.length} local tools with cloud API`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to register tools: ${message}`);
    }
  }

  /**
   * Handle an incoming tool call from the API agent.
   * The cloud API agent sends a tool call request, we execute it locally
   * and return the result.
   */
  async handleToolCall(request: ToolCallRequest): Promise<ToolCallResponse> {
    if (!this.toolRegistry) {
      return {
        requestId: request.requestId,
        toolName: request.toolName,
        result: { success: false, error: 'No tool registry available' },
        duration: 0,
      };
    }

    this.logger.info(`Handling tool call from API agent: ${request.toolName}`);
    return await this.toolRegistry.executeTool(request);
  }

  /**
   * Send a message to the API agent (for AI-assisted analysis at paid tier).
   */
  async sendAgentMessage(message: string, context?: Record<string, unknown>): Promise<{
    response: string;
    toolCalls?: ToolCallRequest[];
  }> {
    await this.ensureAuthenticated();

    try {
      const response = await this.retryRequest(() =>
        this.client.post('/agent/message', { message, context })
      );

      const result = response.data as {
        response: string;
        toolCalls?: ToolCallRequest[];
      };

      // If the agent wants to call local tools, execute them
      if (result.toolCalls && result.toolCalls.length > 0) {
        for (const toolCall of result.toolCalls) {
          const toolResult = await this.handleToolCall(toolCall);
          // Send the tool results back to the agent
          await this.retryRequest(() =>
            this.client.post('/agent/tool-result', toolResult)
          );
        }
      }

      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Agent message failed: ${message}`);
      throw new Error(`Agent communication failed: ${message}`);
    }
  }

  /**
   * Check if the cloud API is reachable and the key is valid.
   */
  async healthCheck(): Promise<{ status: string; tier: string; latency: number }> {
    const start = Date.now();

    try {
      const response = await this.client.get('/health');
      return {
        status: response.data.status || 'ok',
        tier: this.tier,
        latency: Date.now() - start,
      };
    } catch {
      return {
        status: 'unreachable',
        tier: this.tier,
        latency: Date.now() - start,
      };
    }
  }

  /**
   * Get the current account tier.
   */
  getTier(): string {
    return this.tier;
  }

  /**
   * Check if the API client is configured (has an API key).
   */
  isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Poll for an analysis result that is still pending.
   */
  private async pollAnalysisResult(
    requestId: string,
    maxAttempts: number = 30,
    intervalMs: number = 2000
  ): Promise<CloudAnalysisResponse> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.sleep(intervalMs);

      try {
        const response = await this.client.get<CloudAnalysisResponse>(
          `/analysis/result/${requestId}`
        );

        if (response.data.status !== 'pending') {
          return response.data;
        }

        // Check for incoming tool calls while polling
        const toolCallResponse = await this.client.get<{ toolCalls?: ToolCallRequest[] }>(
          `/agent/pending-tool-calls/${requestId}`
        );

        if (toolCallResponse.data.toolCalls) {
          for (const toolCall of toolCallResponse.data.toolCalls) {
            const result = await this.handleToolCall(toolCall);
            await this.client.post('/agent/tool-result', result);
          }
        }
      } catch {
        // Continue polling on transient errors
        this.logger.warn(`Poll attempt ${attempt + 1} failed, retrying...`);
      }
    }

    return {
      requestId,
      status: 'failed',
      error: 'Analysis timed out after polling',
    };
  }

  /**
   * Retry a request with exponential backoff.
   */
  private async retryRequest<T>(
    fn: () => Promise<T>,
    attempts?: number
  ): Promise<T> {
    const maxAttempts = attempts ?? this.config.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS;
    const baseDelay = this.config.retryDelay ?? DEFAULT_RETRY_DELAY;
    let lastError: unknown;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err;

        // Don't retry on 4xx client errors (except 429)
        if (err instanceof AxiosError && err.response) {
          const status = err.response.status;
          if (status >= 400 && status < 500 && status !== 429) {
            throw err;
          }
        }

        if (i < maxAttempts - 1) {
          const delay = baseDelay * Math.pow(2, i);
          this.logger.warn(`Request failed (attempt ${i + 1}/${maxAttempts}), retrying in ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
