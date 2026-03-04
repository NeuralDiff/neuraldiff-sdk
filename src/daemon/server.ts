/**
 * NeuralDiff Daemon - HTTP Server
 * Express-like HTTP server built on Node's built-in http module.
 * Serves API endpoints that the MCP server and SDK clients call.
 * Includes WebSocket support for real-time watch notifications.
 */

import * as http from 'http';
import * as url from 'url';
import { EventEmitter } from 'events';
import WebSocket, { WebSocketServer } from 'ws';

import { ScreenshotManager } from './screenshot-manager';
import { AnalysisEngine } from './analysis';
import { APIClient } from './api-client';
import { ToolRegistry } from './tool-registry';
import type {
  DaemonConfig,
  DaemonRequest,
  DaemonStatus,
  SessionContext,
  WatchSession,
  WatchChangeEvent,
  Logger,
} from './types';
import { DEFAULT_DAEMON_CONFIG } from './types';

const SDK_VERSION = '0.1.0';

// ── Simple Router ────────────────────────────────────────────────────────────

type RouteHandler = (req: DaemonRequest) => Promise<{ status: number; body: unknown }>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

/**
 * Minimal router that supports parameterized paths (e.g. /api/screenshots/:id).
 */
class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    const patternStr = path.replace(/:([^/]+)/g, (_match, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });
    this.routes.push({
      method: method.toUpperCase(),
      pattern: new RegExp(`^${patternStr}$`),
      paramNames,
      handler,
    });
  }

  get(path: string, handler: RouteHandler): void {
    this.add('GET', path, handler);
  }

  post(path: string, handler: RouteHandler): void {
    this.add('POST', path, handler);
  }

  delete(path: string, handler: RouteHandler): void {
    this.add('DELETE', path, handler);
  }

  match(
    method: string,
    pathname: string
  ): { handler: RouteHandler; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;

      const match = pathname.match(route.pattern);
      if (match) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, index) => {
          params[name] = match[index + 1]!;
        });
        return { handler: route.handler, params };
      }
    }
    return null;
  }
}

// ── Daemon Server ────────────────────────────────────────────────────────────

export class DaemonServer extends EventEmitter {
  private config: DaemonConfig;
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private router: Router;
  private startTime: number = 0;

  // Core components
  private screenshotManager: ScreenshotManager;
  private analysisEngine: AnalysisEngine;
  private apiClient: APIClient | null;
  private toolRegistry: ToolRegistry;
  private logger: Logger;

  // Watch sessions
  private watchSessions: Map<string, WatchSession> = new Map();
  private watchIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private wsClients: Set<WebSocket> = new Set();

  // Session context from MCP
  private sessionContext: SessionContext | null = null;

  constructor(config: Partial<DaemonConfig> = {}) {
    super();

    this.config = { ...DEFAULT_DAEMON_CONFIG, ...config };

    // Create logger
    this.logger = this.createLogger(this.config.logLevel);

    // Initialize core components
    this.screenshotManager = new ScreenshotManager(this.config, this.logger);

    // API client is optional (only needed if apiKey is provided)
    if (this.config.apiKey) {
      this.apiClient = new APIClient(
        {
          apiUrl: this.config.apiUrl,
          apiKey: this.config.apiKey,
        },
        this.logger
      );
    } else {
      this.apiClient = null;
    }

    // Tool registry
    this.toolRegistry = new ToolRegistry(this.screenshotManager, this.logger);

    // Wire up the tool registry to the API client for bidirectional calls
    if (this.apiClient) {
      this.apiClient.setToolRegistry(this.toolRegistry);
    }

    // Analysis engine
    this.analysisEngine = new AnalysisEngine(
      this.screenshotManager,
      this.apiClient,
      this.logger
    );

    // Set up routes
    this.router = new Router();
    this.registerRoutes();
  }

  /**
   * Start the HTTP server and WebSocket server.
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      // Set up WebSocket server if enabled
      if (this.config.enableWebSocket) {
        this.wss = new WebSocketServer({ server: this.server });
        this.setupWebSocket();
      }

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          this.logger.error(`Port ${this.config.port} is already in use`);
          reject(new Error(`Port ${this.config.port} is already in use`));
        } else {
          reject(err);
        }
      });

      this.server.listen(this.config.port, this.config.host, () => {
        this.startTime = Date.now();
        this.logger.info(
          `NeuralDiff daemon running at http://${this.config.host}:${this.config.port}`
        );

        // Register tools with cloud API if configured
        if (this.apiClient) {
          this.apiClient.registerTools().catch((err) => {
            this.logger.warn(`Could not register tools with cloud API: ${err}`);
          });
        }

        this.emit('started', { port: this.config.port, host: this.config.host });
        resolve();
      });
    });
  }

  /**
   * Stop the daemon server gracefully.
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping NeuralDiff daemon...');

    // Stop all watch sessions
    for (const [id] of this.watchSessions) {
      this.stopWatch(id);
    }

    // Close WebSocket connections
    for (const client of this.wsClients) {
      try {
        client.close(1000, 'Daemon shutting down');
      } catch { /* ignore */ }
    }
    this.wsClients.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Close HTTP server
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('Daemon stopped');
          this.server = null;
          this.emit('stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the current daemon status.
   */
  getStatus(): DaemonStatus {
    const counts = this.screenshotManager.getCounts();
    return {
      running: this.server !== null,
      port: this.config.port,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
      version: SDK_VERSION,
      screenshotCount: counts.screenshots,
      baselineCount: counts.baselines,
      activeWatchers: this.watchSessions.size,
    };
  }

  /**
   * Access internal components (for testing or advanced usage).
   */
  getScreenshotManager(): ScreenshotManager {
    return this.screenshotManager;
  }

  getAnalysisEngine(): AnalysisEngine {
    return this.analysisEngine;
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  getAPIClient(): APIClient | null {
    return this.apiClient;
  }

  // ── HTTP Request Handling ──────────────────────────────────────────────────

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // Parse URL
    const parsedUrl = url.parse(req.url || '/', true);
    const pathname = parsedUrl.pathname || '/';
    const method = req.method || 'GET';

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-SDK-Version');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Match route
    const match = this.router.match(method, pathname);

    if (!match) {
      this.sendJson(res, 404, { error: 'Not found', path: pathname });
      return;
    }

    try {
      // Parse body for POST requests
      let body: unknown = {};
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        body = await this.parseBody(req);
      }

      // Build daemon request
      const daemonReq: DaemonRequest = {
        method,
        path: pathname,
        params: match.params,
        query: (parsedUrl.query || {}) as Record<string, string>,
        body,
        headers: (req.headers || {}) as Record<string, string>,
      };

      // Execute handler
      const result = await match.handler(daemonReq);
      this.sendJson(res, result.status, result.body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Request error [${method} ${pathname}]: ${message}`);
      this.sendJson(res, 500, { error: 'Internal server error', message });
    }
  }

  private sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  private parseBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (!raw || raw.trim().length === 0) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error('Invalid JSON in request body'));
        }
      });
      req.on('error', reject);
    });
  }

  // ── Route Registration ─────────────────────────────────────────────────────

  private registerRoutes(): void {
    // ── Health ──
    this.router.get('/health', async () => ({
      status: 200,
      body: {
        status: 'ok',
        version: SDK_VERSION,
        uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
        ...this.screenshotManager.getCounts(),
        activeWatchers: this.watchSessions.size,
        cloudConnected: this.apiClient?.isConfigured() || false,
      },
    }));

    // ── Screenshots ──
    this.router.post('/api/screenshots', async (req) => {
      const body = req.body as Record<string, unknown>;
      const result = await this.screenshotManager.capture({
        url: body.url as string,
        name: body.name as string | undefined,
        viewport: body.viewport as any,
        fullPage: body.fullPage as boolean | undefined,
        waitFor: body.waitFor as string | number | undefined,
        selector: body.selector as string | undefined,
        headers: body.headers as Record<string, string> | undefined,
        cookies: body.cookies as any,
        metadata: body.metadata as Record<string, unknown> | undefined,
      });
      return { status: 201, body: result };
    });

    // Alias: POST /api/screenshots/capture (used by SDK client)
    this.router.post('/api/screenshots/capture', async (req) => {
      const body = req.body as Record<string, unknown>;
      const result = await this.screenshotManager.capture({
        url: body.url as string,
        name: (body.metadata as Record<string, unknown>)?.name as string || body.name as string,
        viewport: body.viewport as any,
        fullPage: body.fullPage as boolean | undefined,
        waitFor: body.waitFor as string | number | undefined,
        selector: body.selector as string | undefined,
        headers: body.headers as Record<string, string> | undefined,
        cookies: body.cookies as any,
        metadata: body.metadata as Record<string, unknown> | undefined,
      });
      return { status: 201, body: result };
    });

    this.router.get('/api/screenshots', async (req) => {
      const query = req.query;
      const screenshots = this.screenshotManager.list({
        name: query.name,
        url: query.url,
        before: query.before ? parseInt(query.before, 10) : undefined,
        after: query.after ? parseInt(query.after, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined,
      });
      return { status: 200, body: { screenshots, total: screenshots.length } };
    });

    this.router.get('/api/screenshots/:id', async (req) => {
      const screenshot = this.screenshotManager.get(req.params.id!);
      if (!screenshot) {
        return { status: 404, body: { error: 'Screenshot not found' } };
      }
      return { status: 200, body: screenshot };
    });

    this.router.delete('/api/screenshots/:id', async (req) => {
      const deleted = this.screenshotManager.delete(req.params.id!);
      if (!deleted) {
        return { status: 404, body: { error: 'Screenshot not found' } };
      }
      return { status: 200, body: { deleted: true, id: req.params.id } };
    });

    // ── Quick Compare ──
    this.router.get('/api/compare/quick', async (req) => {
      const { baseline, screenshot } = req.query;
      if (!baseline) {
        return { status: 400, body: { error: 'baseline query parameter is required' } };
      }
      const result = await this.analysisEngine.quickCompareByName(
        baseline,
        screenshot || undefined
      );
      return { status: 200, body: result };
    });

    // ── Analysis ──
    this.router.post('/api/analyze', async (req) => {
      const body = req.body as Record<string, unknown>;
      const result = await this.analysisEngine.analyze({
        name: body.name as string | undefined,
        screenshotId: body.screenshotId as string | undefined,
        baselineName: body.baselineName as string | undefined,
        url: body.url as string | undefined,
        algorithm: body.algorithm as 'fast' | 'accurate' | 'hybrid' | undefined,
        escalateToCloud: body.escalateToCloud as boolean | undefined,
      });
      return { status: 200, body: result };
    });

    // Alias: POST /api/analyze/working-directory (used by SDK client compare())
    this.router.post('/api/analyze/working-directory', async (req) => {
      const body = req.body as Record<string, unknown>;
      const result = await this.analysisEngine.analyze({
        name: body.name as string | undefined,
        algorithm: body.algorithm as 'fast' | 'accurate' | 'hybrid' | undefined,
      });
      return {
        status: 200,
        body: {
          phases: {
            static: {
              result: {
                probability: result.local.probability,
                confidence: result.local.confidence,
                severity: result.local.severity,
                reasons: result.local.reasons,
                affectedPages: result.local.affectedAreas,
              },
            },
          },
          ...result,
        },
      };
    });

    // ── Baselines ──
    this.router.post('/api/baselines', async (req) => {
      const body = req.body as Record<string, unknown>;
      const result = await this.screenshotManager.setBaseline({
        name: body.name as string,
        screenshotId: body.screenshotId as string | undefined,
        url: body.url as string | undefined,
        viewport: body.viewport as any,
      });
      return { status: 201, body: result };
    });

    this.router.get('/api/baselines/:name', async (req) => {
      const baseline = this.screenshotManager.getBaseline(req.params.name!);
      if (!baseline) {
        return { status: 404, body: { error: 'Baseline not found' } };
      }
      return { status: 200, body: baseline };
    });

    // Alias: POST /baseline/:name/update (used by SDK updateBaseline())
    this.router.post('/baseline/:name/update', async (req) => {
      const baseline = this.screenshotManager.getBaseline(req.params.name!);
      if (!baseline) {
        return { status: 404, body: { error: 'Baseline not found' } };
      }
      // Re-capture and update
      const body = (req.body || {}) as Record<string, unknown>;
      const screenshots = this.screenshotManager.list({ name: req.params.name!, limit: 1 });
      if (screenshots.length > 0) {
        const result = await this.screenshotManager.setBaseline({
          name: req.params.name!,
          screenshotId: screenshots[0]!.id,
        });
        return { status: 200, body: result };
      }
      return { status: 400, body: { error: 'No recent screenshot to update baseline from' } };
    });

    // Alias: POST /baseline/:name/rollback (used by SDK rollback())
    this.router.post('/baseline/:name/rollback', async (req) => {
      const baseline = this.screenshotManager.getBaseline(req.params.name!);
      if (!baseline) {
        return { status: 404, body: { error: 'Baseline not found' } };
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const targetVersion = body.version ? parseInt(body.version as string, 10) : baseline.version - 1;
      const historyEntry = baseline.history.find((h) => h.version === targetVersion);
      if (!historyEntry) {
        return { status: 404, body: { error: `Version ${targetVersion} not found in history` } };
      }
      // Restore the baseline to the historical version
      const result = await this.screenshotManager.setBaseline({
        name: req.params.name!,
        screenshotId: historyEntry.screenshotId,
      });
      return { status: 200, body: result };
    });

    // Alias: POST /approve-all (used by SDK approveAll())
    this.router.post('/approve-all', async (req) => {
      // Approve all pending changes = update all baselines to latest screenshots
      const baselines = this.screenshotManager.listBaselines();
      const results = [];
      for (const baseline of baselines) {
        const screenshots = this.screenshotManager.list({ name: baseline.name, limit: 1 });
        if (screenshots.length > 0 && screenshots[0]!.id !== baseline.screenshotId) {
          const updated = await this.screenshotManager.setBaseline({
            name: baseline.name,
            screenshotId: screenshots[0]!.id,
          });
          results.push({ name: baseline.name, updated: true, version: updated.version });
        }
      }
      return { status: 200, body: { approved: results.length, results } };
    });

    // ── Watch ──
    this.router.post('/api/watch', async (req) => {
      const body = req.body as Record<string, unknown>;
      const session = this.startWatch({
        url: body.url as string,
        interval: body.interval as number | undefined,
        viewport: body.viewport as any,
        baselineName: body.baselineName as string | undefined,
      });
      return { status: 201, body: session };
    });

    this.router.delete('/api/watch/:id', async (req) => {
      const stopped = this.stopWatch(req.params.id!);
      if (!stopped) {
        return { status: 404, body: { error: 'Watch session not found' } };
      }
      return { status: 200, body: { stopped: true, id: req.params.id } };
    });

    // ── Session Context (from MCP) ──
    this.router.post('/api/context', async (req) => {
      const body = req.body as SessionContext;
      this.sessionContext = body;
      this.logger.info(`Session context received: ${body.sessionId}`);

      // Forward to cloud API if connected
      if (this.apiClient) {
        this.apiClient.sendContext(body).catch(() => {
          /* non-critical */
        });
      }

      this.emit('context', body);
      return { status: 200, body: { received: true, sessionId: body.sessionId } };
    });

    // ── Tool Registry (for API agent) ──
    this.router.get('/api/tools', async () => {
      const tools = this.toolRegistry.listTools();
      return { status: 200, body: { tools } };
    });

    this.router.post('/api/tools/call', async (req) => {
      const body = req.body as { toolName: string; params: Record<string, unknown>; requestId?: string };
      const result = await this.toolRegistry.executeTool({
        toolName: body.toolName,
        params: body.params || {},
        requestId: body.requestId || `call-${Date.now()}`,
      });
      return { status: 200, body: result };
    });

    // ── Agent Message (for paid tier AI) ──
    this.router.post('/api/agent/message', async (req) => {
      if (!this.apiClient) {
        return { status: 503, body: { error: 'Cloud API not configured. Set apiKey to enable AI agent.' } };
      }
      const body = req.body as { message: string; context?: Record<string, unknown> };
      const result = await this.apiClient.sendAgentMessage(body.message, body.context);
      return { status: 200, body: result };
    });
  }

  // ── Watch Sessions ─────────────────────────────────────────────────────────

  private startWatch(options: {
    url: string;
    interval?: number;
    viewport?: { width: number; height: number };
    baselineName?: string;
  }): WatchSession {
    const id = `watch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const interval = options.interval || 10000; // default 10s
    const viewport = options.viewport || { width: 1280, height: 720 };

    // Get baseline hash if specified
    let baselineHash;
    if (options.baselineName) {
      const baseline = this.screenshotManager.getBaseline(options.baselineName);
      if (baseline) {
        baselineHash = baseline.hash;
      }
    }

    const session: WatchSession = {
      id,
      url: options.url,
      viewport,
      interval,
      baselineHash,
      lastCheck: 0,
      changeCount: 0,
      active: true,
      createdAt: Date.now(),
    };

    this.watchSessions.set(id, session);

    // Start the periodic check
    const timer = setInterval(async () => {
      await this.performWatchCheck(session);
    }, interval);
    this.watchIntervals.set(id, timer);

    this.logger.info(`Watch started: ${id} for ${options.url} (every ${interval}ms)`);
    return session;
  }

  private stopWatch(id: string): boolean {
    const session = this.watchSessions.get(id);
    if (!session) return false;

    session.active = false;

    const timer = this.watchIntervals.get(id);
    if (timer) {
      clearInterval(timer);
      this.watchIntervals.delete(id);
    }

    this.watchSessions.delete(id);
    this.logger.info(`Watch stopped: ${id}`);
    return true;
  }

  private async performWatchCheck(session: WatchSession): Promise<void> {
    if (!session.active) return;

    try {
      const captureResult = await this.screenshotManager.capture({
        url: session.url,
        name: `watch-${session.id}`,
        viewport: session.viewport,
      });

      const screenshot = this.screenshotManager.get(captureResult.id);
      if (!screenshot) return;

      session.lastCheck = Date.now();

      // Compare against baseline if we have one
      let hasChanges = false;
      let description = 'No changes detected';
      let severity: 'low' | 'medium' | 'high' = 'low';

      if (session.baselineHash) {
        const comparison = this.analysisEngine.quickCompare(
          session.baselineHash,
          screenshot.hash
        );

        hasChanges = !comparison.identical && comparison.combinedSimilarity < 0.95;

        if (hasChanges) {
          session.changeCount++;
          const sim = comparison.combinedSimilarity;
          severity = sim < 0.7 ? 'high' : sim < 0.85 ? 'medium' : 'low';
          description = `Visual change detected (similarity: ${(sim * 100).toFixed(1)}%)`;
        }
      } else {
        // First check: set the initial hash as baseline
        session.baselineHash = screenshot.hash;
      }

      // Broadcast change events via WebSocket
      if (hasChanges) {
        const event: WatchChangeEvent = {
          type: 'change',
          watchId: session.id,
          url: session.url,
          timestamp: Date.now(),
          hasChanges,
          description,
          severity,
          screenshotId: captureResult.id,
        };

        this.broadcastWsMessage(event);
        this.emit('watch:change', event);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Watch check failed for ${session.id}: ${message}`);
    }
  }

  // ── WebSocket ──────────────────────────────────────────────────────────────

  private setupWebSocket(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws: WebSocket) => {
      this.wsClients.add(ws);
      this.logger.info(`WebSocket client connected (total: ${this.wsClients.size})`);

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWsMessage(ws, message);
        } catch {
          ws.send(JSON.stringify({ error: 'Invalid JSON message' }));
        }
      });

      ws.on('close', () => {
        this.wsClients.delete(ws);
        this.logger.info(`WebSocket client disconnected (total: ${this.wsClients.size})`);
      });

      ws.on('error', (err) => {
        this.logger.warn(`WebSocket error: ${err.message}`);
        this.wsClients.delete(ws);
      });

      // Send welcome message
      ws.send(
        JSON.stringify({
          type: 'connected',
          version: SDK_VERSION,
          timestamp: Date.now(),
        })
      );
    });
  }

  private handleWsMessage(ws: WebSocket, message: { type: string; [key: string]: unknown }): void {
    switch (message.type) {
      case 'start-watch': {
        const session = this.startWatch({
          url: message.url as string,
          interval: message.options
            ? (message.options as Record<string, unknown>).interval as number
            : undefined,
          viewport: message.options
            ? (message.options as Record<string, unknown>).viewport as any
            : undefined,
        });
        ws.send(JSON.stringify({ type: 'watch-started', session }));
        break;
      }

      case 'stop': {
        const stopped = this.stopWatch(message.id as string);
        ws.send(JSON.stringify({ type: 'watch-stopped', id: message.id, stopped }));
        break;
      }

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;

      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${message.type}` }));
    }
  }

  private broadcastWsMessage(message: unknown): void {
    const payload = JSON.stringify(message);
    for (const client of this.wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  // ── Logger ─────────────────────────────────────────────────────────────────

  private createLogger(level: DaemonConfig['logLevel']): Logger {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const minLevel = levels[level];
    const prefix = '[neuraldiff]';

    return {
      debug: (msg: string, ...args: unknown[]) => {
        if (minLevel <= 0) console.debug(`${prefix} [DEBUG] ${msg}`, ...args);
      },
      info: (msg: string, ...args: unknown[]) => {
        if (minLevel <= 1) console.info(`${prefix} [INFO] ${msg}`, ...args);
      },
      warn: (msg: string, ...args: unknown[]) => {
        if (minLevel <= 2) console.warn(`${prefix} [WARN] ${msg}`, ...args);
      },
      error: (msg: string, ...args: unknown[]) => {
        if (minLevel <= 3) console.error(`${prefix} [ERROR] ${msg}`, ...args);
      },
    };
  }
}
