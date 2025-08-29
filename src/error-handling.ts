/**
 * Error handling integration for NeuralDiff SDK
 */

import { 
  ErrorType, 
  NeuralDiffError, 
  ErrorContext,
  ErrorResponse 
} from '../../shared-types/src/errors';
import { ErrorHandler } from '../../shared-utils/src/error-handler';
import { withRetry, RetryConfigs } from '../../shared-utils/src/retry';

export class SDKErrorHandler extends ErrorHandler {
  constructor() {
    super({
      enableFallbacks: true,
      enableRetries: true,
      logErrors: false, // SDK should not log by default
      notifyUsers: false // Let the consuming application handle notifications
    });
  }

  async handleDaemonConnectionError(error: Error, context: {
    daemonUrl: string;
    operation: string;
  }): Promise<ErrorResponse> {
    const errorContext: ErrorContext = {
      component: 'SDKClient',
      operation: context.operation,
      timestamp: new Date().toISOString(),
      metadata: { daemonUrl: context.daemonUrl }
    };

    const neuralDiffError = error instanceof NeuralDiffError 
      ? error 
      : new NeuralDiffError(
          ErrorType.DAEMON_UNAVAILABLE,
          error.message,
          errorContext,
          { cause: error }
        );

    return this.handleError(neuralDiffError, errorContext);
  }

  async handleAPIError(error: Error, context: {
    endpoint: string;
    method: string;
    statusCode?: number;
  }): Promise<ErrorResponse> {
    const errorContext: ErrorContext = {
      component: 'APIClient',
      operation: `${context.method} ${context.endpoint}`,
      timestamp: new Date().toISOString(),
      metadata: { 
        endpoint: context.endpoint,
        method: context.method,
        statusCode: context.statusCode
      }
    };

    let errorType: ErrorType;
    if (context.statusCode) {
      errorType = this.mapHttpStatusToErrorType(context.statusCode);
    } else {
      errorType = ErrorType.NETWORK_ERROR;
    }

    const neuralDiffError = error instanceof NeuralDiffError 
      ? error 
      : new NeuralDiffError(errorType, error.message, errorContext, { cause: error });

    return this.handleError(neuralDiffError, errorContext);
  }

  async handleFrameworkIntegrationError(error: Error, context: {
    framework: string;
    operation: string;
    component?: string;
  }): Promise<ErrorResponse> {
    const errorContext: ErrorContext = {
      component: `${context.framework}Integration`,
      operation: context.operation,
      timestamp: new Date().toISOString(),
      metadata: { 
        framework: context.framework,
        component: context.component
      }
    };

    const neuralDiffError = error instanceof NeuralDiffError 
      ? error 
      : new NeuralDiffError(
          ErrorType.COMPARISON_FAILED,
          error.message,
          errorContext,
          { cause: error }
        );

    return this.handleError(neuralDiffError, errorContext);
  }

  // Enhanced retry methods with SDK-specific implementations
  protected async attemptDaemonConnection(): Promise<any> {
    const daemonUrls = [
      'http://localhost:7878',
      'http://127.0.0.1:7878',
      'http://localhost:7879' // Fallback port
    ];

    for (const url of daemonUrls) {
      try {
        const response = await fetch(`${url}/health`);
        if (response.ok) {
          return { daemonUrl: url, status: 'connected' };
        }
      } catch (error) {
        continue;
      }
    }

    throw new NeuralDiffError(
      ErrorType.DAEMON_UNAVAILABLE,
      'Could not connect to NeuralDiff daemon on any known port',
      {
        component: 'SDKClient',
        operation: 'connectToDaemon',
        timestamp: new Date().toISOString()
      }
    );
  }

  protected async retryNetworkOperation(): Promise<any> {
    // This would integrate with actual network retry logic
    return { networkRetry: true, success: true };
  }

  private mapHttpStatusToErrorType(statusCode: number): ErrorType {
    const statusMap: Record<number, ErrorType> = {
      400: ErrorType.INVALID_INPUT,
      401: ErrorType.AUTH_FAILED,
      403: ErrorType.PERMISSION_DENIED,
      404: ErrorType.INVALID_URL,
      408: ErrorType.PAGE_LOAD_TIMEOUT,
      429: ErrorType.INSUFFICIENT_RESOURCES,
      500: ErrorType.COMPARISON_FAILED,
      502: ErrorType.NETWORK_ERROR,
      503: ErrorType.DAEMON_UNAVAILABLE,
      504: ErrorType.AI_ANALYSIS_TIMEOUT
    };

    return statusMap[statusCode] || ErrorType.NETWORK_ERROR;
  }
}

// Utility class for SDK consumers to handle errors gracefully
export class SDKErrorReporter {
  private errorHandler: SDKErrorHandler;
  private onError?: (error: NeuralDiffError) => void;
  private onWarning?: (warning: string) => void;

  constructor(options: {
    onError?: (error: NeuralDiffError) => void;
    onWarning?: (warning: string) => void;
  } = {}) {
    this.errorHandler = new SDKErrorHandler();
    this.onError = options.onError;
    this.onWarning = options.onWarning;
  }

  async reportAndHandle(error: Error, context?: Partial<ErrorContext>): Promise<ErrorResponse> {
    const response = await this.errorHandler.handleError(error, context);

    if (!response.success && response.error && this.onError) {
      const neuralDiffError = new NeuralDiffError(
        response.error.type,
        response.error.message,
        response.error.context
      );
      this.onError(neuralDiffError);
    }

    if (response.warning && this.onWarning) {
      this.onWarning(response.warning);
    }

    return response;
  }

  // Helper method for React error boundaries
  static createReactErrorBoundary(onError?: (error: NeuralDiffError) => void) {
    return class NeuralDiffErrorBoundary extends React.Component<
      { children: React.ReactNode },
      { hasError: boolean; error?: NeuralDiffError }
    > {
      constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
      }

      static getDerivedStateFromError(error: Error) {
        const neuralDiffError = error instanceof NeuralDiffError 
          ? error 
          : new NeuralDiffError(
              ErrorType.COMPARISON_FAILED,
              error.message,
              {
                component: 'ReactErrorBoundary',
                operation: 'componentDidCatch',
                timestamp: new Date().toISOString()
              },
              { cause: error }
            );

        return { hasError: true, error: neuralDiffError };
      }

      componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        if (this.state.error && onError) {
          onError(this.state.error);
        }
      }

      render() {
        if (this.state.hasError && this.state.error) {
          return (
            <div style={{ padding: '20px', border: '1px solid #ff6b6b', borderRadius: '4px' }}>
              <h3>Visual Analysis Error</h3>
              <p>{this.state.error.userMessage}</p>
              <details>
                <summary>Recommendations</summary>
                <ul>
                  {this.state.error.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </details>
            </div>
          );
        }

        return this.props.children;
      }
    };
  }
}

// Export React component for convenience
declare global {
  namespace JSX {
    interface IntrinsicElements {
      // This would be properly typed in a real React environment
    }
  }
}

// Mock React for compilation
const React = {
  Component: class Component<P = {}, S = {}> {
    props: P;
    state: S;
    constructor(props: P) {
      this.props = props;
      this.state = {} as S;
    }
    render(): any { return null; }
  }
};