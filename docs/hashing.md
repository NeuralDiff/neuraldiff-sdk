# Multi-Level Visual Hashing System

The NeuralDiff SDK includes a sophisticated multi-level visual hashing system designed for ultra-fast visual change detection with progressive accuracy escalation.

## Overview

The system implements a 4-level progressive comparison approach:

1. **Level 1: Ultra-Fast (Millisecond)** - Basic hashing for instant screening
2. **Level 2: Fast Perceptual** - Enhanced perceptual hashing for minor changes
3. **Level 3: Detailed Analysis** - Structural and feature-based analysis
4. **Level 4: Semantic Analysis** - API-based semantic difference generation

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Level 1       │    │   Level 2       │    │   Level 3       │
│   (Ultra-Fast)  │───▶│   (Perceptual)  │───▶│   (Detailed)    │
│   < 1ms         │    │   < 10ms        │    │   < 100ms       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
                                               ┌─────────────────┐
                                               │   Level 4       │
                                               │   (Semantic)    │
                                               │   API-based     │
                                               └─────────────────┘
```

## Algorithms

### Level 1: Ultra-Fast Algorithms

#### Average Hash
- **Speed**: Fastest (< 1ms)
- **Accuracy**: Basic
- **Use Case**: Initial screening, identical image detection
- **Process**: Converts to grayscale, resizes, calculates average, creates binary hash

#### Difference Hash (dHash)
- **Speed**: Very fast (< 2ms)
- **Accuracy**: Good for minor changes
- **Use Case**: Default Level 1 algorithm
- **Process**: Compares adjacent pixels, more robust than average hash

#### Perceptual Hash (pHash)
- **Speed**: Fast (< 5ms)
- **Accuracy**: Better perceptual matching
- **Use Case**: When accuracy is more important than speed
- **Process**: Uses DCT (Discrete Cosine Transform) for frequency analysis

### Level 2: Perceptual Algorithms

#### Advanced Perceptual Hash
- **Speed**: Moderate (< 10ms)
- **Accuracy**: High perceptual accuracy
- **Use Case**: Detecting minor visual changes
- **Process**: Enhanced with noise reduction and better frequency analysis

#### Wavelet Hash
- **Speed**: Moderate (< 15ms)
- **Accuracy**: Good for structural changes
- **Use Case**: Layout and structural change detection
- **Process**: Uses Haar wavelet transform

#### Block Hash
- **Speed**: Moderate (< 12ms)
- **Accuracy**: Good for block-level changes
- **Use Case**: UI component changes
- **Process**: Divides image into blocks and hashes each

### Level 3: Detailed Analysis

#### Structural Hash
- **Speed**: Slower (< 50ms)
- **Accuracy**: High for structural features
- **Use Case**: Detailed structural analysis
- **Process**: Gradient-based structural feature extraction

#### Color Histogram Hash
- **Speed**: Moderate (< 30ms)
- **Accuracy**: Good for color changes
- **Use Case**: Color scheme and palette changes
- **Process**: RGB histogram analysis

#### Gradient Hash
- **Speed**: Moderate (< 40ms)
- **Accuracy**: Good for edge and gradient changes
- **Use Case**: Edge detection and gradient analysis
- **Process**: Gradient magnitude and direction analysis

### Level 4: Semantic Analysis

- **Speed**: API-dependent
- **Accuracy**: Highest (semantic understanding)
- **Use Case**: AI agent validation, semantic difference generation
- **Process**: API-based semantic analysis and change description

## Usage

### Basic Usage

```typescript
import { VisualHasher, progressiveCompare } from 'neuraldiff';

// Initialize with default settings
const hasher = new VisualHasher();

// Progressive comparison
const result = await progressiveCompare(baselineImage, currentImage);

console.log(`Level: ${result.level}`);
console.log(`Similarity: ${result.result.similarity}`);
console.log(`Duration: ${result.totalDuration}ms`);
console.log(`Should Continue: ${result.shouldContinue}`);
```

### Custom Configuration

```typescript
import { VisualHasher, MultiLevelHashOptions } from 'neuraldiff';

const options: MultiLevelHashOptions = {
  level1: {
    algorithm: 'dhash',
    size: 8,
    threshold: 0.95  // Very strict
  },
  level2: {
    algorithm: 'perceptual',
    size: 16,
    threshold: 0.90  // Moderate
  },
  level3: {
    algorithm: 'structural',
    size: 32,
    threshold: 0.85  // Lower threshold
  },
  level4: {
    enabled: true,
    semanticThreshold: 0.80
  }
};

const hasher = new VisualHasher(options);
```

### Individual Hash Generation

```typescript
import { quickHash, perceptualHash, detailedHash } from 'neuraldiff';

// Quick hash for ultra-fast comparison
const quick = await quickHash(imageBuffer);
console.log(`Quick hash: ${quick.hash}`);

// Perceptual hash for better accuracy
const perceptual = await perceptualHash(imageBuffer);
console.log(`Perceptual hash: ${perceptual.hash}`);

// Detailed hash for comprehensive analysis
const detailed = await detailedHash(imageBuffer);
console.log(`Detailed hash: ${detailed.hash}`);
```

### Hash Comparison

```typescript
import { VisualHasher } from 'neuraldiff';

const hasher = new VisualHasher();

// Generate hashes
const hash1 = await hasher.generateHash(image1, 'dhash', 8);
const hash2 = await hasher.generateHash(image2, 'dhash', 8);

// Compare hashes
const comparison = hasher.compareHashes(hash1.hash, hash2.hash, 'dhash');

console.log(`Identical: ${comparison.identical}`);
console.log(`Similarity: ${comparison.similarity}`);
console.log(`Differences: ${comparison.differences?.count}`);
```

## Performance Characteristics

| Algorithm | Size | Speed | Accuracy | Use Case |
|-----------|------|-------|----------|----------|
| average | 8x8 | < 1ms | Low | Identical detection |
| dhash | 8x8 | < 2ms | Medium | Fast screening |
| phash | 8x8 | < 5ms | High | Perceptual matching |
| perceptual | 16x16 | < 10ms | Very High | Minor changes |
| wavelet | 16x16 | < 15ms | High | Structural changes |
| blockhash | 16x16 | < 12ms | High | Component changes |
| structural | 32x32 | < 50ms | Very High | Detailed analysis |
| colorhistogram | 32x32 | < 30ms | High | Color changes |
| gradient | 32x32 | < 40ms | High | Edge changes |

## Integration with AI MCP Tools

The multi-level hashing system is specifically designed for AI agent integration:

### For AI Agents
- **No Browser Access Required**: AI agents can validate visual changes without direct browser access
- **Semantic Difference Generation**: Level 4 provides human-readable change descriptions
- **Confidence Scoring**: Each level provides confidence scores for automated decision making
- **Historical Tracking**: Enables trend analysis and change pattern recognition

### Use Cases
1. **CI/CD Pipeline Validation**: Level 1-2 for fast screening, Level 3-4 for detailed analysis
2. **Design System Regression**: Level 2-3 for component-level change detection
3. **Real-time Monitoring**: Level 1 for instant change detection
4. **AI Agent Validation**: Level 4 for semantic understanding and reporting

## Configuration Options

### Thresholds
- **Level 1**: 0.90-0.99 (very strict, for identical/similar images)
- **Level 2**: 0.80-0.95 (moderate, for minor changes)
- **Level 3**: 0.70-0.90 (lower, for significant changes)
- **Level 4**: 0.60-0.85 (semantic analysis threshold)

### Hash Sizes
- **Level 1**: 8x8 (64 bits) for speed
- **Level 2**: 16x16 (256 bits) for balance
- **Level 3**: 32x32 (1024 bits) for accuracy

### Algorithm Selection
Choose algorithms based on your specific use case:
- **Speed Critical**: Use `dhash` or `average`
- **Accuracy Critical**: Use `perceptual` or `structural`
- **Structural Changes**: Use `wavelet` or `structural`
- **Color Changes**: Use `colorhistogram`
- **Edge Changes**: Use `gradient`

## Best Practices

1. **Start with Level 1**: Always begin with ultra-fast screening
2. **Configure Thresholds**: Adjust thresholds based on your tolerance for false positives/negatives
3. **Monitor Performance**: Track which level your comparisons typically reach
4. **Use Semantic Analysis**: Enable Level 4 for AI agent integration
5. **Cache Results**: Store hash results for repeated comparisons
6. **Batch Processing**: Use the system for batch image comparison

## Error Handling

```typescript
try {
  const result = await progressiveCompare(baselineImage, currentImage);
  // Process result
} catch (error) {
  if (error.message.includes('Hash generation failed')) {
    // Handle hash generation errors
  } else if (error.message.includes('Hamming distance')) {
    // Handle comparison errors
  }
}
```

## Future Enhancements

- **Machine Learning Integration**: ML-based hash optimization
- **GPU Acceleration**: CUDA/WebGL acceleration for faster processing
- **Adaptive Thresholds**: Dynamic threshold adjustment based on image characteristics
- **Multi-Scale Analysis**: Analysis at multiple resolutions
- **Temporal Analysis**: Change detection over time sequences