/**
 * CSS Mutation Testing Framework
 *
 * Systematically mutates CSS properties on real pages and measures whether
 * the visual diff pipeline detects each mutation. Produces a "detectability
 * map" that identifies blind spots in visual regression detection.
 *
 * Use cases:
 * 1. Calibrate thresholds per-component: know which regions need stricter monitoring
 * 2. Measure pipeline coverage: what % of possible regressions can we catch?
 * 3. Find fragile elements: components where tiny CSS changes cause large visual diffs
 * 4. Regression test the testing pipeline itself (meta-testing)
 *
 * Patent-relevant: CSS mutation testing for visual regression pipeline calibration
 * is novel — no existing tool systematically mutates styles to measure detectability.
 */

import type {
  VisualProperties,
  ElementFingerprint,
  PageFingerprint,
  StyleDelta,
} from './computed-style-delta';
import { computeStyleDelta, fingerprintElement, fingerprintPage } from './computed-style-delta';

// ============================================================================
// Types
// ============================================================================

/** A single CSS mutation to apply */
export interface CSSMutation {
  /** Target element selector */
  selector: string;
  /** Property to mutate */
  property: keyof VisualProperties;
  /** How to compute the mutated value */
  mutator: MutationType;
  /** Human description */
  description: string;
  /** Expected regression severity if undetected */
  expectedSeverity: 'critical' | 'major' | 'minor' | 'cosmetic';
}

/** Types of mutations we can apply */
export type MutationType =
  | { kind: 'offset'; amount: number }       // Add N to numeric value
  | { kind: 'scale'; factor: number }        // Multiply by factor
  | { kind: 'replace'; value: string | number }  // Replace entirely
  | { kind: 'remove' }                       // Set to default/empty
  ;

/** Result of testing one mutation */
export interface MutationTestResult {
  mutation: CSSMutation;
  /** Was the mutation detected by CSDE? (always true — CSDE is deterministic) */
  detectedByCsde: boolean;
  /** Was the mutation detected by screenshot diff? */
  detectedByScreenshot: boolean;
  /** CSDE severity assessment */
  csdeSeverity: number;
  /** Screenshot similarity score (lower = more detectable) */
  screenshotSimilarity: number;
  /** Time to detect (ms) */
  detectionLatencyMs: number;
}

/** Full mutation test report */
export interface MutationTestReport {
  /** Total mutations tested */
  totalMutations: number;
  /** Detected by CSDE */
  csdeDetected: number;
  /** Detected by screenshot */
  screenshotDetected: number;
  /** Detected by combined pipeline */
  combinedDetected: number;
  /** Coverage by severity level */
  coverageBySeverity: Record<string, { total: number; csde: number; screenshot: number; combined: number }>;
  /** Coverage by property type */
  coverageByProperty: Record<string, { total: number; csde: number; screenshot: number }>;
  /** Individual results */
  results: MutationTestResult[];
  /** Elements with lowest detectability (blind spots) */
  blindSpots: { selector: string; property: string; description: string }[];
}

// ============================================================================
// Mutation Generators
// ============================================================================

/** Standard mutation suite: covers the most common regression types */
export function generateStandardMutations(elements: ElementFingerprint[]): CSSMutation[] {
  const mutations: CSSMutation[] = [];

  for (const el of elements) {
    const sel = el.selector;

    // Geometry mutations (layout shifts)
    mutations.push(
      { selector: sel, property: 'x', mutator: { kind: 'offset', amount: 5 },
        description: `Shift ${sel} right 5px`, expectedSeverity: 'major' },
      { selector: sel, property: 'x', mutator: { kind: 'offset', amount: 20 },
        description: `Shift ${sel} right 20px`, expectedSeverity: 'critical' },
      { selector: sel, property: 'y', mutator: { kind: 'offset', amount: 10 },
        description: `Shift ${sel} down 10px`, expectedSeverity: 'major' },
      { selector: sel, property: 'width', mutator: { kind: 'scale', factor: 1.1 },
        description: `Widen ${sel} by 10%`, expectedSeverity: 'major' },
      { selector: sel, property: 'height', mutator: { kind: 'scale', factor: 0.8 },
        description: `Shrink ${sel} height by 20%`, expectedSeverity: 'critical' },
    );

    // Color mutations
    if (el.props.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      mutations.push(
        { selector: sel, property: 'backgroundColor', mutator: { kind: 'replace', value: 'rgb(255, 0, 0)' },
          description: `Change ${sel} bg to red`, expectedSeverity: 'major' },
      );
    }
    mutations.push(
      { selector: sel, property: 'color', mutator: { kind: 'replace', value: 'rgb(200, 200, 200)' },
        description: `Fade ${sel} text color`, expectedSeverity: 'major' },
    );

    // Typography mutations
    mutations.push(
      { selector: sel, property: 'fontSize', mutator: { kind: 'offset', amount: 2 },
        description: `Increase ${sel} font +2px`, expectedSeverity: 'minor' },
      { selector: sel, property: 'fontSize', mutator: { kind: 'scale', factor: 1.5 },
        description: `Scale ${sel} font 1.5x`, expectedSeverity: 'critical' },
      { selector: sel, property: 'fontFamily', mutator: { kind: 'replace', value: 'Comic Sans MS, cursive' },
        description: `Change ${sel} font to Comic Sans`, expectedSeverity: 'major' },
    );

    // Visibility mutations
    mutations.push(
      { selector: sel, property: 'display', mutator: { kind: 'replace', value: 'none' },
        description: `Hide ${sel} completely`, expectedSeverity: 'critical' },
      { selector: sel, property: 'opacity', mutator: { kind: 'replace', value: 0.3 },
        description: `Reduce ${sel} opacity to 30%`, expectedSeverity: 'major' },
    );

    // Spacing mutations
    mutations.push(
      { selector: sel, property: 'marginTop', mutator: { kind: 'offset', amount: 15 },
        description: `Add 15px top margin to ${sel}`, expectedSeverity: 'major' },
      { selector: sel, property: 'paddingLeft', mutator: { kind: 'offset', amount: 20 },
        description: `Add 20px left padding to ${sel}`, expectedSeverity: 'minor' },
    );
  }

  return mutations;
}

/** Minimal mutation suite for quick sanity checks */
export function generateMinimalMutations(elements: ElementFingerprint[]): CSSMutation[] {
  const mutations: CSSMutation[] = [];

  // Just test each unique element with one critical mutation
  for (const el of elements) {
    mutations.push({
      selector: el.selector,
      property: 'x',
      mutator: { kind: 'offset', amount: 10 },
      description: `Shift ${el.selector} right 10px`,
      expectedSeverity: 'major',
    });
  }

  return mutations;
}

// ============================================================================
// Mutation Application
// ============================================================================

/** Apply a mutation to a fingerprint, returning the mutated version */
export function applyMutation(
  fingerprint: PageFingerprint,
  mutation: CSSMutation,
): PageFingerprint {
  const mutatedElements = fingerprint.elements.map(el => {
    if (el.selector !== mutation.selector) return el;

    const newProps = { ...el.props };
    const oldValue = newProps[mutation.property];

    switch (mutation.mutator.kind) {
      case 'offset':
        if (typeof oldValue === 'number') {
          (newProps as any)[mutation.property] = oldValue + mutation.mutator.amount;
        }
        break;
      case 'scale':
        if (typeof oldValue === 'number') {
          (newProps as any)[mutation.property] = Math.round(oldValue * mutation.mutator.factor);
        }
        break;
      case 'replace':
        (newProps as any)[mutation.property] = mutation.mutator.value;
        break;
      case 'remove':
        if (typeof oldValue === 'number') {
          (newProps as any)[mutation.property] = 0;
        } else {
          (newProps as any)[mutation.property] = '';
        }
        break;
    }

    return fingerprintElement(el.selector, el.tag, el.role, el.textContent, newProps);
  });

  return fingerprintPage(fingerprint.url, fingerprint.viewport, mutatedElements);
}

// ============================================================================
// Mutation Test Runner
// ============================================================================

/**
 * Run the full mutation testing suite.
 *
 * For each mutation:
 * 1. Apply mutation to fingerprint → compute CSDE delta
 * 2. Optionally: apply mutation to screenshot → compute pixel diff
 * 3. Record whether each pipeline detected the change
 *
 * The `screenshotDiffFn` callback is optional — if provided, it runs the
 * screenshot comparison pipeline on the mutated state.
 */
export function runMutationTests(
  baseline: PageFingerprint,
  mutations: CSSMutation[],
  screenshotDiffFn?: (mutation: CSSMutation) => { detected: boolean; similarity: number },
): MutationTestReport {
  const results: MutationTestResult[] = [];
  const coverageBySeverity: MutationTestReport['coverageBySeverity'] = {};
  const coverageByProperty: MutationTestReport['coverageByProperty'] = {};

  let csdeDetected = 0;
  let screenshotDetected = 0;
  let combinedDetected = 0;

  for (const mutation of mutations) {
    const t0 = performance.now();

    // Apply mutation and compute CSDE delta
    const mutated = applyMutation(baseline, mutation);
    const delta = computeStyleDelta(baseline, mutated);
    const detectedByCsde = delta.hasVisualChanges;
    const csdeSeverity = delta.overallSeverity;

    // Screenshot detection (optional callback)
    let detectedByScreenshot = false;
    let screenshotSimilarity = 1.0;
    if (screenshotDiffFn) {
      const ssResult = screenshotDiffFn(mutation);
      detectedByScreenshot = ssResult.detected;
      screenshotSimilarity = ssResult.similarity;
    }

    const latencyMs = performance.now() - t0;

    if (detectedByCsde) csdeDetected++;
    if (detectedByScreenshot) screenshotDetected++;
    if (detectedByCsde || detectedByScreenshot) combinedDetected++;

    results.push({
      mutation,
      detectedByCsde,
      detectedByScreenshot,
      csdeSeverity,
      screenshotSimilarity,
      detectionLatencyMs: latencyMs,
    });

    // Track by severity
    const sev = mutation.expectedSeverity;
    if (!coverageBySeverity[sev]) {
      coverageBySeverity[sev] = { total: 0, csde: 0, screenshot: 0, combined: 0 };
    }
    coverageBySeverity[sev].total++;
    if (detectedByCsde) coverageBySeverity[sev].csde++;
    if (detectedByScreenshot) coverageBySeverity[sev].screenshot++;
    if (detectedByCsde || detectedByScreenshot) coverageBySeverity[sev].combined++;

    // Track by property
    const prop = mutation.property;
    if (!coverageByProperty[prop]) {
      coverageByProperty[prop] = { total: 0, csde: 0, screenshot: 0 };
    }
    coverageByProperty[prop].total++;
    if (detectedByCsde) coverageByProperty[prop].csde++;
    if (detectedByScreenshot) coverageByProperty[prop].screenshot++;
  }

  // Find blind spots: mutations missed by BOTH pipelines
  const blindSpots = results
    .filter(r => !r.detectedByCsde && !r.detectedByScreenshot)
    .map(r => ({
      selector: r.mutation.selector,
      property: r.mutation.property,
      description: r.mutation.description,
    }));

  return {
    totalMutations: mutations.length,
    csdeDetected,
    screenshotDetected,
    combinedDetected,
    coverageBySeverity,
    coverageByProperty,
    results,
    blindSpots,
  };
}

// ============================================================================
// Browser Mutation Script (for real-world mutation testing)
// ============================================================================

/**
 * Playwright script to apply a CSS mutation to a live page.
 * Returns a function string that can be passed to page.evaluate().
 */
export function generateBrowserMutationScript(
  selector: string,
  property: string,
  value: string,
): string {
  return `
    (args) => {
      const el = document.querySelector(args.selector);
      if (!el) return { success: false, error: 'Element not found' };
      const oldValue = getComputedStyle(el)[args.property];
      el.style[args.property] = args.value;
      return { success: true, oldValue, newValue: args.value };
    }
  `;
}

// ============================================================================
// Report Formatting
// ============================================================================

export function formatMutationReport(report: MutationTestReport): string {
  const lines: string[] = [];

  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║  CSS Mutation Testing Report                                ║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Total mutations tested: ${report.totalMutations}`);
  lines.push(`CSDE detected:         ${report.csdeDetected} (${(100 * report.csdeDetected / report.totalMutations).toFixed(1)}%)`);
  lines.push(`Screenshot detected:   ${report.screenshotDetected} (${(100 * report.screenshotDetected / report.totalMutations).toFixed(1)}%)`);
  lines.push(`Combined detected:     ${report.combinedDetected} (${(100 * report.combinedDetected / report.totalMutations).toFixed(1)}%)`);

  lines.push('');
  lines.push('Coverage by Severity:');
  for (const [sev, counts] of Object.entries(report.coverageBySeverity)) {
    const csdeRate = (100 * counts.csde / counts.total).toFixed(0);
    const ssRate = (100 * counts.screenshot / counts.total).toFixed(0);
    const combinedRate = (100 * counts.combined / counts.total).toFixed(0);
    lines.push(`  ${sev.padEnd(10)} ${counts.total} mutations → CSDE=${csdeRate}% SS=${ssRate}% Combined=${combinedRate}%`);
  }

  lines.push('');
  lines.push('Coverage by Property:');
  const sortedProps = Object.entries(report.coverageByProperty)
    .sort((a, b) => (a[1].csde / a[1].total) - (b[1].csde / b[1].total));
  for (const [prop, counts] of sortedProps) {
    const csdeRate = (100 * counts.csde / counts.total).toFixed(0);
    const ssRate = (100 * counts.screenshot / counts.total).toFixed(0);
    lines.push(`  ${prop.padEnd(20)} ${counts.total} mutations → CSDE=${csdeRate}% SS=${ssRate}%`);
  }

  if (report.blindSpots.length > 0) {
    lines.push('');
    lines.push(`BLIND SPOTS (${report.blindSpots.length} undetected mutations):`);
    for (const bs of report.blindSpots.slice(0, 10)) {
      lines.push(`  ⚠ ${bs.description}`);
    }
  }

  return lines.join('\n');
}
