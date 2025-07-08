/**
 * NeuralDiff SDK - React Integration
 * React-specific components and hooks for visual regression testing
 */

import React from 'react';
import { NeuroSpec } from './index';
import type { NeuralDiffOptions, CaptureOptions, CompareOptions } from './types';

// React hook for using NeuralDiff in components
export function useNeuralDiff(options: NeuralDiffOptions) {
  const [neuroSpec] = React.useState(() => new NeuroSpec(options));
  
  React.useEffect(() => {
    return () => {
      // Cleanup WebSocket connections on unmount
      neuroSpec.removeAllListeners();
    };
  }, [neuroSpec]);

  return neuroSpec;
}

// React hook for capturing screenshots
export function useCapture(neuroSpec: NeuroSpec) {
  const [isCapturing, setIsCapturing] = React.useState(false);
  const [lastCapture, setLastCapture] = React.useState<any>(null);

  const capture = React.useCallback(async (name: string, options?: CaptureOptions) => {
    setIsCapturing(true);
    try {
      const result = await neuroSpec.capture(name, options);
      setLastCapture(result);
      return result;
    } finally {
      setIsCapturing(false);
    }
  }, [neuroSpec]);

  return { capture, isCapturing, lastCapture };
}

// React hook for comparing screenshots
export function useCompare(neuroSpec: NeuroSpec) {
  const [isComparing, setIsComparing] = React.useState(false);
  const [lastComparison, setLastComparison] = React.useState<any>(null);

  const compare = React.useCallback(async (name: string, options?: CompareOptions) => {
    setIsComparing(true);
    try {
      const result = await neuroSpec.compare(name, options);
      setLastComparison(result);
      return result;
    } finally {
      setIsComparing(false);
    }
  }, [neuroSpec]);

  return { compare, isComparing, lastComparison };
}

// Re-export main SDK
export { NeuroSpec } from './index';
export type { NeuralDiffOptions, CaptureOptions, CompareOptions } from './types'; 