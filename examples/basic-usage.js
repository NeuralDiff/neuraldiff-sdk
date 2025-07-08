/**
 * NeuralDiff Basic Usage Example
 * 
 * This example demonstrates core functionality of the NeuralDiff SDK
 * including capture, comparison, and real-time monitoring.
 */

import { NeuralDiff } from 'neuraldiff';

// Initialize NeuralDiff with your API key
const neural = new NeuralDiff({
    apiKey: process.env.NEURALDIFF_API_KEY || 'your-api-key-here'
});

async function basicExample() {
    console.log('🧠 NeuralDiff Basic Example\n');

    try {
        // 1. Capture a baseline screenshot
        console.log('📸 Capturing baseline...');
        const captureResult = await neural.capture('homepage', {
            url: 'https://example.com',
            viewport: { width: 1280, height: 720 }
        });
        console.log(`✅ Baseline captured: ${captureResult.id}\n`);

        // 2. Simulate some changes (in real app, this would be actual changes)
        console.log('⏳ Simulating changes...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Compare against baseline
        console.log('🔍 Comparing current state with baseline...');
        const comparison = await neural.compare('homepage');

        if (comparison.hasChanges) {
            console.log(`⚠️  Changes detected in ${comparison.duration}ms:`);
            console.log(`   Summary: ${comparison.summary}`);
            console.log(`   Confidence: ${(comparison.confidence * 100).toFixed(1)}%`);

            // Display semantic changes
            comparison.changes.forEach(change => {
                console.log(`   
   - ${change.element}: ${change.change}
     Severity: ${change.severity}
     ${change.suggestion ? `Suggestion: ${change.suggestion}` : ''}`);
            });
        } else {
            console.log(`✅ No changes detected (${comparison.duration}ms)\n`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

async function watchExample() {
    console.log('\n👁️  NeuralDiff Watch Mode Example\n');

    // Start watching for changes
    const watcher = neural.watch('https://localhost:3000', {
        paths: ['/', '/about', '/contact'],
        onChange: (result) => {
            console.log(`🔄 Change detected on ${result.path}:`);
            console.log(`   ${result.description}`);
            console.log(`   Severity: ${result.severity}`);

            if (result.changes) {
                result.changes.forEach(change => {
                    console.log(`   - ${change.element}: ${change.change}`);
                });
            }
        },
        onError: (error) => {
            console.error('❌ Watch error:', error.message);
        }
    });

    console.log('👀 Watching for changes... (press Ctrl+C to stop)\n');

    // Stop watching after 30 seconds (in real app, this would be on-demand)
    setTimeout(() => {
        watcher.stop();
        console.log('\n✋ Stopped watching');
    }, 30000);
}

async function batchExample() {
    console.log('\n🚀 NeuralDiff Batch Operations Example\n');

    const pages = [
        { name: 'home', url: 'https://example.com' },
        { name: 'about', url: 'https://example.com/about' },
        { name: 'products', url: 'https://example.com/products' },
        { name: 'contact', url: 'https://example.com/contact' }
    ];

    // Capture multiple pages in parallel
    console.log('📸 Capturing multiple pages...');
    const captureOps = pages.map(page => ({
        type: 'capture',
        name: page.name,
        options: { url: page.url }
    }));

    const captureResults = await neural.batch(captureOps);

    captureResults.forEach(result => {
        if (result.status === 'success') {
            console.log(`✅ ${result.name}: Captured successfully`);
        } else {
            console.log(`❌ ${result.name}: ${result.error}`);
        }
    });

    // Compare all pages
    console.log('\n🔍 Comparing all pages...');
    const compareOps = pages.map(page => ({
        type: 'compare',
        name: page.name
    }));

    const compareResults = await neural.batch(compareOps);

    let changesDetected = 0;
    compareResults.forEach(result => {
        if (result.status === 'success' && result.result.hasChanges) {
            changesDetected++;
            console.log(`⚠️  ${result.name}: ${result.result.summary}`);
        } else if (result.status === 'success') {
            console.log(`✅ ${result.name}: No changes`);
        } else {
            console.log(`❌ ${result.name}: ${result.error}`);
        }
    });

    console.log(`\n📊 Summary: ${changesDetected} pages with changes out of ${pages.length}`);
}

// Run examples
async function runExamples() {
    await basicExample();
    // await watchExample();  // Uncomment to run watch example
    await batchExample();
}

runExamples().catch(console.error);