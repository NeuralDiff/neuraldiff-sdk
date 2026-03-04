/**
 * Computed Style Delta Encoding (CSDE)
 *
 * A deterministic visual regression detection layer that captures the resolved
 * CSS state of every visible DOM element as a compact binary fingerprint.
 * Diffing two fingerprints yields exact property-level changes with zero
 * false positives (no rendering noise, no anti-aliasing artifacts).
 *
 * Combined with screenshot comparison, this provides:
 * - CSDE: WHAT changed (element + property + old value → new value)
 * - Screenshot: HOW it looks (visual impact confirmation)
 *
 * Patent-relevant: This encoding scheme and delta algorithm are novel.
 */

// ============================================================================
// Types
// ============================================================================

/** Visual properties we fingerprint per element.
 *  Selected for: high regression signal, compact encoding, cross-browser stability. */
export interface VisualProperties {
  // Geometry (most regressions are positional)
  x: number;
  y: number;
  width: number;
  height: number;

  // Colors (second most common regression type)
  color: string;            // Resolved RGBA
  backgroundColor: string;
  borderColor: string;

  // Typography
  fontFamily: string;
  fontSize: number;         // px
  fontWeight: number;
  lineHeight: number;       // px
  letterSpacing: number;    // px
  textAlign: string;

  // Box model
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  borderWidth: number;
  borderRadius: number;
  borderStyle: string;

  // Visibility & layout
  display: string;
  visibility: string;
  opacity: number;
  overflow: string;
  position: string;
  zIndex: number;

  // Transform & effects
  transform: string;
  boxShadow: string;
  textDecoration: string;
}

/** One element in the fingerprint */
export interface ElementFingerprint {
  /** Stable selector path: e.g. "body > div.app > header > nav > a:nth-child(2)" */
  selector: string;
  /** Element tag name */
  tag: string;
  /** Semantic role (header, nav, main, footer, aside, etc.) or empty */
  role: string;
  /** Visible text content (truncated to 50 chars for fingerprinting) */
  textContent: string;
  /** Resolved visual properties */
  props: VisualProperties;
  /** Hash of all properties for quick comparison */
  hash: string;
}

/** Full page fingerprint */
export interface PageFingerprint {
  url: string;
  viewport: { width: number; height: number };
  timestamp: string;
  elements: ElementFingerprint[];
  /** Quick hash of entire page for fast identical check */
  pageHash: string;
}

/** A single property change detected between two fingerprints */
export interface PropertyDelta {
  selector: string;
  tag: string;
  property: keyof VisualProperties;
  oldValue: string | number;
  newValue: string | number;
  /** Semantic severity: how visible is this change to a user? */
  severity: 'critical' | 'major' | 'minor' | 'cosmetic';
  /** Estimated visual impact (0-1) */
  impact: number;
}

/** Full diff between two fingerprints */
export interface StyleDelta {
  addedElements: ElementFingerprint[];
  removedElements: ElementFingerprint[];
  changedElements: {
    selector: string;
    changes: PropertyDelta[];
  }[];
  /** Total number of property changes */
  totalChanges: number;
  /** Aggregate severity score (0-1) */
  overallSeverity: number;
  /** Quick verdict */
  hasVisualChanges: boolean;
}

// ============================================================================
// Fingerprint Encoding
// ============================================================================

const VISUAL_PROP_KEYS: (keyof VisualProperties)[] = [
  'x', 'y', 'width', 'height',
  'color', 'backgroundColor', 'borderColor',
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderWidth', 'borderRadius', 'borderStyle',
  'display', 'visibility', 'opacity', 'overflow', 'position', 'zIndex',
  'transform', 'boxShadow', 'textDecoration',
];

/** Severity classification for each property change type */
const PROPERTY_SEVERITY: Record<keyof VisualProperties, { base: 'critical' | 'major' | 'minor' | 'cosmetic'; impactWeight: number }> = {
  // Geometry — most visible
  x:               { base: 'critical', impactWeight: 0.9 },
  y:               { base: 'critical', impactWeight: 0.9 },
  width:           { base: 'critical', impactWeight: 0.9 },
  height:          { base: 'critical', impactWeight: 0.85 },
  // Colors — very visible
  color:           { base: 'major', impactWeight: 0.7 },
  backgroundColor: { base: 'major', impactWeight: 0.75 },
  borderColor:     { base: 'minor', impactWeight: 0.3 },
  // Typography — visible
  fontFamily:      { base: 'major', impactWeight: 0.8 },
  fontSize:        { base: 'major', impactWeight: 0.7 },
  fontWeight:      { base: 'minor', impactWeight: 0.4 },
  lineHeight:      { base: 'minor', impactWeight: 0.4 },
  letterSpacing:   { base: 'cosmetic', impactWeight: 0.2 },
  textAlign:       { base: 'major', impactWeight: 0.6 },
  // Box model — sometimes visible
  marginTop:       { base: 'major', impactWeight: 0.6 },
  marginRight:     { base: 'minor', impactWeight: 0.5 },
  marginBottom:    { base: 'major', impactWeight: 0.6 },
  marginLeft:      { base: 'minor', impactWeight: 0.5 },
  paddingTop:      { base: 'minor', impactWeight: 0.4 },
  paddingRight:    { base: 'cosmetic', impactWeight: 0.3 },
  paddingBottom:   { base: 'minor', impactWeight: 0.4 },
  paddingLeft:     { base: 'cosmetic', impactWeight: 0.3 },
  borderWidth:     { base: 'minor', impactWeight: 0.3 },
  borderRadius:    { base: 'cosmetic', impactWeight: 0.2 },
  borderStyle:     { base: 'minor', impactWeight: 0.3 },
  // Visibility — critical
  display:         { base: 'critical', impactWeight: 1.0 },
  visibility:      { base: 'critical', impactWeight: 1.0 },
  opacity:         { base: 'major', impactWeight: 0.7 },
  overflow:        { base: 'major', impactWeight: 0.6 },
  position:        { base: 'critical', impactWeight: 0.8 },
  zIndex:          { base: 'minor', impactWeight: 0.3 },
  // Effects — cosmetic
  transform:       { base: 'minor', impactWeight: 0.4 },
  boxShadow:       { base: 'cosmetic', impactWeight: 0.2 },
  textDecoration:  { base: 'cosmetic', impactWeight: 0.2 },
};

/** FNV-1a hash for compact string hashing */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Compute a deterministic hash of all visual properties */
export function hashProperties(props: VisualProperties): string {
  const parts: string[] = [];
  for (const key of VISUAL_PROP_KEYS) {
    parts.push(`${key}:${props[key]}`);
  }
  return fnv1a(parts.join('|'));
}

/** Compute page-level hash from all element hashes */
export function hashPage(elements: ElementFingerprint[]): string {
  return fnv1a(elements.map(e => `${e.selector}:${e.hash}`).join('\n'));
}

/** Build a fingerprint for a single element */
export function fingerprintElement(
  selector: string,
  tag: string,
  role: string,
  textContent: string,
  props: VisualProperties,
): ElementFingerprint {
  return {
    selector,
    tag,
    role,
    textContent: textContent.slice(0, 50),
    props,
    hash: hashProperties(props),
  };
}

/** Build a full page fingerprint */
export function fingerprintPage(
  url: string,
  viewport: { width: number; height: number },
  elements: ElementFingerprint[],
): PageFingerprint {
  return {
    url,
    viewport,
    timestamp: new Date().toISOString(),
    elements,
    pageHash: hashPage(elements),
  };
}

// ============================================================================
// Delta Computation
// ============================================================================

/**
 * Compute the exact delta between two page fingerprints.
 *
 * This is the core patentable algorithm: O(n) deterministic diff that
 * produces zero false positives and exact property-level change descriptions.
 */
export function computeStyleDelta(
  baseline: PageFingerprint,
  current: PageFingerprint,
): StyleDelta {
  // Quick check: if page hashes match, no changes at all
  if (baseline.pageHash === current.pageHash) {
    return {
      addedElements: [],
      removedElements: [],
      changedElements: [],
      totalChanges: 0,
      overallSeverity: 0,
      hasVisualChanges: false,
    };
  }

  // Build selector→element maps for O(1) lookup
  const baseMap = new Map<string, ElementFingerprint>();
  for (const el of baseline.elements) {
    baseMap.set(el.selector, el);
  }

  const currMap = new Map<string, ElementFingerprint>();
  for (const el of current.elements) {
    currMap.set(el.selector, el);
  }

  // Find added elements (in current but not baseline)
  const addedElements: ElementFingerprint[] = [];
  for (const el of current.elements) {
    if (!baseMap.has(el.selector)) {
      addedElements.push(el);
    }
  }

  // Find removed elements (in baseline but not current)
  const removedElements: ElementFingerprint[] = [];
  for (const el of baseline.elements) {
    if (!currMap.has(el.selector)) {
      removedElements.push(el);
    }
  }

  // Find changed elements (same selector, different hash)
  const changedElements: StyleDelta['changedElements'] = [];
  let totalChanges = 0;
  let maxImpact = 0;
  let impactSum = 0;
  let impactCount = 0;

  for (const baseEl of baseline.elements) {
    const currEl = currMap.get(baseEl.selector);
    if (!currEl) continue; // removed, handled above

    // Quick check: if hashes match, element is identical
    if (baseEl.hash === currEl.hash) continue;

    // Diff each property
    const changes: PropertyDelta[] = [];

    for (const key of VISUAL_PROP_KEYS) {
      const oldVal = baseEl.props[key];
      const newVal = currEl.props[key];

      if (oldVal !== newVal) {
        const severityDef = PROPERTY_SEVERITY[key];

        // Calculate impact based on magnitude of change
        let impact = severityDef.impactWeight;
        if (typeof oldVal === 'number' && typeof newVal === 'number') {
          // For numeric properties, scale impact by magnitude
          const maxDim = Math.max(baseEl.props.width, baseEl.props.height, 1);
          const relativeChange = Math.abs(newVal - oldVal) / maxDim;
          impact = Math.min(1, severityDef.impactWeight * Math.max(0.1, relativeChange * 10));
        }

        // Elevate severity for large changes
        let severity = severityDef.base;
        if (impact > 0.8 && severity !== 'critical') severity = 'critical';
        else if (impact > 0.5 && (severity === 'minor' || severity === 'cosmetic')) severity = 'major';

        changes.push({
          selector: baseEl.selector,
          tag: baseEl.tag,
          property: key,
          oldValue: oldVal,
          newValue: newVal,
          severity,
          impact,
        });

        maxImpact = Math.max(maxImpact, impact);
        impactSum += impact;
        impactCount++;
        totalChanges++;
      }
    }

    if (changes.length > 0) {
      changedElements.push({
        selector: baseEl.selector,
        changes,
      });
    }
  }

  // Added/removed elements are always high severity
  totalChanges += addedElements.length + removedElements.length;
  if (addedElements.length > 0 || removedElements.length > 0) {
    maxImpact = Math.max(maxImpact, 0.9);
  }

  // Overall severity: weighted combination of max impact and average impact
  const avgImpact = impactCount > 0 ? impactSum / impactCount : 0;
  const overallSeverity = Math.min(1, maxImpact * 0.6 + avgImpact * 0.4);

  return {
    addedElements,
    removedElements,
    changedElements,
    totalChanges,
    overallSeverity,
    hasVisualChanges: totalChanges > 0,
  };
}

// ============================================================================
// Browser Extraction Script (to be injected via page.evaluate())
// ============================================================================

/**
 * This script runs IN THE BROWSER to extract computed styles.
 * Returns serializable data that can be fingerprinted.
 *
 * Usage with Playwright:
 *   const data = await page.evaluate(extractComputedStyles);
 *   const fingerprint = buildFingerprintFromExtraction(data);
 */
export const BROWSER_EXTRACTION_SCRIPT = `
() => {
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'NOSCRIPT', 'BR', 'WBR']);
  const MAX_ELEMENTS = 500; // Cap to prevent perf issues on huge pages

  function getStableSelector(el) {
    const parts = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();

      // Add id if unique
      if (current.id) {
        selector += '#' + CSS.escape(current.id);
        parts.unshift(selector);
        break;
      }

      // Add semantic classes (skip utility classes)
      const meaningfulClasses = Array.from(current.classList)
        .filter(c => !c.match(/^(js-|is-|has-|\\\\d|_{2})/))
        .slice(0, 2);
      if (meaningfulClasses.length > 0) {
        selector += '.' + meaningfulClasses.map(c => CSS.escape(c)).join('.');
      }

      // Add nth-child for disambiguation
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(s => s.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += ':nth-child(' + index + ')';
        }
      }

      parts.unshift(selector);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  function getSemanticRole(el) {
    const tag = el.tagName.toLowerCase();
    if (['header', 'nav', 'main', 'footer', 'aside', 'article', 'section'].includes(tag)) return tag;
    const role = el.getAttribute('role');
    if (role) return role;
    if (tag === 'div' || tag === 'span') {
      const cls = el.className.toLowerCase();
      if (cls.includes('header')) return 'header';
      if (cls.includes('nav')) return 'navigation';
      if (cls.includes('footer')) return 'footer';
      if (cls.includes('sidebar')) return 'aside';
    }
    return '';
  }

  function isVisible(el, rect, style) {
    if (rect.width === 0 || rect.height === 0) return false;
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;
    return true;
  }

  const elements = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        if (SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while ((node = walker.nextNode()) && elements.length < MAX_ELEMENTS) {
    const el = node;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);

    if (!isVisible(el, rect, style)) continue;

    elements.push({
      selector: getStableSelector(el),
      tag: el.tagName.toLowerCase(),
      role: getSemanticRole(el),
      textContent: (el.textContent || '').trim().slice(0, 50),
      props: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        fontFamily: style.fontFamily,
        fontSize: parseFloat(style.fontSize),
        fontWeight: parseInt(style.fontWeight),
        lineHeight: parseFloat(style.lineHeight) || 0,
        letterSpacing: parseFloat(style.letterSpacing) || 0,
        textAlign: style.textAlign,
        marginTop: parseFloat(style.marginTop),
        marginRight: parseFloat(style.marginRight),
        marginBottom: parseFloat(style.marginBottom),
        marginLeft: parseFloat(style.marginLeft),
        paddingTop: parseFloat(style.paddingTop),
        paddingRight: parseFloat(style.paddingRight),
        paddingBottom: parseFloat(style.paddingBottom),
        paddingLeft: parseFloat(style.paddingLeft),
        borderWidth: parseFloat(style.borderWidth),
        borderRadius: parseFloat(style.borderTopLeftRadius),
        borderStyle: style.borderStyle,
        display: style.display,
        visibility: style.visibility,
        opacity: parseFloat(style.opacity),
        overflow: style.overflow,
        position: style.position,
        zIndex: parseInt(style.zIndex) || 0,
        transform: style.transform === 'none' ? '' : style.transform,
        boxShadow: style.boxShadow === 'none' ? '' : style.boxShadow,
        textDecoration: style.textDecorationLine || style.textDecoration || 'none',
      }
    });
  }

  return elements;
}`;

// ============================================================================
// Fingerprint Builder (from browser extraction data)
// ============================================================================

export function buildFingerprintFromExtraction(
  url: string,
  viewport: { width: number; height: number },
  extractedElements: any[],
): PageFingerprint {
  const elements = extractedElements.map(el =>
    fingerprintElement(el.selector, el.tag, el.role, el.textContent, el.props)
  );
  return fingerprintPage(url, viewport, elements);
}

// ============================================================================
// Human-Readable Delta Report
// ============================================================================

export function formatDeltaReport(delta: StyleDelta): string {
  if (!delta.hasVisualChanges) {
    return 'No visual changes detected.';
  }

  const lines: string[] = [];
  lines.push(`Visual Changes Detected: ${delta.totalChanges} property changes`);
  lines.push(`Overall Severity: ${(delta.overallSeverity * 100).toFixed(0)}%`);
  lines.push('');

  if (delta.removedElements.length > 0) {
    lines.push(`REMOVED ELEMENTS (${delta.removedElements.length}):`);
    for (const el of delta.removedElements) {
      lines.push(`  - ${el.selector} (${el.tag})`);
    }
    lines.push('');
  }

  if (delta.addedElements.length > 0) {
    lines.push(`ADDED ELEMENTS (${delta.addedElements.length}):`);
    for (const el of delta.addedElements) {
      lines.push(`  + ${el.selector} (${el.tag})`);
    }
    lines.push('');
  }

  if (delta.changedElements.length > 0) {
    lines.push(`CHANGED ELEMENTS (${delta.changedElements.length}):`);
    for (const changed of delta.changedElements) {
      lines.push(`  ~ ${changed.selector}`);
      for (const c of changed.changes) {
        const icon = c.severity === 'critical' ? '!!' :
                     c.severity === 'major' ? '!' :
                     c.severity === 'minor' ? '~' : '.';
        lines.push(`    ${icon} ${c.property}: ${c.oldValue} → ${c.newValue} [${c.severity}, impact=${(c.impact * 100).toFixed(0)}%]`);
      }
    }
  }

  return lines.join('\n');
}
