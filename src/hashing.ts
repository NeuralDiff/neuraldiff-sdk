/**
 * Multi-Level Visual Hashing Algorithms
 * 
 * This module implements a progressive visual hashing system that starts with
 * ultra-fast millisecond-level comparisons and escalates to more detailed analysis
 * when changes are detected.
 */

import sharp from 'sharp';

export interface HashResult {
  hash: string;
  algorithm: string;
  duration: number;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface HashComparison {
  identical: boolean;
  similarity: number;
  duration: number;
  algorithm: string;
  differences?: {
    count: number;
    positions: number[];
    severity: 'low' | 'medium' | 'high';
  };
}

export interface MultiLevelHashOptions {
  // Level 1: Ultra-fast (millisecond) hashing
  level1?: {
    algorithm: 'average' | 'dhash' | 'phash';
    size: number;
    threshold: number;
  };
  
  // Level 2: Fast perceptual hashing
  level2?: {
    algorithm: 'perceptual' | 'wavelet' | 'blockhash';
    size: number;
    threshold: number;
  };
  
  // Level 3: Detailed analysis
  level3?: {
    algorithm: 'structural' | 'colorhistogram' | 'gradient';
    size: number;
    threshold: number;
  };
  
  // Level 4: Semantic analysis (API-based)
  level4?: {
    enabled: boolean;
    apiEndpoint?: string;
    semanticThreshold: number;
  };
}

export class VisualHasher {
  private defaultOptions: MultiLevelHashOptions = {
    level1: {
      algorithm: 'dhash',
      size: 8,
      threshold: 0.95
    },
    level2: {
      algorithm: 'perceptual',
      size: 16,
      threshold: 0.90
    },
    level3: {
      algorithm: 'structural',
      size: 32,
      threshold: 0.85
    },
    level4: {
      enabled: true,
      semanticThreshold: 0.80
    }
  };

  constructor(private options: MultiLevelHashOptions = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Generate hash for an image buffer using specified algorithm
   */
  async generateHash(
    imageBuffer: Buffer,
    algorithm: string,
    size: number = 8
  ): Promise<HashResult> {
    const startTime = Date.now();
    
    let hash: string;
    let confidence = 1.0;
    let metadata: Record<string, any> = {};

    try {
      switch (algorithm) {
        case 'average':
          hash = await this.averageHash(imageBuffer, size);
          break;
        case 'dhash':
          hash = await this.differenceHash(imageBuffer, size);
          break;
        case 'phash':
          hash = await this.perceptualHash(imageBuffer, size);
          break;
        case 'perceptual':
          hash = await this.advancedPerceptualHash(imageBuffer, size);
          confidence = 0.95;
          break;
        case 'wavelet':
          hash = await this.waveletHash(imageBuffer, size);
          confidence = 0.92;
          break;
        case 'blockhash':
          hash = await this.blockHash(imageBuffer, size);
          confidence = 0.90;
          break;
        case 'structural':
          hash = await this.structuralHash(imageBuffer, size);
          confidence = 0.88;
          metadata = { structuralFeatures: true };
          break;
        case 'colorhistogram':
          hash = await this.colorHistogramHash(imageBuffer, size);
          confidence = 0.85;
          metadata = { colorAnalysis: true };
          break;
        case 'gradient':
          hash = await this.gradientHash(imageBuffer, size);
          confidence = 0.87;
          metadata = { gradientAnalysis: true };
          break;
        default:
          throw new Error(`Unknown hashing algorithm: ${algorithm}`);
      }

      const duration = Date.now() - startTime;

      return {
        hash,
        algorithm,
        duration,
        confidence,
        metadata: {
          size,
          ...metadata
        }
      };
    } catch (error) {
      throw new Error(`Hash generation failed for algorithm ${algorithm}: ${error}`);
    }
  }

  /**
   * Compare two hashes and return similarity score
   */
  compareHashes(hash1: string, hash2: string, algorithm: string): HashComparison {
    const startTime = Date.now();
    
    if (hash1 === hash2) {
      return {
        identical: true,
        similarity: 1.0,
        duration: Date.now() - startTime,
        algorithm
      };
    }

    // Calculate Hamming distance for binary hashes
    const hammingDistance = this.calculateHammingDistance(hash1, hash2);
    const maxDistance = hash1.length;
    const similarity = 1 - (hammingDistance / maxDistance);

    // Determine severity based on similarity
    let severity: 'low' | 'medium' | 'high';
    if (similarity > 0.8) severity = 'low';
    else if (similarity > 0.6) severity = 'medium';
    else severity = 'high';

    // Find positions of differences
    const positions: number[] = [];
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) {
        positions.push(i);
      }
    }

    const differences = {
      count: hammingDistance,
      positions,
      severity
    };

    return {
      identical: similarity === 1.0,
      similarity,
      duration: Date.now() - startTime,
      algorithm,
      differences
    };
  }

  /**
   * Multi-level progressive comparison
   */
  async progressiveCompare(
    image1: Buffer,
    image2: Buffer,
    options?: MultiLevelHashOptions
  ): Promise<{
    level: number;
    result: HashComparison;
    shouldContinue: boolean;
    totalDuration: number;
  }> {
    const opts = { ...this.options, ...options };
    const startTime = Date.now();

    // Level 1: Ultra-fast comparison (millisecond level)
    if (opts.level1) {
      const hash1 = await this.generateHash(image1, opts.level1.algorithm, opts.level1.size);
      const hash2 = await this.generateHash(image2, opts.level1.algorithm, opts.level1.size);
      const result = this.compareHashes(hash1.hash, hash2.hash, opts.level1.algorithm);

      if (result.similarity >= opts.level1.threshold) {
        return {
          level: 1,
          result,
          shouldContinue: false,
          totalDuration: Date.now() - startTime
        };
      }
    }

    // Level 2: Fast perceptual hashing
    if (opts.level2) {
      const hash1 = await this.generateHash(image1, opts.level2.algorithm, opts.level2.size);
      const hash2 = await this.generateHash(image2, opts.level2.algorithm, opts.level2.size);
      const result = this.compareHashes(hash1.hash, hash2.hash, opts.level2.algorithm);

      if (result.similarity >= opts.level2.threshold) {
        return {
          level: 2,
          result,
          shouldContinue: false,
          totalDuration: Date.now() - startTime
        };
      }
    }

    // Level 3: Detailed analysis
    if (opts.level3) {
      const hash1 = await this.generateHash(image1, opts.level3.algorithm, opts.level3.size);
      const hash2 = await this.generateHash(image2, opts.level3.algorithm, opts.level3.size);
      const result = this.compareHashes(hash1.hash, hash2.hash, opts.level3.algorithm);

      if (result.similarity >= opts.level3.threshold) {
        return {
          level: 3,
          result,
          shouldContinue: false,
          totalDuration: Date.now() - startTime
        };
      }
    }

    // Level 4: Semantic analysis (API-based)
    if (opts.level4?.enabled) {
      // This would trigger API call for semantic analysis
      return {
        level: 4,
        result: {
          identical: false,
          similarity: 0,
          duration: Date.now() - startTime,
          algorithm: 'semantic',
          differences: {
            count: 0,
            positions: [],
            severity: 'high'
          }
        },
        shouldContinue: true, // Indicates API analysis needed
        totalDuration: Date.now() - startTime
      };
    }

    return {
      level: 3,
      result: {
        identical: false,
        similarity: 0,
        duration: Date.now() - startTime,
        algorithm: 'progressive',
        differences: {
          count: 0,
          positions: [],
          severity: 'high'
        }
      },
      shouldContinue: false,
      totalDuration: Date.now() - startTime
    };
  }

  // ===== HASHING ALGORITHMS =====

  /**
   * Average Hash - Fastest algorithm
   * Converts image to grayscale, resizes, calculates average pixel value,
   * then creates binary hash based on whether each pixel is above/below average
   */
  private async averageHash(imageBuffer: Buffer, size: number): Promise<string> {
    const image = sharp(imageBuffer);
    const resized = await image
      .resize(size, size)
      .grayscale()
      .raw()
      .toBuffer();

    const pixels = new Uint8Array(resized);
    const average = pixels.reduce((sum, pixel) => sum + pixel, 0) / pixels.length;

    let hash = '';
    for (let i = 0; i < pixels.length; i++) {
      hash += pixels[i] > average ? '1' : '0';
    }

    return hash;
  }

  /**
   * Difference Hash - Fast and effective
   * Similar to average hash but compares adjacent pixels instead of average
   */
  private async differenceHash(imageBuffer: Buffer, size: number): Promise<string> {
    const image = sharp(imageBuffer);
    const resized = await image
      .resize(size + 1, size + 1) // Need one extra pixel for differences
      .grayscale()
      .raw()
      .toBuffer();

    const pixels = new Uint8Array(resized);
    let hash = '';

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const current = pixels[y * (size + 1) + x];
        const next = pixels[y * (size + 1) + x + 1];
        hash += current > next ? '1' : '0';
      }
    }

    return hash;
  }

  /**
   * Perceptual Hash - More accurate than average hash
   * Uses DCT (Discrete Cosine Transform) for better perceptual matching
   */
  private async perceptualHash(imageBuffer: Buffer, size: number): Promise<string> {
    const image = sharp(imageBuffer);
    const resized = await image
      .resize(size, size)
      .grayscale()
      .raw()
      .toBuffer();

    const pixels = new Uint8Array(resized);
    
    // Simple DCT approximation (for performance)
    const dct = this.simpleDCT(pixels, size);
    
    // Use low-frequency components
    const lowFreq: number[] = [];
    for (let i = 0; i < Math.min(8, size); i++) {
      for (let j = 0; j < Math.min(8, size); j++) {
        lowFreq.push(dct[i * size + j]);
      }
    }

    const median = this.median(lowFreq);
    let hash = '';
    for (const value of lowFreq) {
      hash += value > median ? '1' : '0';
    }

    return hash;
  }

  /**
   * Advanced Perceptual Hash - Enhanced version with better accuracy
   */
  private async advancedPerceptualHash(imageBuffer: Buffer, size: number): Promise<string> {
    const image = sharp(imageBuffer);
    const resized = await image
      .resize(size, size)
      .grayscale()
      .raw()
      .toBuffer();

    const pixels = new Uint8Array(resized);
    
    // Apply Gaussian blur for noise reduction
    const blurred = await sharp(resized, { raw: { width: size, height: size, channels: 1 } })
      .blur(1)
      .raw()
      .toBuffer();

    const blurredPixels = new Uint8Array(blurred);
    const dct = this.simpleDCT(blurredPixels, size);
    
    // Use more low-frequency components for better accuracy
    const lowFreq: number[] = [];
    const freqCount = Math.min(size * 2, size * size);
    
    for (let i = 0; i < freqCount; i++) {
      lowFreq.push(dct[i]);
    }

    const mean = lowFreq.reduce((sum, val) => sum + val, 0) / lowFreq.length;
    let hash = '';
    for (const value of lowFreq) {
      hash += value > mean ? '1' : '0';
    }

    return hash;
  }

  /**
   * Wavelet Hash - Good for detecting structural changes
   */
  private async waveletHash(imageBuffer: Buffer, size: number): Promise<string> {
    const image = sharp(imageBuffer);
    const resized = await image
      .resize(size, size)
      .grayscale()
      .raw()
      .toBuffer();

    const pixels = new Uint8Array(resized);
    
    // Simple Haar wavelet transform
    const wavelet = this.haarWavelet(pixels, size);
    
    // Use approximation coefficients
    const approxSize = size / 2;
    const approx: number[] = [];
    for (let i = 0; i < approxSize; i++) {
      for (let j = 0; j < approxSize; j++) {
        approx.push(wavelet[i * size + j]);
      }
    }

    const threshold = this.median(approx);
    let hash = '';
    for (const value of approx) {
      hash += value > threshold ? '1' : '0';
    }

    return hash;
  }

  /**
   * Block Hash - Divides image into blocks and hashes each
   */
  private async blockHash(imageBuffer: Buffer, size: number): Promise<string> {
    const image = sharp(imageBuffer);
    const resized = await image
      .resize(size * 4, size * 4) // Larger size for better block analysis
      .grayscale()
      .raw()
      .toBuffer();

    const pixels = new Uint8Array(resized);
    const blockSize = 4;
    let hash = '';

    for (let by = 0; by < size; by++) {
      for (let bx = 0; bx < size; bx++) {
        let blockSum = 0;
        
        // Calculate average for this block
        for (let y = 0; y < blockSize; y++) {
          for (let x = 0; x < blockSize; x++) {
            const px = bx * blockSize + x;
            const py = by * blockSize + y;
            blockSum += pixels[py * (size * 4) + px];
          }
        }
        
        const blockAvg = blockSum / (blockSize * blockSize);
        hash += blockAvg > 128 ? '1' : '0';
      }
    }

    return hash;
  }

  /**
   * Structural Hash - Focuses on structural features
   */
  private async structuralHash(imageBuffer: Buffer, size: number): Promise<string> {
    const image = sharp(imageBuffer);
    const resized = await image
      .resize(size, size)
      .grayscale()
      .raw()
      .toBuffer();

    const pixels = new Uint8Array(resized);
    
    // Calculate gradients
    const gradients = this.calculateGradients(pixels, size);
    
    // Use gradient magnitude for structural features
    const threshold = this.median(gradients);
    let hash = '';
    for (const gradient of gradients) {
      hash += gradient > threshold ? '1' : '0';
    }

    return hash;
  }

  /**
   * Color Histogram Hash - Based on color distribution
   */
  private async colorHistogramHash(imageBuffer: Buffer, size: number): Promise<string> {
    const image = sharp(imageBuffer);
    const resized = await image
      .resize(size, size)
      .raw()
      .toBuffer();

    const pixels = new Uint8Array(resized);
    const channels = 3; // RGB
    const histograms: number[][] = [[], [], []];
    
    // Calculate histograms for each channel
    for (let c = 0; c < channels; c++) {
      const histogram = new Array(256).fill(0);
      for (let i = c; i < pixels.length; i += channels) {
        histogram[pixels[i]]++;
      }
      histograms[c] = histogram;
    }
    
    // Create hash from histogram features
    let hash = '';
    for (const histogram of histograms) {
      const mean = histogram.reduce((sum, val, idx) => sum + val * idx, 0) / 
                   histogram.reduce((sum, val) => sum + val, 0);
      hash += mean > 128 ? '1' : '0';
    }

    return hash;
  }

  /**
   * Gradient Hash - Based on image gradients
   */
  private async gradientHash(imageBuffer: Buffer, size: number): Promise<string> {
    const image = sharp(imageBuffer);
    const resized = await image
      .resize(size, size)
      .grayscale()
      .raw()
      .toBuffer();

    const pixels = new Uint8Array(resized);
    const gradients = this.calculateGradients(pixels, size);
    
    // Use gradient direction and magnitude
    const threshold = this.median(gradients);
    let hash = '';
    for (const gradient of gradients) {
      hash += gradient > threshold ? '1' : '0';
    }

    return hash;
  }

  // ===== UTILITY FUNCTIONS =====

  private calculateHammingDistance(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) {
      throw new Error('Hash lengths must be equal for Hamming distance calculation');
    }

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) {
        distance++;
      }
    }
    return distance;
  }

  private simpleDCT(pixels: Uint8Array, size: number): number[] {
    // Simplified DCT implementation
    const dct = new Array(size * size).fill(0);
    
    for (let u = 0; u < size; u++) {
      for (let v = 0; v < size; v++) {
        let sum = 0;
        for (let x = 0; x < size; x++) {
          for (let y = 0; y < size; y++) {
            const cos1 = Math.cos((2 * x + 1) * u * Math.PI / (2 * size));
            const cos2 = Math.cos((2 * y + 1) * v * Math.PI / (2 * size));
            sum += pixels[y * size + x] * cos1 * cos2;
          }
        }
        dct[u * size + v] = sum;
      }
    }
    
    return dct;
  }

  private haarWavelet(pixels: Uint8Array, size: number): number[] {
    // Simplified Haar wavelet transform
    const result = new Array(size * size);
    
    // Copy input
    for (let i = 0; i < pixels.length; i++) {
      result[i] = pixels[i];
    }
    
    // Apply Haar transform
    for (let step = 1; step < size; step *= 2) {
      for (let i = 0; i < size; i += step * 2) {
        for (let j = 0; j < size; j++) {
          const idx1 = i * size + j;
          const idx2 = (i + step) * size + j;
          const avg = (result[idx1] + result[idx2]) / 2;
          const diff = (result[idx1] - result[idx2]) / 2;
          result[idx1] = avg;
          result[idx2] = diff;
        }
      }
    }
    
    return result;
  }

  private calculateGradients(pixels: Uint8Array, size: number): number[] {
    const gradients: number[] = [];
    
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const idx = y * size + x;
        const gx = pixels[idx + 1] - pixels[idx - 1];
        const gy = pixels[(y + 1) * size + x] - pixels[(y - 1) * size + x];
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        gradients.push(magnitude);
      }
    }
    
    return gradients;
  }

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }
}

// Export singleton instance
export const visualHasher = new VisualHasher();

// Export convenience functions
export async function quickHash(imageBuffer: Buffer): Promise<HashResult> {
  return visualHasher.generateHash(imageBuffer, 'dhash', 8);
}

export async function perceptualHash(imageBuffer: Buffer): Promise<HashResult> {
  return visualHasher.generateHash(imageBuffer, 'perceptual', 16);
}

export async function detailedHash(imageBuffer: Buffer): Promise<HashResult> {
  return visualHasher.generateHash(imageBuffer, 'structural', 32);
}

export async function progressiveCompare(
  image1: Buffer,
  image2: Buffer,
  options?: MultiLevelHashOptions
) {
  return visualHasher.progressiveCompare(image1, image2, options);
}