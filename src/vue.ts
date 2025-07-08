/**
 * NeuralDiff SDK - Vue Integration
 * Vue-specific composables for visual regression testing
 */

import { ref, onUnmounted } from 'vue';
import { NeuroSpec } from './index';
import type { NeuralDiffOptions, CaptureOptions, CompareOptions, ComparisonResult } from './types';

// Vue composable for using NeuralDiff
export function useNeuralDiff(options: NeuralDiffOptions) {
  const neuroSpec = ref(new NeuroSpec(options));
  
  onUnmounted(() => {
    // Cleanup WebSocket connections on unmount
    neuroSpec.value.removeAllListeners();
  });

  return neuroSpec;
}

// Vue composable for capturing screenshots
export function useCapture(neuroSpec: NeuroSpec) {
  const isCapturing = ref(false);
  const lastCapture = ref<any>(null);

  const capture = async (name: string, options?: CaptureOptions) => {
    isCapturing.value = true;
    try {
      const result = await neuroSpec.capture(name, options);
      lastCapture.value = result;
      return result;
    } finally {
      isCapturing.value = false;
    }
  };

  return { capture, isCapturing, lastCapture };
}

// Vue composable for comparing screenshots
export function useCompare(neuroSpec: NeuroSpec) {
  const isComparing = ref(false);
  const lastComparison = ref<any>(null);

  const compare = async (name: string, options?: CompareOptions) => {
    isComparing.value = true;
    try {
      const result = await neuroSpec.compare(name, options);
      lastComparison.value = result;
      return result;
    } finally {
      isComparing.value = false;
    }
  };

  return { compare, isComparing, lastComparison };
}

// Re-export main SDK
export { NeuroSpec } from './index';
export type { NeuralDiffOptions, CaptureOptions, CompareOptions, ComparisonResult } from './types'; 