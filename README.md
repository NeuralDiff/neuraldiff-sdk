# NeuralDiff SDK

[![npm version](https://img.shields.io/npm/v/neuraldiff.svg)](https://www.npmjs.com/package/neuraldiff)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/neuraldiff/neuraldiff-sdk/workflows/CI/badge.svg)](https://github.com/neuraldiff/neuraldiff-sdk/actions)
[![codecov](https://codecov.io/gh/neuraldiff/neuraldiff-sdk/branch/main/graph/badge.svg)](https://codecov.io/gh/neuraldiff/neuraldiff-sdk)

Intelligent visual regression detection for AI-assisted development. NeuralDiff provides sub-second visual comparison with semantic understanding, purpose-built for real-time feedback during active development.

## Why NeuralDiff?

Traditional visual testing tools were designed for batch processing and human review. In the age of AI coding assistants, developers need immediate visual feedback to catch regressions as they code. NeuralDiff bridges this gap with:

- **⚡ Sub-100ms comparison** - Real-time feedback as you code
- **🧠 Semantic understanding** - AI-friendly descriptions of visual changes
- **🔄 Live development mode** - Continuous monitoring during active development
- **🤖 AI-first design** - Optimized for Cursor, GitHub Copilot, and other AI assistants

## Quick Start

```bash
npm install neuraldiff
```

```javascript
import { NeuralDiff } from 'neuraldiff';

const neural = new NeuralDiff({
  apiKey: process.env.NEURALDIFF_API_KEY
});

// Capture baseline
await neural.capture('homepage', {
  url: 'http://localhost:3000',
  viewport: { width: 1280, height: 720 }
});

// Later, check for visual changes
const result = await neural.compare('homepage');

if (result.hasChanges) {
  console.log(`Visual changes detected: ${result.summary}`);
  // AI assistants can parse result.changes for detailed information
}
```

## Core Features

### Real-Time Comparison

```javascript
// Enable live mode for continuous monitoring
const watcher = neural.watch('http://localhost:3000', {
  paths: ['/', '/dashboard', '/profile'],
  onChange: (result) => {
    console.log(`Change detected on ${result.path}: ${result.description}`);
  }
});

// Your AI assistant receives immediate feedback on visual impacts
```

### Semantic Change Analysis

```javascript
const result = await neural.compare('dashboard');

// Returns AI-optimized descriptions
console.log(result.semanticChanges);
// Output: 
// [{
//   element: "navigation",
//   change: "spacing increased",
//   severity: "low",
//   suggestion: "Check responsive breakpoints"
// }]
```

### Framework Integration

```javascript
// React example
import { useNeuralDiff } from 'neuraldiff/react';

function MyComponent() {
  const { captureOnChange } = useNeuralDiff();
  
  useEffect(() => {
    captureOnChange('my-component');
  }, []);
  
  return <div>Your component here</div>;
}
```

## Installation & Setup

### Prerequisites

- Node.js 16.0 or higher
- A NeuralDiff account (free tier available)

### Configuration

Create a `.neuraldiff.json` in your project root:

```json
{
  "project": "my-app",
  "baseUrl": "http://localhost:3000",
  "viewports": [
    { "name": "desktop", "width": 1280, "height": 720 },
    { "name": "mobile", "width": 375, "height": 667 }
  ],
  "ignore": [
    { "selector": ".timestamp" },
    { "selector": "[data-testid='random-content']" }
  ]
}
```

### Environment Variables

```bash
# Required
NEURALDIFF_API_KEY=your_api_key

# Optional
NEURALDIFF_API_URL=https://api.neuraldiff.dev  # For self-hosted instances
NEURALDIFF_CONCURRENCY=5                       # Parallel captures
```

## Advanced Usage

### Custom Comparison Algorithms

```javascript
const neural = new NeuralDiff({
  comparison: {
    algorithm: 'hybrid',  // 'fast', 'accurate', or 'hybrid'
    threshold: 0.01,      // Sensitivity (0-1)
    ignoredRegions: [
      { x: 0, y: 0, width: 100, height: 50 }  // Ignore header timestamps
    ]
  }
});
```

### Batch Operations

```javascript
// Capture multiple pages efficiently
const pages = ['/', '/about', '/contact', '/dashboard'];

const results = await neural.batch(pages.map(path => ({
  name: path.substring(1) || 'home',
  url: `http://localhost:3000${path}`
})));

// Process results
results.forEach(result => {
  console.log(`${result.name}: ${result.status}`);
});
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Visual Regression Check
  uses: neuraldiff/action@v1
  with:
    api-key: ${{ secrets.NEURALDIFF_API_KEY }}
    fail-on-change: true
    update-baseline: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}
```

### Programmatic Baseline Management

```javascript
// Update baselines when changes are intentional
await neural.updateBaseline('homepage');

// Bulk approve changes
await neural.approveAll({
  tag: 'release-v2.0'
});

// Rollback to previous baseline
await neural.rollback('homepage', {
  version: 'previous'
});
```

## API Reference

### Constructor Options

```typescript
interface NeuralDiffOptions {
  apiKey: string;
  apiUrl?: string;
  timeout?: number;
  concurrency?: number;
  comparison?: ComparisonOptions;
  capture?: CaptureOptions;
}
```

### Core Methods

#### `capture(name: string, options?: CaptureOptions): Promise<CaptureResult>`

Captures a screenshot and stores it as a baseline or comparison target.

#### `compare(name: string, options?: CompareOptions): Promise<ComparisonResult>`

Compares current state against baseline, returning detailed change information.

#### `watch(url: string, options?: WatchOptions): Watcher`

Starts continuous monitoring for visual changes during development.

#### `batch(operations: BatchOperation[]): Promise<BatchResult[]>`

Executes multiple operations in parallel for efficiency.

## Integration Guides

- [Next.js Integration](https://docs.neuraldiff.dev/guides/nextjs)
- [React Testing Library](https://docs.neuraldiff.dev/guides/react-testing-library)
- [Playwright Integration](https://docs.neuraldiff.dev/guides/playwright)
- [Cypress Integration](https://docs.neuraldiff.dev/guides/cypress)
- [Storybook Addon](https://docs.neuraldiff.dev/guides/storybook)

## Performance

NeuralDiff is built for speed:

- **Perceptual hashing** for instant rough comparison (5-10ms)
- **Parallel processing** for multiple viewports
- **Smart caching** reduces redundant captures
- **CDN delivery** for baseline images

Benchmark results on standard hardware:
- Single comparison: ~80ms
- 10 parallel comparisons: ~200ms
- Full site scan (50 pages): ~2.5s

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

```bash
# Clone the repository
git clone https://github.com/neuraldiff/neuraldiff-sdk.git

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build
```

## Roadmap

- [ ] Self-hosted deployment options
- [ ] Native mobile app support
- [ ] Figma plugin for design-to-code validation
- [ ] Advanced AI annotations for change analysis
- [ ] Video and animation comparison

## License

MIT © NeuralDiff

## Support

- 📚 [Documentation](https://docs.neuraldiff.dev)
- 💬 [Discord Community](https://discord.gg/neuraldiff)
- 🐛 [Issue Tracker](https://github.com/neuraldiff/neuraldiff-sdk/issues)
- 📧 [Contact](mailto:support@neuraldiff.dev)

---

Built with ❤️ for developers frustrated with slow visual testing