/**
 * NeuralDiff Daemon - Perceptual Hashing
 * Implements average hash (aHash) and difference hash (dHash) algorithms
 * for fast visual similarity detection without requiring external image libraries.
 *
 * These operate on raw pixel data (grayscale luminance values) extracted by
 * the screenshot manager from captured images.
 */

import type { PerceptualHash, HashComparisonResult } from './types';

/** Default hash size (8x8 = 64-bit hash) */
const DEFAULT_HASH_SIZE = 8;

/** Default similarity threshold (0-1, where 1 = identical) */
const DEFAULT_SIMILARITY_THRESHOLD = 0.90;

/**
 * Compute the average hash (aHash) of grayscale pixel data.
 *
 * Algorithm:
 * 1. Resize image to hashSize x hashSize (caller provides pre-resized data)
 * 2. Compute mean luminance value
 * 3. Each bit = 1 if pixel >= mean, else 0
 *
 * @param pixels - Grayscale luminance values (0-255), length must be hashSize^2
 * @param hashSize - Width/height of the hash grid (default 8)
 * @returns Hex string representing the hash
 */
export function computeAHash(pixels: Uint8Array | number[], hashSize: number = DEFAULT_HASH_SIZE): string {
  const totalPixels = hashSize * hashSize;

  if (pixels.length < totalPixels) {
    throw new Error(`aHash requires at least ${totalPixels} pixels, got ${pixels.length}`);
  }

  // Compute mean luminance
  let sum = 0;
  for (let i = 0; i < totalPixels; i++) {
    sum += pixels[i]!;
  }
  const mean = sum / totalPixels;

  // Build binary hash: 1 if pixel >= mean, 0 otherwise
  const bits: number[] = [];
  for (let i = 0; i < totalPixels; i++) {
    bits.push(pixels[i]! >= mean ? 1 : 0);
  }

  return bitsToHex(bits);
}

/**
 * Compute the difference hash (dHash) of grayscale pixel data.
 *
 * Algorithm:
 * 1. Resize image to (hashSize+1) x hashSize (caller provides pre-resized data)
 * 2. For each row, compare adjacent pixels
 * 3. Each bit = 1 if left pixel > right pixel, else 0
 *
 * dHash is more robust to gamma/brightness changes than aHash because it
 * captures relative gradient direction rather than absolute values.
 *
 * @param pixels - Grayscale luminance values, arranged row-major, width = hashSize+1, height = hashSize
 * @param hashSize - Hash grid dimension (default 8, input width is hashSize+1)
 * @returns Hex string representing the hash
 */
export function computeDHash(pixels: Uint8Array | number[], hashSize: number = DEFAULT_HASH_SIZE): string {
  const width = hashSize + 1;
  const height = hashSize;
  const totalPixels = width * height;

  if (pixels.length < totalPixels) {
    throw new Error(`dHash requires at least ${totalPixels} pixels (${width}x${height}), got ${pixels.length}`);
  }

  const bits: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < hashSize; col++) {
      const leftIndex = row * width + col;
      const rightIndex = row * width + col + 1;
      bits.push(pixels[leftIndex]! > pixels[rightIndex]! ? 1 : 0);
    }
  }

  return bitsToHex(bits);
}

/**
 * Compute both aHash and dHash from grayscale pixel data.
 * The caller must provide two pixel arrays:
 *   - aHashPixels: hashSize x hashSize pixels for aHash
 *   - dHashPixels: (hashSize+1) x hashSize pixels for dHash
 *
 * If only one pixel array is available (e.g., the full image resized to
 * hashSize+1 x hashSize), we can derive aHash pixels by sub-sampling.
 */
export function computePerceptualHash(
  aHashPixels: Uint8Array | number[],
  dHashPixels: Uint8Array | number[],
  hashSize: number = DEFAULT_HASH_SIZE
): PerceptualHash {
  return {
    aHash: computeAHash(aHashPixels, hashSize),
    dHash: computeDHash(dHashPixels, hashSize),
  };
}

/**
 * Compute perceptual hash from a single pixel buffer.
 * Accepts pixels of size (hashSize+1) x hashSize and derives both hashes.
 */
export function computeHashFromBuffer(
  pixels: Uint8Array | number[],
  hashSize: number = DEFAULT_HASH_SIZE
): PerceptualHash {
  const width = hashSize + 1;
  const height = hashSize;

  // For aHash, sub-sample the (hashSize+1) wide data down to hashSize wide
  const aHashPixels = new Uint8Array(hashSize * hashSize);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < hashSize; col++) {
      // Take the average of two adjacent pixels to reduce width by 1
      const idx1 = row * width + col;
      const idx2 = row * width + col + 1;
      aHashPixels[row * hashSize + col] = Math.round(((pixels[idx1] ?? 0) + (pixels[idx2] ?? 0)) / 2);
    }
  }

  return {
    aHash: computeAHash(aHashPixels, hashSize),
    dHash: computeDHash(pixels, hashSize),
  };
}

/**
 * Calculate the Hamming distance between two hex hash strings.
 * Hamming distance is the number of bit positions where the two hashes differ.
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error(`Hash length mismatch: ${hash1.length} vs ${hash2.length}`);
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const val1 = parseInt(hash1[i]!, 16);
    const val2 = parseInt(hash2[i]!, 16);
    // Count differing bits in each hex digit (4 bits)
    let xor = val1 ^ val2;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }

  return distance;
}

/**
 * Calculate similarity score (0-1) from Hamming distance.
 * @param hash1 - First hash (hex string)
 * @param hash2 - Second hash (hex string)
 * @returns Similarity from 0.0 (completely different) to 1.0 (identical)
 */
export function hashSimilarity(hash1: string, hash2: string): number {
  const totalBits = hash1.length * 4; // each hex char = 4 bits
  const distance = hammingDistance(hash1, hash2);
  return 1 - distance / totalBits;
}

/**
 * Compare two perceptual hashes and return a detailed comparison result.
 */
export function compareHashes(
  hash1: PerceptualHash,
  hash2: PerceptualHash,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): HashComparisonResult {
  const aHashDist = hammingDistance(hash1.aHash, hash2.aHash);
  const dHashDist = hammingDistance(hash1.dHash, hash2.dHash);

  const aHashSim = hashSimilarity(hash1.aHash, hash2.aHash);
  const dHashSim = hashSimilarity(hash1.dHash, hash2.dHash);

  // Weighted combination: dHash is generally more reliable, give it more weight
  const combinedSimilarity = aHashSim * 0.35 + dHashSim * 0.65;

  return {
    aHashDistance: aHashDist,
    dHashDistance: dHashDist,
    aHashSimilarity: aHashSim,
    dHashSimilarity: dHashSim,
    combinedSimilarity,
    identical: aHashDist === 0 && dHashDist === 0,
    threshold,
  };
}

/**
 * Quick check: are two hashes similar enough to be considered "no change"?
 */
export function hashesMatch(
  hash1: PerceptualHash,
  hash2: PerceptualHash,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): boolean {
  const result = compareHashes(hash1, hash2, threshold);
  return result.combinedSimilarity >= threshold;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Convert an array of bits (0/1) to a hex string.
 */
function bitsToHex(bits: number[]): string {
  // Pad to multiple of 4
  while (bits.length % 4 !== 0) {
    bits.push(0);
  }

  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i]! << 3) | (bits[i + 1]! << 2) | (bits[i + 2]! << 1) | bits[i + 3]!;
    hex += nibble.toString(16);
  }

  return hex;
}

/**
 * Simple nearest-neighbor downscale of grayscale pixels.
 * Used when the caller passes a full-resolution grayscale buffer.
 *
 * @param pixels - Source grayscale buffer
 * @param srcWidth - Source width
 * @param srcHeight - Source height
 * @param dstWidth - Target width
 * @param dstHeight - Target height
 */
export function downsamplePixels(
  pixels: Uint8Array | number[],
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): Uint8Array {
  const output = new Uint8Array(dstWidth * dstHeight);

  for (let y = 0; y < dstHeight; y++) {
    for (let x = 0; x < dstWidth; x++) {
      const srcX = Math.floor((x * srcWidth) / dstWidth);
      const srcY = Math.floor((y * srcHeight) / dstHeight);
      const srcIndex = srcY * srcWidth + srcX;
      output[y * dstWidth + x] = pixels[srcIndex] ?? 0;
    }
  }

  return output;
}

/**
 * Convert RGBA pixel data to grayscale luminance.
 * Uses ITU-R BT.601 luma coefficients: 0.299*R + 0.587*G + 0.114*B
 */
export function rgbaToGrayscale(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const totalPixels = width * height;
  const grayscale = new Uint8Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    grayscale[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  return grayscale;
}
