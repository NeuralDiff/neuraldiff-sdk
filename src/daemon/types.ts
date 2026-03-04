/**
 * NeuralDiff Daemon - Type Definitions
 * Types specific to the daemon server, screenshot management, and API communication
 */

import type { Viewport, CaptureOptions, CompareOptions, SemanticChange, ChangeType } from '../types';

// ── Daemon Server ──────────────────────────────────────────────────────────────

export interface DaemonConfig {
  port: number;
  host: string;
  storageDir: string;
  apiKey?: string;
  apiUrl: string;
  maxConcurrentCaptures: number;
  enableWebSocket: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  port: 7878,
  host: '127.0.0.1',
  storageDir: '.neuraldiff',
  apiUrl: 'https://api.neuraldiff.com',
  maxConcurrentCaptures: 3,
  enableWebSocket: true,
  logLevel: 'info',
};

export interface DaemonStatus {
  running: boolean;
  port: number;
  uptime: number;
  version: string;
  screenshotCount: number;
  baselineCount: number;
  activeWatchers: number;
}

// ── Screenshots ────────────────────────────────────────────────────────────────

export interface ScreenshotRecord {
  id: string;
  name: string;
  filepath: string;
  url: string;
  viewport: Viewport;
  timestamp: number;
  hash: PerceptualHash;
  metadata: Record<string, unknown>;
  fileSize: number;
}

export interface ScreenshotCaptureRequest {
  url: string;
  name?: string;
  viewport?: Viewport;
  fullPage?: boolean;
  waitFor?: string | number;
  selector?: string;
  headers?: Record<string, string>;
  cookies?: Array<{ name: string; value: string; domain?: string; path?: string }>;
  metadata?: Record<string, unknown>;
}

export interface ScreenshotCaptureResponse {
  success: boolean;
  id: string;
  name: string;
  hash: string;
  filepath: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface ScreenshotListQuery {
  name?: string;
  url?: string;
  before?: number;
  after?: number;
  limit?: number;
  offset?: number;
}

// ── Perceptual Hashing ─────────────────────────────────────────────────────────

export interface PerceptualHash {
  aHash: string;
  dHash: string;
  raw?: Uint8Array;
}

export interface HashComparisonResult {
  aHashDistance: number;
  dHashDistance: number;
  aHashSimilarity: number;
  dHashSimilarity: number;
  combinedSimilarity: number;
  identical: boolean;
  threshold: number;
}

// ── Baselines ──────────────────────────────────────────────────────────────────

export interface BaselineRecord {
  name: string;
  screenshotId: string;
  filepath: string;
  hash: PerceptualHash;
  createdAt: number;
  updatedAt: number;
  version: number;
  history: BaselineHistoryEntry[];
}

export interface BaselineHistoryEntry {
  screenshotId: string;
  hash: PerceptualHash;
  timestamp: number;
  version: number;
}

export interface SetBaselineRequest {
  name: string;
  screenshotId?: string;
  url?: string;
  viewport?: Viewport;
}

// ── Analysis ───────────────────────────────────────────────────────────────────

export interface AnalysisRequest {
  name?: string;
  screenshotId?: string;
  baselineName?: string;
  url?: string;
  algorithm?: 'fast' | 'accurate' | 'hybrid';
  escalateToCloud?: boolean;
}

export interface LocalAnalysisResult {
  hasChanges: boolean;
  probability: number;
  confidence: number;
  severity: 'none' | 'minor' | 'major' | 'breaking';
  reasons: string[];
  affectedAreas: string[];
  hashComparison?: HashComparisonResult;
  recommendation: 'approve' | 'review' | 'reject' | 'escalate';
  duration: number;
}

export interface CloudAnalysisRequest {
  baselineHash: string;
  currentHash: string;
  baselineImage?: string; // base64
  currentImage?: string;  // base64
  context?: SessionContext;
  metadata?: Record<string, unknown>;
}

export interface CloudAnalysisResponse {
  requestId: string;
  status: 'completed' | 'pending' | 'failed';
  result?: {
    hasChanges: boolean;
    changes: SemanticChange[];
    summary: string;
    confidence: number;
    severity: 'none' | 'minor' | 'major' | 'breaking';
    suggestions: string[];
  };
  error?: string;
}

export interface CombinedAnalysisResult {
  local: LocalAnalysisResult;
  cloud?: CloudAnalysisResponse;
  merged: {
    hasChanges: boolean;
    changes: SemanticChange[];
    summary: string;
    confidence: number;
    severity: 'none' | 'minor' | 'major' | 'breaking';
    source: 'local' | 'cloud' | 'combined';
  };
}

// ── Watchers ───────────────────────────────────────────────────────────────────

export interface WatchSession {
  id: string;
  url: string;
  viewport: Viewport;
  interval: number;
  baselineHash?: PerceptualHash;
  lastCheck: number;
  changeCount: number;
  active: boolean;
  createdAt: number;
}

export interface WatchStartRequest {
  url: string;
  interval?: number;
  viewport?: Viewport;
  baselineName?: string;
}

export interface WatchChangeEvent {
  type: 'change';
  watchId: string;
  url: string;
  timestamp: number;
  hasChanges: boolean;
  description: string;
  severity: 'low' | 'medium' | 'high';
  changes?: SemanticChange[];
  screenshotId: string;
}

// ── Session Context (from MCP) ─────────────────────────────────────────────────

export interface SessionContext {
  sessionId: string;
  projectRoot?: string;
  framework?: string;
  testRunner?: string;
  branchName?: string;
  commitHash?: string;
  ciEnvironment?: string;
  userPreferences?: Record<string, unknown>;
  timestamp: number;
}

// ── Tool Registry ──────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  handler: (params: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, ToolPropertySchema>;
  required?: string[];
}

export interface ToolPropertySchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: string[];
  default?: unknown;
  items?: ToolPropertySchema;
  properties?: Record<string, ToolPropertySchema>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolCallRequest {
  toolName: string;
  params: Record<string, unknown>;
  requestId: string;
}

export interface ToolCallResponse {
  requestId: string;
  toolName: string;
  result: ToolResult;
  duration: number;
}

// ── API Client ─────────────────────────────────────────────────────────────────

export interface APIClientConfig {
  apiUrl: string;
  apiKey: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface APIAuthResponse {
  token: string;
  expiresAt: number;
  tier: 'free' | 'pro' | 'enterprise';
  features: string[];
}

// ── HTTP Request/Response helpers ──────────────────────────────────────────────

export interface DaemonRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

export interface DaemonResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}

// ── Logger ─────────────────────────────────────────────────────────────────────

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
