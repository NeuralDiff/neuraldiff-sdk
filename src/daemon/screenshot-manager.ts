/**
 * NeuralDiff Daemon - Screenshot Manager
 * Manages screenshot capture via Playwright, local storage, and perceptual hashing.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  computeHashFromBuffer,
  downsamplePixels,
  rgbaToGrayscale,
} from './hash';
import type {
  DaemonConfig,
  ScreenshotRecord,
  ScreenshotCaptureRequest,
  ScreenshotCaptureResponse,
  ScreenshotListQuery,
  BaselineRecord,
  BaselineHistoryEntry,
  PerceptualHash,
  SetBaselineRequest,
  Logger,
} from './types';
import type { Viewport } from '../types';

/** Maximum baseline history entries to retain */
const MAX_HISTORY_ENTRIES = 50;

/** Hash grid size (8x8 = 64-bit hashes) */
const HASH_SIZE = 8;

export class ScreenshotManager {
  private config: DaemonConfig;
  private screenshots: Map<string, ScreenshotRecord> = new Map();
  private baselines: Map<string, BaselineRecord> = new Map();
  private screenshotsDir: string;
  private baselinesDir: string;
  private metadataDir: string;
  private logger: Logger;

  constructor(config: DaemonConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;

    // Set up storage directories
    this.screenshotsDir = path.join(config.storageDir, 'screenshots');
    this.baselinesDir = path.join(config.storageDir, 'baselines');
    this.metadataDir = path.join(config.storageDir, 'metadata');

    this.ensureDirectories();
    this.loadMetadata();
  }

  /**
   * Capture a screenshot using Playwright.
   */
  async capture(request: ScreenshotCaptureRequest): Promise<ScreenshotCaptureResponse> {
    const id = this.generateId();
    const name = request.name || `capture-${id}`;
    const viewport = request.viewport || { width: 1280, height: 720 };
    const timestamp = Date.now();

    this.logger.info(`Capturing screenshot: ${name} from ${request.url}`);

    let browser;
    let screenshotBuffer: Buffer;
    let pixelHash: PerceptualHash;

    try {
      // Dynamic import of playwright -- it is a peer dependency
      const { chromium } = await import('playwright');

      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor || 1,
        isMobile: viewport.isMobile || false,
        hasTouch: viewport.hasTouch || false,
      });

      const page = await context.newPage();

      // Set extra headers if provided
      if (request.headers) {
        await page.setExtraHTTPHeaders(request.headers);
      }

      // Set cookies if provided
      if (request.cookies && request.cookies.length > 0) {
        await context.addCookies(
          request.cookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain || new URL(request.url).hostname,
            path: c.path || '/',
          }))
        );
      }

      // Navigate
      await page.goto(request.url, {
        waitUntil: typeof request.waitFor === 'string'
          ? (request.waitFor as 'load' | 'domcontentloaded' | 'networkidle')
          : 'networkidle',
        timeout: 30000,
      });

      // Wait for explicit timeout if numeric
      if (typeof request.waitFor === 'number') {
        await page.waitForTimeout(request.waitFor);
      }

      // Capture
      const screenshotOptions: { fullPage?: boolean; type: 'png' } = {
        fullPage: request.fullPage || false,
        type: 'png',
      };

      if (request.selector) {
        const element = page.locator(request.selector);
        screenshotBuffer = await element.screenshot(screenshotOptions);
      } else {
        screenshotBuffer = await page.screenshot(screenshotOptions);
      }

      // Compute perceptual hash from the captured image
      // We need raw pixel data. Playwright gives us a PNG buffer.
      // We extract raw RGBA pixels by reading the PNG through page evaluation.
      // For efficiency, we compute hash by rendering to a tiny canvas in the browser.
      const hashData = await page.evaluate(
        async ({ imgBase64, hashW, hashH }: { imgBase64: string; hashW: number; hashH: number }) => {
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = `data:image/png;base64,${imgBase64}`;
          });

          const canvas = document.createElement('canvas');
          canvas.width = hashW;
          canvas.height = hashH;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, hashW, hashH);
          const imageData = ctx.getImageData(0, 0, hashW, hashH);
          return Array.from(imageData.data);
        },
        {
          imgBase64: screenshotBuffer.toString('base64'),
          hashW: HASH_SIZE + 1,
          hashH: HASH_SIZE,
        }
      );

      const rgbaPixels = new Uint8Array(hashData);
      const grayscale = rgbaToGrayscale(rgbaPixels, HASH_SIZE + 1, HASH_SIZE);
      pixelHash = computeHashFromBuffer(grayscale, HASH_SIZE);

      await browser.close();
    } catch (error: unknown) {
      if (browser) {
        try { await browser.close(); } catch { /* ignore cleanup errors */ }
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Screenshot capture failed: ${message}`);

      // If Playwright is not available, create a placeholder hash
      if (message.includes('Cannot find module') || message.includes('playwright')) {
        this.logger.warn('Playwright not installed. Using placeholder for screenshot.');
        screenshotBuffer = Buffer.alloc(0);
        pixelHash = { aHash: '0000000000000000', dHash: '0000000000000000' };
      } else {
        throw error;
      }
    }

    // Save the screenshot file
    const filename = `${name}-${id}.png`;
    const filepath = path.join(this.screenshotsDir, filename);

    if (screenshotBuffer!.length > 0) {
      fs.writeFileSync(filepath, screenshotBuffer!);
    }

    // Create the record
    const record: ScreenshotRecord = {
      id,
      name,
      filepath,
      url: request.url,
      viewport,
      timestamp,
      hash: pixelHash!,
      metadata: request.metadata || {},
      fileSize: screenshotBuffer!.length,
    };

    this.screenshots.set(id, record);
    this.saveMetadata();

    this.logger.info(`Screenshot captured: ${id} (${name}), hash: a=${pixelHash!.aHash} d=${pixelHash!.dHash}`);

    return {
      success: true,
      id,
      name,
      hash: pixelHash!.dHash,
      filepath,
      timestamp,
      metadata: record.metadata as Record<string, unknown>,
    };
  }

  /**
   * List screenshots with optional filtering.
   */
  list(query?: ScreenshotListQuery): ScreenshotRecord[] {
    let results = Array.from(this.screenshots.values());

    if (query?.name) {
      results = results.filter((s) => s.name.includes(query.name!));
    }
    if (query?.url) {
      results = results.filter((s) => s.url.includes(query.url!));
    }
    if (query?.after) {
      results = results.filter((s) => s.timestamp >= query.after!);
    }
    if (query?.before) {
      results = results.filter((s) => s.timestamp <= query.before!);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);

    const offset = query?.offset || 0;
    const limit = query?.limit || 100;
    return results.slice(offset, offset + limit);
  }

  /**
   * Get a screenshot by ID.
   */
  get(id: string): ScreenshotRecord | undefined {
    return this.screenshots.get(id);
  }

  /**
   * Delete a screenshot by ID.
   */
  delete(id: string): boolean {
    const record = this.screenshots.get(id);
    if (!record) return false;

    // Remove file if it exists
    try {
      if (fs.existsSync(record.filepath)) {
        fs.unlinkSync(record.filepath);
      }
    } catch (err) {
      this.logger.warn(`Could not delete screenshot file: ${record.filepath}`);
    }

    this.screenshots.delete(id);
    this.saveMetadata();
    return true;
  }

  /**
   * Get screenshot file contents as a Buffer.
   */
  getImageBuffer(id: string): Buffer | null {
    const record = this.screenshots.get(id);
    if (!record) return null;

    try {
      return fs.readFileSync(record.filepath);
    } catch {
      return null;
    }
  }

  // ── Baselines ──────────────────────────────────────────────────────────────

  /**
   * Set a baseline from a screenshot or by capturing a new one.
   */
  async setBaseline(request: SetBaselineRequest): Promise<BaselineRecord> {
    let screenshot: ScreenshotRecord | undefined;

    if (request.screenshotId) {
      screenshot = this.screenshots.get(request.screenshotId);
      if (!screenshot) {
        throw new Error(`Screenshot not found: ${request.screenshotId}`);
      }
    } else if (request.url) {
      // Capture a new screenshot for the baseline
      const captureResult = await this.capture({
        url: request.url,
        name: `baseline-${request.name}`,
        viewport: request.viewport,
      });
      screenshot = this.screenshots.get(captureResult.id);
    } else {
      throw new Error('Either screenshotId or url is required to set a baseline');
    }

    if (!screenshot) {
      throw new Error('Failed to resolve screenshot for baseline');
    }

    // Copy screenshot to baselines directory
    const baselineFilename = `${request.name}.png`;
    const baselineFilepath = path.join(this.baselinesDir, baselineFilename);

    if (fs.existsSync(screenshot.filepath)) {
      fs.copyFileSync(screenshot.filepath, baselineFilepath);
    }

    const now = Date.now();
    const existing = this.baselines.get(request.name);

    const historyEntry: BaselineHistoryEntry = {
      screenshotId: screenshot.id,
      hash: screenshot.hash,
      timestamp: now,
      version: existing ? existing.version + 1 : 1,
    };

    const record: BaselineRecord = {
      name: request.name,
      screenshotId: screenshot.id,
      filepath: baselineFilepath,
      hash: screenshot.hash,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      version: historyEntry.version,
      history: [
        ...(existing?.history || []).slice(-MAX_HISTORY_ENTRIES + 1),
        historyEntry,
      ],
    };

    this.baselines.set(request.name, record);
    this.saveMetadata();

    this.logger.info(`Baseline set: ${request.name} (v${record.version})`);
    return record;
  }

  /**
   * Get a baseline by name.
   */
  getBaseline(name: string): BaselineRecord | undefined {
    return this.baselines.get(name);
  }

  /**
   * Get baseline image as Buffer.
   */
  getBaselineImage(name: string): Buffer | null {
    const baseline = this.baselines.get(name);
    if (!baseline) return null;

    try {
      return fs.readFileSync(baseline.filepath);
    } catch {
      return null;
    }
  }

  /**
   * List all baselines.
   */
  listBaselines(): BaselineRecord[] {
    return Array.from(this.baselines.values());
  }

  /**
   * Get counts for status reporting.
   */
  getCounts(): { screenshots: number; baselines: number } {
    return {
      screenshots: this.screenshots.size,
      baselines: this.baselines.size,
    };
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private ensureDirectories(): void {
    for (const dir of [this.screenshotsDir, this.baselinesDir, this.metadataDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private loadMetadata(): void {
    const screenshotsFile = path.join(this.metadataDir, 'screenshots.json');
    const baselinesFile = path.join(this.metadataDir, 'baselines.json');

    try {
      if (fs.existsSync(screenshotsFile)) {
        const data = JSON.parse(fs.readFileSync(screenshotsFile, 'utf-8'));
        for (const record of data) {
          this.screenshots.set(record.id, record);
        }
        this.logger.info(`Loaded ${this.screenshots.size} screenshot records`);
      }
    } catch (err) {
      this.logger.warn('Could not load screenshot metadata, starting fresh');
    }

    try {
      if (fs.existsSync(baselinesFile)) {
        const data = JSON.parse(fs.readFileSync(baselinesFile, 'utf-8'));
        for (const record of data) {
          this.baselines.set(record.name, record);
        }
        this.logger.info(`Loaded ${this.baselines.size} baseline records`);
      }
    } catch (err) {
      this.logger.warn('Could not load baseline metadata, starting fresh');
    }
  }

  private saveMetadata(): void {
    const screenshotsFile = path.join(this.metadataDir, 'screenshots.json');
    const baselinesFile = path.join(this.metadataDir, 'baselines.json');

    try {
      fs.writeFileSync(
        screenshotsFile,
        JSON.stringify(Array.from(this.screenshots.values()), null, 2)
      );
      fs.writeFileSync(
        baselinesFile,
        JSON.stringify(Array.from(this.baselines.values()), null, 2)
      );
    } catch (err) {
      this.logger.error('Failed to save metadata');
    }
  }
}
