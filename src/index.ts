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

        // API key is optional for local daemon
        if (this.config.apiUrl && this.config.apiUrl.includes('api.') && !this.config.apiKey) {
            throw new Error('API key is required for cloud API');
        }

        // Initialize HTTP client for local daemon
        this.client = axios.create({
            baseURL: this.config.apiUrl || 'http://localhost:7878',
            headers: {
                'Content-Type': 'application/json',
                'X-SDK-Version': '0.1.0',
                'User-Agent': 'neuraldiff-sdk/0.1.0'
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

            const response = await this.client.post('/api/screenshots/capture', {
                url: captureConfig.url || 'http://localhost:3000',
                viewport: captureConfig.viewport || { width: 1280, height: 720 },
                waitFor: captureConfig.waitFor || 'networkidle',
                fullPage: captureConfig.fullPage || false,
                metadata: { name, ...captureConfig.metadata }
            });

            return {
                id: response.data.id || `${name}-${Date.now()}`,
                name,
                status: response.data.success ? 'captured' : 'error',
                timestamp: Date.now(),
                hash: response.data.hash || '',
                metadata: response.data.metadata || {}
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

            // Use daemon's analysis endpoints
            const analysisResult = await this.client.post('/api/analyze/working-directory', {
                name,
                algorithm: options?.algorithm || 'hybrid'
            });

            const result = analysisResult.data;
            const hasChanges = result.phases?.static?.result?.probability > 0.1;
            
            return {
                name,
                hasChanges,
                duration: Date.now() - startTime,
                summary: hasChanges ? 
                    `Visual changes detected (${(result.phases?.static?.result?.probability * 100).toFixed(1)}% probability)` :
                    'No visual changes detected',
                changes: this.convertToSemanticChanges(result),
                confidence: result.phases?.static?.result?.confidence || 0.8
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
        const wsUrl = this.config.apiUrl?.replace('http', 'ws') || 'ws://localhost:7878';
        this.ws = new WebSocket(`${wsUrl}/ws`);

        this.ws.on('open', () => {
            this.ws?.send(JSON.stringify({
                type: 'start-watch',
                url,
                options
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

    private convertToSemanticChanges(result: any): SemanticChange[] {
        if (!result.phases?.static?.result) return [];
        
        const staticResult = result.phases.static.result;
        const changes: SemanticChange[] = [];
        
        staticResult.reasons?.forEach((reason: string, index: number) => {
            changes.push({
                element: staticResult.affectedPages?.[0] || 'unknown',
                change: reason,
                severity: staticResult.severity === 'breaking' ? 'high' : 
                         staticResult.severity === 'major' ? 'medium' : 'low',
                confidence: staticResult.confidence,
                type: this.inferChangeType(reason)
            });
        });
        
        return changes;
    }
    
    private inferChangeType(reason: string): ChangeType {
        const lowerReason = reason.toLowerCase();
        if (lowerReason.includes('color') || lowerReason.includes('background')) return 'color';
        if (lowerReason.includes('layout') || lowerReason.includes('position')) return 'layout';
        if (lowerReason.includes('size') || lowerReason.includes('width') || lowerReason.includes('height')) return 'size';
        if (lowerReason.includes('font') || lowerReason.includes('text')) return 'typography';
        if (lowerReason.includes('margin') || lowerReason.includes('padding')) return 'spacing';
        if (lowerReason.includes('style') || lowerReason.includes('css')) return 'style';
        return 'content';
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

// Export default instance factory
export default function createNeuroSpec(options: NeuralDiffOptions): NeuroSpec {
    return new NeuroSpec(options);
}