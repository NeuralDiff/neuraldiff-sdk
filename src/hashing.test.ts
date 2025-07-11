/**
 * Tests for Multi-Level Visual Hashing System
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VisualHasher, HashResult, HashComparison } from './hashing';

describe('VisualHasher', () => {
  let hasher: VisualHasher;
  let mockImageBuffer: Buffer;

  beforeEach(() => {
    hasher = new VisualHasher();
    // Create a mock image buffer (in real tests, this would be actual image data)
    mockImageBuffer = Buffer.from('mock-image-data-for-testing');
  });

  describe('generateHash', () => {
    it('should generate hash with default algorithm', async () => {
      const result = await hasher.generateHash(mockImageBuffer, 'dhash', 8);
      
      expect(result).toBeDefined();
      expect(result.hash).toBeDefined();
      expect(result.algorithm).toBe('dhash');
      expect(result.duration).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle different algorithms', async () => {
      const algorithms = ['average', 'dhash', 'phash'];
      
      for (const algorithm of algorithms) {
        const result = await hasher.generateHash(mockImageBuffer, algorithm, 8);
        expect(result.algorithm).toBe(algorithm);
        expect(result.hash).toBeDefined();
      }
    });

    it('should handle different sizes', async () => {
      const sizes = [8, 16, 32];
      
      for (const size of sizes) {
        const result = await hasher.generateHash(mockImageBuffer, 'dhash', size);
        expect(result.metadata?.size).toBe(size);
      }
    });

    it('should throw error for unknown algorithm', async () => {
      await expect(
        hasher.generateHash(mockImageBuffer, 'unknown-algorithm', 8)
      ).rejects.toThrow('Unknown hashing algorithm');
    });
  });

  describe('compareHashes', () => {
    it('should return identical for same hash', () => {
      const hash = '1010101010101010';
      const result = hasher.compareHashes(hash, hash, 'dhash');
      
      expect(result.identical).toBe(true);
      expect(result.similarity).toBe(1.0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should calculate similarity for different hashes', () => {
      const hash1 = '1010101010101010';
      const hash2 = '1010101010101011'; // One bit different
      const result = hasher.compareHashes(hash1, hash2, 'dhash');
      
      expect(result.identical).toBe(false);
      expect(result.similarity).toBeLessThan(1.0);
      expect(result.similarity).toBeGreaterThan(0.0);
      expect(result.differences).toBeDefined();
      expect(result.differences?.count).toBe(1);
    });

    it('should throw error for different hash lengths', () => {
      const hash1 = '1010101010101010';
      const hash2 = '101010101010101'; // One bit shorter
      
      expect(() => {
        hasher.compareHashes(hash1, hash2, 'dhash');
      }).toThrow('Hash lengths must be equal');
    });

    it('should determine severity correctly', () => {
      const hash1 = '1010101010101010';
      const hash2 = '1010101010101011'; // High similarity
      const hash3 = '0000000000000000'; // Low similarity
      
      const result1 = hasher.compareHashes(hash1, hash2, 'dhash');
      const result2 = hasher.compareHashes(hash1, hash3, 'dhash');
      
      expect(result1.differences?.severity).toBe('low');
      expect(result2.differences?.severity).toBe('high');
    });
  });

  describe('progressiveCompare', () => {
    it('should return level 1 result for identical images', async () => {
      const result = await hasher.progressiveCompare(mockImageBuffer, mockImageBuffer);
      
      expect(result.level).toBe(1);
      expect(result.result.identical).toBe(true);
      expect(result.shouldContinue).toBe(false);
      expect(result.totalDuration).toBeGreaterThan(0);
    });

    it('should handle custom options', async () => {
      const customHasher = new VisualHasher({
        level1: {
          algorithm: 'average',
          size: 8,
          threshold: 0.99 // Very strict
        }
      });

      const result = await customHasher.progressiveCompare(mockImageBuffer, mockImageBuffer);
      expect(result.level).toBe(1);
    });

    it('should indicate API analysis needed for level 4', async () => {
      const customHasher = new VisualHasher({
        level1: { algorithm: 'dhash', size: 8, threshold: 0.99 },
        level2: { algorithm: 'perceptual', size: 16, threshold: 0.99 },
        level3: { algorithm: 'structural', size: 32, threshold: 0.99 },
        level4: { enabled: true, semanticThreshold: 0.8 }
      });

      const result = await customHasher.progressiveCompare(mockImageBuffer, mockImageBuffer);
      expect(result.level).toBe(4);
      expect(result.shouldContinue).toBe(true);
    });
  });

  describe('Utility Functions', () => {
    it('should calculate Hamming distance correctly', () => {
      const hash1 = '1010101010101010';
      const hash2 = '1010101010101011';
      const hash3 = '0000000000000000';
      
      // Access private method through any type
      const hasherAny = hasher as any;
      
      expect(hasherAny.calculateHammingDistance(hash1, hash1)).toBe(0);
      expect(hasherAny.calculateHammingDistance(hash1, hash2)).toBe(1);
      expect(hasherAny.calculateHammingDistance(hash1, hash3)).toBe(8);
    });

    it('should calculate median correctly', () => {
      const hasherAny = hasher as any;
      
      expect(hasherAny.median([1, 2, 3, 4, 5])).toBe(3);
      expect(hasherAny.median([1, 2, 3, 4])).toBe(2.5);
      expect(hasherAny.median([1])).toBe(1);
    });
  });

  describe('Performance', () => {
    it('should complete hash generation within reasonable time', async () => {
      const startTime = Date.now();
      await hasher.generateHash(mockImageBuffer, 'dhash', 8);
      const duration = Date.now() - startTime;
      
      // Should complete within 100ms (generous for test environment)
      expect(duration).toBeLessThan(100);
    });

    it('should complete comparison within reasonable time', () => {
      const startTime = Date.now();
      hasher.compareHashes('1010101010101010', '1010101010101011', 'dhash');
      const duration = Date.now() - startTime;
      
      // Should complete within 10ms
      expect(duration).toBeLessThan(10);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid image buffer gracefully', async () => {
      const invalidBuffer = Buffer.from('');
      
      await expect(
        hasher.generateHash(invalidBuffer, 'dhash', 8)
      ).rejects.toThrow();
    });

    it('should provide meaningful error messages', async () => {
      await expect(
        hasher.generateHash(mockImageBuffer, 'invalid-algorithm', 8)
      ).rejects.toThrow('Unknown hashing algorithm: invalid-algorithm');
    });
  });
});