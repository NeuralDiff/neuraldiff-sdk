/**
 * NeuralDiff Daemon - Local Analysis Engine
 * Performs quick pattern-based visual analysis locally and decides when to
 * escalate to the cloud API for deeper AI-powered analysis.
 */

import { compareHashes, hashesMatch } from './hash';
import type { ScreenshotManager } from './screenshot-manager';
import type { APIClient } from './api-client';
import type {
  AnalysisRequest,
  LocalAnalysisResult,
  CombinedAnalysisResult,
  HashComparisonResult,
  PerceptualHash,
  Logger,
} from './types';
import type { SemanticChange, ChangeType } from '../types';

/** Threshold above which we consider the images identical */
const IDENTICAL_THRESHOLD = 0.98;

/** Threshold below which we consider the images definitely changed */
const CHANGED_THRESHOLD = 0.85;

/** Threshold below which we escalate to cloud for deeper analysis */
const ESCALATION_THRESHOLD = 0.92;

export class AnalysisEngine {
  private screenshotManager: ScreenshotManager;
  private apiClient: APIClient | null;
  private logger: Logger;

  constructor(
    screenshotManager: ScreenshotManager,
    apiClient: APIClient | null,
    logger: Logger
  ) {
    this.screenshotManager = screenshotManager;
    this.apiClient = apiClient;
    this.logger = logger;
  }

  /**
   * Run analysis comparing a screenshot against its baseline.
   * This is the main entry point for the /api/analyze endpoint.
   */
  async analyze(request: AnalysisRequest): Promise<CombinedAnalysisResult> {
    const startTime = Date.now();

    // Resolve the baseline and current screenshot hashes
    const { baselineHash, currentHash } = await this.resolveHashes(request);

    // Run local analysis first (always runs, no API call needed)
    const local = this.runLocalAnalysis(baselineHash, currentHash, startTime);

    this.logger.info(
      `Local analysis: similarity=${local.hashComparison?.combinedSimilarity.toFixed(3)}, ` +
      `recommendation=${local.recommendation}`
    );

    // Decide whether to escalate to cloud
    const shouldEscalate =
      request.escalateToCloud !== false &&
      local.recommendation === 'escalate' &&
      this.apiClient !== null;

    let cloud;
    if (shouldEscalate) {
      this.logger.info('Escalating to cloud API for deeper analysis');
      try {
        cloud = await this.apiClient!.analyzeComparison({
          baselineHash: baselineHash.dHash,
          currentHash: currentHash.dHash,
          metadata: { localResult: local },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Cloud analysis failed, using local results only: ${message}`);
      }
    }

    // Merge results
    const merged = this.mergeResults(local, cloud);

    return { local, cloud, merged };
  }

  /**
   * Quick hash-only comparison (no cloud, very fast).
   * Used by the /api/compare/quick endpoint.
   */
  quickCompare(
    hash1: PerceptualHash,
    hash2: PerceptualHash
  ): HashComparisonResult {
    return compareHashes(hash1, hash2);
  }

  /**
   * Quick compare by baseline name and screenshot ID.
   */
  async quickCompareByName(
    baselineName: string,
    screenshotId?: string
  ): Promise<HashComparisonResult & { baselineName: string }> {
    const baseline = this.screenshotManager.getBaseline(baselineName);
    if (!baseline) {
      throw new Error(`Baseline not found: ${baselineName}`);
    }

    let currentHash: PerceptualHash;

    if (screenshotId) {
      const screenshot = this.screenshotManager.get(screenshotId);
      if (!screenshot) {
        throw new Error(`Screenshot not found: ${screenshotId}`);
      }
      currentHash = screenshot.hash;
    } else {
      // Use the most recent screenshot with a matching name pattern
      const screenshots = this.screenshotManager.list({ name: baselineName, limit: 1 });
      if (screenshots.length === 0) {
        throw new Error(`No recent screenshots found for: ${baselineName}`);
      }
      currentHash = screenshots[0]!.hash;
    }

    const result = compareHashes(baseline.hash, currentHash);
    return { ...result, baselineName };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Resolve the baseline and current hashes from the analysis request.
   */
  private async resolveHashes(request: AnalysisRequest): Promise<{
    baselineHash: PerceptualHash;
    currentHash: PerceptualHash;
  }> {
    let baselineHash: PerceptualHash | undefined;
    let currentHash: PerceptualHash | undefined;

    // Resolve baseline hash
    if (request.baselineName) {
      const baseline = this.screenshotManager.getBaseline(request.baselineName);
      if (baseline) {
        baselineHash = baseline.hash;
      }
    }
    if (!baselineHash && request.name) {
      const baseline = this.screenshotManager.getBaseline(request.name);
      if (baseline) {
        baselineHash = baseline.hash;
      }
    }

    // Resolve current hash
    if (request.screenshotId) {
      const screenshot = this.screenshotManager.get(request.screenshotId);
      if (screenshot) {
        currentHash = screenshot.hash;
      }
    }
    if (!currentHash && request.name) {
      const screenshots = this.screenshotManager.list({ name: request.name, limit: 1 });
      if (screenshots.length > 0) {
        currentHash = screenshots[0]!.hash;
      }
    }

    // If we need to capture, do it
    if (!currentHash && request.url) {
      const result = await this.screenshotManager.capture({
        url: request.url,
        name: request.name || 'analysis-capture',
      });
      const screenshot = this.screenshotManager.get(result.id);
      if (screenshot) {
        currentHash = screenshot.hash;
      }
    }

    if (!baselineHash) {
      throw new Error('Could not resolve baseline. Set a baseline first or provide baselineName.');
    }
    if (!currentHash) {
      throw new Error('Could not resolve current screenshot. Provide screenshotId, name, or url.');
    }

    return { baselineHash, currentHash };
  }

  /**
   * Run local pattern-based analysis using perceptual hashes.
   */
  private runLocalAnalysis(
    baselineHash: PerceptualHash,
    currentHash: PerceptualHash,
    startTime: number
  ): LocalAnalysisResult {
    const hashComparison = compareHashes(baselineHash, currentHash);
    const similarity = hashComparison.combinedSimilarity;

    // Determine severity and recommendation based on similarity
    let hasChanges: boolean;
    let severity: LocalAnalysisResult['severity'];
    let recommendation: LocalAnalysisResult['recommendation'];
    let confidence: number;
    const reasons: string[] = [];
    const affectedAreas: string[] = [];

    if (hashComparison.identical) {
      // Pixel-perfect match
      hasChanges = false;
      severity = 'none';
      recommendation = 'approve';
      confidence = 1.0;
      reasons.push('Screenshots are identical (hash match)');
    } else if (similarity >= IDENTICAL_THRESHOLD) {
      // Very high similarity - likely no meaningful change
      hasChanges = false;
      severity = 'none';
      recommendation = 'approve';
      confidence = 0.95;
      reasons.push('Screenshots are nearly identical (minor sub-pixel differences)');
    } else if (similarity >= ESCALATION_THRESHOLD) {
      // Ambiguous zone - small changes detected, escalate for AI review
      hasChanges = true;
      severity = 'minor';
      recommendation = 'escalate';
      confidence = 0.6;
      reasons.push('Small visual changes detected');
      this.addHashAnalysisReasons(hashComparison, reasons, affectedAreas);
    } else if (similarity >= CHANGED_THRESHOLD) {
      // Clear changes detected
      hasChanges = true;
      severity = 'major';
      recommendation = 'review';
      confidence = 0.8;
      reasons.push('Significant visual changes detected');
      this.addHashAnalysisReasons(hashComparison, reasons, affectedAreas);
    } else {
      // Very different - likely a breaking change
      hasChanges = true;
      severity = 'breaking';
      recommendation = 'reject';
      confidence = 0.9;
      reasons.push('Major visual differences detected - possible layout break');
      this.addHashAnalysisReasons(hashComparison, reasons, affectedAreas);
    }

    return {
      hasChanges,
      probability: hasChanges ? 1 - similarity : similarity,
      confidence,
      severity,
      reasons,
      affectedAreas,
      hashComparison,
      recommendation,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Add detailed reasons from hash comparison analysis.
   */
  private addHashAnalysisReasons(
    comparison: HashComparisonResult,
    reasons: string[],
    affectedAreas: string[]
  ): void {
    if (comparison.aHashSimilarity < comparison.dHashSimilarity) {
      reasons.push(
        'Average brightness pattern changed more than gradient pattern - possible color/brightness shift'
      );
      affectedAreas.push('color', 'brightness');
    }

    if (comparison.dHashSimilarity < comparison.aHashSimilarity) {
      reasons.push(
        'Gradient pattern changed more than brightness - possible layout/structural change'
      );
      affectedAreas.push('layout', 'structure');
    }

    if (comparison.aHashSimilarity < 0.7) {
      reasons.push('Substantial average hash difference - broad visual change');
    }

    if (comparison.dHashSimilarity < 0.7) {
      reasons.push('Substantial difference hash change - edge/gradient structure altered');
    }
  }

  /**
   * Merge local and cloud analysis results.
   */
  private mergeResults(
    local: LocalAnalysisResult,
    cloud?: { status: string; result?: {
      hasChanges: boolean;
      changes: SemanticChange[];
      summary: string;
      confidence: number;
      severity: 'none' | 'minor' | 'major' | 'breaking';
      suggestions: string[];
    }; error?: string } | null
  ): CombinedAnalysisResult['merged'] {
    // If cloud analysis is not available or failed, use local results
    if (!cloud || cloud.status !== 'completed' || !cloud.result) {
      return {
        hasChanges: local.hasChanges,
        changes: this.localToSemanticChanges(local),
        summary: local.reasons.join('. '),
        confidence: local.confidence,
        severity: local.severity,
        source: 'local',
      };
    }

    const cloudResult = cloud.result;

    // Merge: prefer cloud for semantic understanding, local for confidence calibration
    const mergedConfidence = Math.max(local.confidence, cloudResult.confidence);

    // If they agree, high confidence. If they disagree, lower it.
    const agree = local.hasChanges === cloudResult.hasChanges;
    const finalConfidence = agree ? mergedConfidence : mergedConfidence * 0.7;

    return {
      hasChanges: cloudResult.hasChanges,
      changes: cloudResult.changes.length > 0
        ? cloudResult.changes
        : this.localToSemanticChanges(local),
      summary: cloudResult.summary || local.reasons.join('. '),
      confidence: finalConfidence,
      severity: cloudResult.severity,
      source: 'combined',
    };
  }

  /**
   * Convert local analysis reasons into SemanticChange objects.
   */
  private localToSemanticChanges(local: LocalAnalysisResult): SemanticChange[] {
    return local.reasons.map((reason) => ({
      element: local.affectedAreas[0] || 'page',
      change: reason,
      severity: local.severity === 'breaking' ? 'high' as const
        : local.severity === 'major' ? 'medium' as const
        : 'low' as const,
      confidence: local.confidence,
      type: this.inferChangeType(reason),
    }));
  }

  /**
   * Infer change type from a reason string.
   */
  private inferChangeType(reason: string): ChangeType {
    const lower = reason.toLowerCase();
    if (lower.includes('color') || lower.includes('brightness')) return 'color';
    if (lower.includes('layout') || lower.includes('structural')) return 'layout';
    if (lower.includes('gradient') || lower.includes('edge')) return 'style';
    if (lower.includes('size') || lower.includes('dimension')) return 'size';
    if (lower.includes('position') || lower.includes('moved')) return 'position';
    if (lower.includes('font') || lower.includes('text')) return 'typography';
    if (lower.includes('spacing') || lower.includes('padding') || lower.includes('margin')) return 'spacing';
    return 'content';
  }
}
