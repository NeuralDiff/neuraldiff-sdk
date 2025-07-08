/**
 * NeuralDiff SDK Type Definitions
 */

export interface NeuralDiffOptions {
    apiKey: string;
    apiUrl?: string;
    timeout?: number;
    concurrency?: number;
    comparison?: ComparisonOptions;
    capture?: Partial<CaptureOptions>;
  }
  
  export interface CaptureOptions {
    url: string;
    viewport?: Viewport;
    fullPage?: boolean;
    waitFor?: string | number;
    headers?: Record<string, string>;
    cookies?: Cookie[];
    userAgent?: string;
    deviceScaleFactor?: number;
    hasTouch?: boolean;
    isLandscape?: boolean;
    isMobile?: boolean;
    javascriptEnabled?: boolean;
    locale?: string;
    timezoneId?: string;
    geolocation?: Geolocation;
    permissions?: string[];
    extraHTTPHeaders?: Record<string, string>;
    httpCredentials?: HTTPCredentials;
    ignoreHTTPSErrors?: boolean;
    offline?: boolean;
    colorScheme?: 'light' | 'dark' | 'no-preference';
    reducedMotion?: 'reduce' | 'no-preference';
    forcedColors?: 'active' | 'none';
  }
  
  export interface CompareOptions {
    algorithm?: 'fast' | 'accurate' | 'hybrid';
    threshold?: number;
    ignoredRegions?: Region[];
    includeAA?: boolean;
    includeAntialiasing?: boolean;
    alpha?: number;
    diffColor?: string;
    diffColorAlt?: string;
    diffMask?: boolean;
  }
  
  export interface ComparisonResult {
    name: string;
    hasChanges: boolean;
    duration: number;
    summary: string;
    changes: SemanticChange[];
    confidence: number;
    diff?: string;
    baseline?: string;
    current?: string;
    metadata?: Record<string, any>;
  }
  
  export interface SemanticChange {
    element: string;
    change: string;
    severity: 'low' | 'medium' | 'high';
    suggestion?: string;
    coordinates?: Region;
    confidence: number;
    type: ChangeType;
  }
  
  export type ChangeType = 
    | 'layout'
    | 'style'
    | 'content'
    | 'visibility'
    | 'position'
    | 'size'
    | 'color'
    | 'typography'
    | 'spacing'
    | 'animation';
  
  export interface WatchOptions {
    paths?: string[];
    interval?: number;
    viewport?: Viewport;
    onChange?: (result: WatchResult) => void;
    onError?: (error: Error) => void;
    includeStyles?: boolean;
    includeDOMChanges?: boolean;
  }
  
  export interface Watcher {
    id: string;
    stop: () => void;
  }
  
  export interface WatchResult {
    path: string;
    timestamp: number;
    hasChanges: boolean;
    description: string;
    severity: 'low' | 'medium' | 'high';
    changes?: SemanticChange[];
  }
  
  export interface BatchOperation {
    type: 'capture' | 'compare';
    name: string;
    options?: CaptureOptions | CompareOptions;
  }
  
  export interface BatchResult {
    name: string;
    type: 'capture' | 'compare';
    status: 'success' | 'error';
    error?: string;
    result?: CaptureResult | ComparisonResult;
  }
  
  export interface CaptureResult {
    id: string;
    name: string;
    status: 'captured' | 'error';
    timestamp: number;
    hash: string;
    metadata?: Record<string, any>;
  }
  
  export interface Viewport {
    width: number;
    height: number;
    deviceScaleFactor?: number;
    isMobile?: boolean;
    hasTouch?: boolean;
    isLandscape?: boolean;
  }
  
  export interface Cookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }
  
  export interface Geolocation {
    latitude: number;
    longitude: number;
    accuracy?: number;
  }
  
  export interface HTTPCredentials {
    username: string;
    password: string;
  }
  
  export interface Region {
    x: number;
    y: number;
    width: number;
    height: number;
  }
  
  export interface PerceptualHashOptions {
    algorithm?: 'average' | 'perceptual' | 'difference' | 'wavelet';
    hashSize?: number;
    highFrequencyFactor?: number;
  }
  
  export interface ImageProcessingOptions {
    resize?: boolean;
    normalize?: boolean;
    grayscale?: boolean;
    blur?: number;
    sharpen?: number;
    contrast?: number;
    brightness?: number;
  }
  
  export interface SemanticAnalysisOptions {
    includeAccessibility?: boolean;
    includeSEO?: boolean;
    includePerformance?: boolean;
    customRules?: CustomRule[];
  }
  
  export interface CustomRule {
    name: string;
    selector: string;
    validate: (element: any) => boolean;
    message: string;
    severity: 'low' | 'medium' | 'high';
  }
  
  export interface ConfigFile {
    project?: string;
    baseUrl?: string;
    viewports?: Viewport[];
    ignore?: IgnoreRule[];
    capture?: Partial<CaptureOptions>;
    comparison?: Partial<CompareOptions>;
  }
  
  export interface IgnoreRule {
    selector?: string;
    region?: Region;
    type?: 'dynamic' | 'animated' | 'advertisement';
  }