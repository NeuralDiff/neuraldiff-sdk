/**
 * Multi-Level Visual Hashing Example
 * 
 * This example demonstrates the progressive visual hashing system that starts
 * with ultra-fast millisecond-level comparisons and escalates to more detailed
 * analysis when changes are detected.
 */

import { 
  VisualHasher, 
  progressiveCompare, 
  quickHash, 
  perceptualHash, 
  detailedHash,
  MultiLevelHashOptions 
} from '../src/hashing';

async function demonstrateMultiLevelHashing() {
  console.log('🚀 Multi-Level Visual Hashing Demo\n');

  // Initialize the visual hasher with custom options
  const hasher = new VisualHasher({
    level1: {
      algorithm: 'dhash',
      size: 8,
      threshold: 0.95  // Very strict for ultra-fast comparison
    },
    level2: {
      algorithm: 'perceptual',
      size: 16,
      threshold: 0.90  // Moderate threshold for perceptual hashing
    },
    level3: {
      algorithm: 'structural',
      size: 32,
      threshold: 0.85  // Lower threshold for detailed analysis
    },
    level4: {
      enabled: true,
      semanticThreshold: 0.80  // API-based semantic analysis
    }
  });

  // Simulate image buffers (in real usage, these would be actual image data)
  const baselineImage = Buffer.from('fake-image-data-baseline');
  const currentImage = Buffer.from('fake-image-data-current');
  const changedImage = Buffer.from('fake-image-data-changed');

  console.log('📊 Stage 1: Individual Hash Generation');
  console.log('=====================================');

  // Generate different types of hashes
  try {
    const quickHashResult = await quickHash(baselineImage);
    console.log(`✅ Quick Hash (dhash): ${quickHashResult.hash.substring(0, 16)}...`);
    console.log(`   Duration: ${quickHashResult.duration}ms`);
    console.log(`   Confidence: ${quickHashResult.confidence}\n`);

    const perceptualHashResult = await perceptualHash(baselineImage);
    console.log(`✅ Perceptual Hash: ${perceptualHashResult.hash.substring(0, 16)}...`);
    console.log(`   Duration: ${perceptualHashResult.duration}ms`);
    console.log(`   Confidence: ${perceptualHashResult.confidence}\n`);

    const detailedHashResult = await detailedHash(baselineImage);
    console.log(`✅ Detailed Hash (structural): ${detailedHashResult.hash.substring(0, 16)}...`);
    console.log(`   Duration: ${detailedHashResult.duration}ms`);
    console.log(`   Confidence: ${detailedHashResult.confidence}\n`);

  } catch (error) {
    console.log('⚠️  Hash generation skipped (using mock data)');
  }

  console.log('🔄 Stage 2: Progressive Comparison Demo');
  console.log('======================================');

  // Demo 1: Identical images (should stop at level 1)
  console.log('\n📸 Scenario 1: Identical Images');
  console.log('Expected: Stop at Level 1 (ultra-fast)');
  
  try {
    const identicalResult = await progressiveCompare(baselineImage, baselineImage);
    console.log(`✅ Result: Level ${identicalResult.level}`);
    console.log(`   Similarity: ${identicalResult.result.similarity.toFixed(3)}`);
    console.log(`   Duration: ${identicalResult.totalDuration}ms`);
    console.log(`   Should Continue: ${identicalResult.shouldContinue}`);
    console.log(`   Algorithm: ${identicalResult.result.algorithm}`);
  } catch (error) {
    console.log('⚠️  Comparison skipped (using mock data)');
  }

  // Demo 2: Similar images (should stop at level 2)
  console.log('\n📸 Scenario 2: Similar Images (Minor Changes)');
  console.log('Expected: Stop at Level 2 (perceptual)');
  
  try {
    const similarResult = await progressiveCompare(baselineImage, currentImage);
    console.log(`✅ Result: Level ${similarResult.level}`);
    console.log(`   Similarity: ${similarResult.result.similarity.toFixed(3)}`);
    console.log(`   Duration: ${similarResult.totalDuration}ms`);
    console.log(`   Should Continue: ${similarResult.shouldContinue}`);
    console.log(`   Algorithm: ${similarResult.result.algorithm}`);
  } catch (error) {
    console.log('⚠️  Comparison skipped (using mock data)');
  }

  // Demo 3: Different images (should go to level 3 or 4)
  console.log('\n📸 Scenario 3: Different Images (Major Changes)');
  console.log('Expected: Continue to Level 3 or 4 (detailed/semantic)');
  
  try {
    const differentResult = await progressiveCompare(baselineImage, changedImage);
    console.log(`✅ Result: Level ${differentResult.level}`);
    console.log(`   Similarity: ${differentResult.result.similarity.toFixed(3)}`);
    console.log(`   Duration: ${differentResult.totalDuration}ms`);
    console.log(`   Should Continue: ${differentResult.shouldContinue}`);
    console.log(`   Algorithm: ${differentResult.result.algorithm}`);
    
    if (differentResult.result.differences) {
      console.log(`   Differences: ${differentResult.result.differences.count} positions`);
      console.log(`   Severity: ${differentResult.result.differences.severity}`);
    }
  } catch (error) {
    console.log('⚠️  Comparison skipped (using mock data)');
  }

  console.log('\n🎯 Stage 3: Performance Comparison');
  console.log('================================');

  // Compare performance of different algorithms
  const algorithms = ['average', 'dhash', 'phash', 'perceptual', 'structural'];
  const sizes = [8, 16, 32];

  console.log('\nAlgorithm Performance (simulated):');
  console.log('Algorithm    | Size | Duration | Confidence');
  console.log('-------------|------|----------|-----------');

  algorithms.forEach(algorithm => {
    sizes.forEach(size => {
      const duration = Math.random() * 10 + 1; // Simulated duration
      const confidence = 0.8 + Math.random() * 0.2; // Simulated confidence
      console.log(`${algorithm.padEnd(12)} | ${size.toString().padStart(4)} | ${duration.toFixed(1).padStart(8)}ms | ${confidence.toFixed(3)}`);
    });
  });

  console.log('\n💡 Stage 4: Use Cases & Benefits');
  console.log('===============================');

  console.log(`
🎯 Use Cases:
• Real-time visual monitoring (Level 1: <1ms)
• CI/CD pipeline validation (Level 2: <10ms)
• Design system regression testing (Level 3: <100ms)
• AI agent change validation (Level 4: API-based)

⚡ Benefits:
• Ultra-fast initial screening prevents unnecessary detailed analysis
• Progressive accuracy ensures no false positives
• Configurable thresholds for different use cases
• Semantic analysis integration for AI tools

🔧 Integration with AI MCP Tools:
• AI agents can validate visual changes without browser access
• Semantic difference generation for human-readable reports
• Confidence scoring for automated decision making
• Historical change tracking and trend analysis
  `);

  console.log('✅ Multi-Level Visual Hashing Demo Complete!');
}

// Performance benchmarking function
async function benchmarkHashingPerformance() {
  console.log('\n📈 Performance Benchmarking');
  console.log('==========================');

  const hasher = new VisualHasher();
  const testImage = Buffer.from('test-image-data');
  const iterations = 100;

  const algorithms = [
    { name: 'average', size: 8 },
    { name: 'dhash', size: 8 },
    { name: 'phash', size: 8 },
    { name: 'perceptual', size: 16 },
    { name: 'structural', size: 32 }
  ];

  console.log('\nAlgorithm | Avg Duration | Min Duration | Max Duration');
  console.log('----------|---------------|--------------|--------------');

  for (const algo of algorithms) {
    const durations: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      try {
        const start = Date.now();
        await hasher.generateHash(testImage, algo.name, algo.size);
        durations.push(Date.now() - start);
      } catch (error) {
        // Skip benchmarking with mock data
        break;
      }
    }

    if (durations.length > 0) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const min = Math.min(...durations);
      const max = Math.max(...durations);
      
      console.log(`${algo.name.padEnd(9)} | ${avg.toFixed(2).padStart(11)}ms | ${min.toString().padStart(11)}ms | ${max.toString().padStart(11)}ms`);
    }
  }
}

// Main execution
async function main() {
  try {
    await demonstrateMultiLevelHashing();
    await benchmarkHashingPerformance();
  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  main();
}

export { demonstrateMultiLevelHashing, benchmarkHashingPerformance };