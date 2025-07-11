/**
 * NeuralDiff SDK
 * Intelligent visual regression detection for AI-assisted development
 */

import { EventEmitter } from 'events';
import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import pLimit from 'p-limit';
import { CaptureOptions, CompareOptions, ComparisonResult, NeuralDiffOptions, WatchOptions, Watcher, BatchOperation, BatchResult, SemanticChange, WatchResult, CaptureResult } from './types';

export class NeuroSpec extends EventEmitter {
    private client: AxiosInstance;
    private ws: WebSocket | null = null;
    private config: NeuralDiffOptions;
    private limiter: any;

    constructor(options: NeuralDiffOptions) {
        super();

        // Initialize configuration
        this.config = options;

        if (!this.config.apiKey) {
            throw new Error('NeuroSpec API key is required');
        }

        // Initialize HTTP client
        this.client = axios.create({
            baseURL: this.config.apiUrl || 'https://api.neurospec.dev',
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
                'X-SDK-Version': '0.1.0'
            },
            timeout: this.config.timeout || 30000
        });

        // Initialize concurrency limiter
        this.limiter = pLimit(this.config.concurrency || 5);

        // Initialize concurrency limiter
        this.limiter = pLimit(this.config.concurrency || 5);
    }

    /**
     * Capture a screenshot and store as baseline or comparison
     */
    async capture(name: string, options?: CaptureOptions): Promise<CaptureResult> {
        try {
            const captureConfig = {
                ...this.config.capture,
                ...options,
                name,
                timestamp: Date.now()
            };

            // Quick hash for deduplication (placeholder)
            const quickHash = `hash-${Date.now()}`;

            const response = await this.client.post('/capture', {
                ...captureConfig,
                quickHash
            });

            return {
                id: response.data.id,
                name,
                status: 'captured',
                timestamp: response.data.timestamp,
                hash: response.data.hash,
                metadata: response.data.metadata
            };
        } catch (error) {
            this.emit('error', { operation: 'capture', name, error });
            throw error;
        }
    }

    /**
     * Compare current state against baseline
     */
    async compare(name: string, options?: CompareOptions): Promise<ComparisonResult> {
        try {
            const startTime = Date.now();

            // Fast path: perceptual hash comparison
            const quickResult = await this.client.post('/compare/quick', {
                name,
                algorithm: options?.algorithm || 'hybrid'
            });

            if (quickResult.data.identical) {
                return {
                    name,
                    hasChanges: false,
                    duration: Date.now() - startTime,
                    summary: 'No visual changes detected',
                    changes: [],
                    confidence: 1.0
                };
            }

            // Detailed comparison needed
            const detailedResult = await this.client.post('/compare/detailed', {
                name,
                ...options
            });

            // Semantic analysis of changes (placeholder)
            const semanticChanges: SemanticChange[] = [];

            return {
                name,
                hasChanges: true,
                duration: Date.now() - startTime,
                summary: this.generateSummary(semanticChanges),
                changes: semanticChanges,
                confidence: detailedResult.data.confidence,
                diff: detailedResult.data.diffUrl
            };
        } catch (error) {
            this.emit('error', { operation: 'compare', name, error });
            throw error;
        }
    }

    /**
     * Start continuous monitoring for visual changes
     */
    watch(url: string, options?: WatchOptions): Watcher {
        const watcherId = `watch-${Date.now()}`;

        // Establish WebSocket connection for real-time updates
        this.ws = new WebSocket(`${this.config.apiUrl?.replace('https', 'wss')}/watch`);

        this.ws.on('open', () => {
            this.ws?.send(JSON.stringify({
                type: 'start',
                url,
                options,
                apiKey: this.config.apiKey
            }));
        });

        this.ws.on('message', (data) => {
            const message = JSON.parse(data.toString());

            if (message.type === 'change') {
                const result = this.processWatchChange(message);
                options?.onChange?.(result);
                this.emit('change', result);
            }
        });

        return {
            id: watcherId,
            stop: () => {
                this.ws?.send(JSON.stringify({ type: 'stop', id: watcherId }));
                this.ws?.close();
            }
        };
    }

    /**
     * Execute multiple operations in parallel
     */
    async batch(operations: BatchOperation[]): Promise<BatchResult[]> {
        const results = await Promise.all(
            operations.map(op =>
                this.limiter(() => this.executeBatchOperation(op))
            )
        );

        return results;
    }

    /**
     * Update baseline for a captured element
     */
    async updateBaseline(name: string): Promise<void> {
        await this.client.post(`/baseline/${name}/update`);
        this.emit('baseline:updated', { name });
    }

    /**
     * Approve all pending changes
     */
    async approveAll(options?: { tag?: string }): Promise<void> {
        await this.client.post('/approve-all', options);
        this.emit('changes:approved', options);
    }

    /**
     * Rollback to previous baseline
     */
    async rollback(name: string, options?: { version?: string }): Promise<void> {
        await this.client.post(`/baseline/${name}/rollback`, options);
        this.emit('baseline:rollback', { name, ...options });
    }

    // Private helper methods
    private generateSummary(changes: SemanticChange[]): string {
        if (changes.length === 0) return 'No visual changes detected';

        const highSeverity = changes.filter(c => c.severity === 'high').length;
        const mediumSeverity = changes.filter(c => c.severity === 'medium').length;

        if (highSeverity > 0) {
            return `${highSeverity} critical visual change${highSeverity > 1 ? 's' : ''} detected`;
        } else if (mediumSeverity > 0) {
            return `${mediumSeverity} moderate visual change${mediumSeverity > 1 ? 's' : ''} detected`;
        }

        return `${changes.length} minor visual change${changes.length > 1 ? 's' : ''} detected`;
    }

    private processWatchChange(message: any): WatchResult {
        return {
            path: message.path,
            timestamp: message.timestamp,
            hasChanges: message.hasChanges,
            description: message.description,
            severity: message.severity,
            changes: message.changes
        };
    }

    private async executeBatchOperation(op: BatchOperation): Promise<BatchResult> {
        try {
            if (op.type === 'capture') {
                const result = await this.capture(op.name, op.options as CaptureOptions);
                return { 
                    name: op.name,
                    type: 'capture',
                    status: 'success',
                    result
                };
            } else {
                const result = await this.compare(op.name, op.options as CompareOptions);
                return { 
                    name: op.name,
                    type: 'compare',
                    status: 'success',
                    result
                };
            }
        } catch (error: any) {
            return {
                name: op.name,
                type: op.type,
                status: 'error',
                error: error?.message || 'Unknown error'
            };
        }
    }
}

// Export types and utilities
export * from './types';

// Export hashing functionality
export * from './hashing';

// Export default instance factory
export default function createNeuroSpec(options: NeuralDiffOptions): NeuroSpec {
    return new NeuroSpec(options);
}