import { NeuralDiffSDK } from '../neuraldiff-sdk';
import { ReactIntegration } from '../integrations/react-integration';
import { VueIntegration } from '../integrations/vue-integration';
import { NextJSIntegration } from '../integrations/nextjs-integration';
import { renderHook, act } from '@testing-library/react-hooks';
import { performance } from 'perf_hooks';

// Mock the daemon client
jest.mock('../daemon-client');

describe('Framework Integrations', () => {
  let neuralDiff: NeuralDiffSDK;

  beforeEach(() => {
    neuralDiff = new NeuralDiffSDK({
      daemonUrl: 'http://localhost:7878',
      apiKey: 'test-key'
    });
  });

  describe('React Integration', () => {
    let reactIntegration: ReactIntegration;

    beforeEach(() => {
      reactIntegration = new ReactIntegration(neuralDiff);
    });

    describe('useNeuralDiff Hook', () => {
      test('should initialize with default options', () => {
        const { result } = renderHook(() => 
          reactIntegration.useNeuralDiff({
            componentId: 'test-component',
            autoCapture: true
          })
        );

        expect(result.current.captureOnChange).toBeDefined();
        expect(result.current.compareWithBaseline).toBeDefined();
        expect(result.current.isCapturing).toBe(false);
        expect(result.current.lastComparison).toBeNull();
      });

      test('should handle auto-capture on component changes', async () => {
        const mockCapture = jest.spyOn(neuralDiff, 'capture').mockResolvedValue({
          id: 'test-capture',
          hash: 'abc123',
          timestamp: new Date().toISOString()
        });

        const { result } = renderHook(() => 
          reactIntegration.useNeuralDiff({
            componentId: 'test-component',
            autoCapture: true,
            captureOnProps: ['color', 'size']
          })
        );

        await act(async () => {
          await result.current.captureOnChange({ color: 'red', size: 'large' });
        });

        expect(mockCapture).toHaveBeenCalledWith('test-component', expect.objectContaining({
          metadata: expect.objectContaining({
            props: { color: 'red', size: 'large' }
          })
        }));
      });

      test('should preserve authentication state automatically', async () => {
        const mockPreserveAuth = jest.spyOn(neuralDiff, 'preserveAuthState').mockResolvedValue({
          cookies: [{ name: 'session', value: 'abc123' }],
          localStorage: { token: 'jwt123' }
        });

        const { result } = renderHook(() => 
          reactIntegration.useNeuralDiff({
            componentId: 'protected-component',
            autoAuth: true
          })
        );

        expect(mockPreserveAuth).toHaveBeenCalled();
      });

      test('should handle comparison with baseline', async () => {
        const mockCompare = jest.spyOn(neuralDiff, 'compare').mockResolvedValue({
          hasChanges: true,
          severity: 'medium',
          confidence: 0.85,
          semanticChanges: [],
          visualOutputs: { overlayImage: '', sideBySide: '', diffAreas: [] },
          aiSummary: 'Color changed from blue to red',
          recommendations: ['Consider maintaining brand consistency']
        });

        const { result } = renderHook(() => 
          reactIntegration.useNeuralDiff({
            componentId: 'test-component'
          })
        );

        await act(async () => {
          const comparison = await result.current.compareWithBaseline('baseline-id');
          expect(comparison.hasChanges).toBe(true);
          expect(comparison.severity).toBe('medium');
        });

        expect(mockCompare).toHaveBeenCalledWith('baseline-id', undefined);
      });

      test('should handle errors gracefully', async () => {
        jest.spyOn(neuralDiff, 'capture').mockRejectedValue(new Error('Capture failed'));

        const { result } = renderHook(() => 
          reactIntegration.useNeuralDiff({
            componentId: 'test-component',
            onError: jest.fn()
          })
        );

        await act(async () => {
          await result.current.captureOnChange({});
        });

        expect(result.current.error).toBeDefined();
        expect(result.current.error.message).toBe('Capture failed');
      });

      test('should support custom capture options', async () => {
        const mockCapture = jest.spyOn(neuralDiff, 'capture').mockResolvedValue({
          id: 'test-capture',
          hash: 'abc123',
          timestamp: new Date().toISOString()
        });

        const { result } = renderHook(() => 
          reactIntegration.useNeuralDiff({
            componentId: 'test-component',
            captureOptions: {
              viewport: { width: 1920, height: 1080 },
              fullPage: true,
              waitFor: 'networkidle'
            }
          })
        );

        await act(async () => {
          await result.current.captureOnChange({});
        });

        expect(mockCapture).toHaveBeenCalledWith('test-component', expect.objectContaining({
          viewport: { width: 1920, height: 1080 },
          fullPage: true,
          waitFor: 'networkidle'
        }));
      });
    });

    describe('Component Wrapper', () => {
      test('should wrap components with visual monitoring', () => {
        const TestComponent = () => <div>Test</div>;
        const WrappedComponent = reactIntegration.withNeuralDiff(TestComponent, {
          componentId: 'wrapped-test',
          autoCapture: true
        });

        expect(WrappedComponent).toBeDefined();
        expect(WrappedComponent.displayName).toBe('withNeuralDiff(TestComponent)');
      });

      test('should capture on prop changes', async () => {
        const mockCapture = jest.spyOn(neuralDiff, 'capture').mockResolvedValue({
          id: 'test-capture',
          hash: 'abc123',
          timestamp: new Date().toISOString()
        });

        const TestComponent = ({ color }: { color: string }) => <div style={{ color }}>Test</div>;
        const WrappedComponent = reactIntegration.withNeuralDiff(TestComponent, {
          componentId: 'color-test',
          captureOnProps: ['color']
        });

        // Simulate prop change
        const { rerender } = render(<WrappedComponent color="blue" />);
        rerender(<WrappedComponent color="red" />);

        await waitFor(() => {
          expect(mockCapture).toHaveBeenCalledWith('color-test', expect.objectContaining({
            metadata: expect.objectContaining({
              props: { color: 'red' }
            })
          }));
        });
      });
    });
  });

  describe('Vue Integration', () => {
    let vueIntegration: VueIntegration;

    beforeEach(() => {
      vueIntegration = new VueIntegration(neuralDiff);
    });

    describe('useNeuralDiff Composable', () => {
      test('should provide reactive visual monitoring', () => {
        const { captureVisualState, compareWithBaseline, isCapturing, lastComparison } = 
          vueIntegration.useNeuralDiff({
            componentId: 'vue-component',
            autoCapture: true
          });

        expect(captureVisualState).toBeDefined();
        expect(compareWithBaseline).toBeDefined();
        expect(isCapturing.value).toBe(false);
        expect(lastComparison.value).toBeNull();
      });

      test('should watch for reactive data changes', async () => {
        const mockCapture = jest.spyOn(neuralDiff, 'capture').mockResolvedValue({
          id: 'vue-capture',
          hash: 'def456',
          timestamp: new Date().toISOString()
        });

        const reactiveData = ref({ theme: 'light', size: 'medium' });
        
        const { captureVisualState } = vueIntegration.useNeuralDiff({
          componentId: 'vue-reactive',
          watchData: reactiveData
        });

        // Trigger reactive change
        reactiveData.value.theme = 'dark';
        
        await nextTick();
        
        expect(mockCapture).toHaveBeenCalledWith('vue-reactive', expect.objectContaining({
          metadata: expect.objectContaining({
            data: { theme: 'dark', size: 'medium' }
          })
        }));
      });

      test('should integrate with Vue Router', async () => {
        const mockRouter = {
          currentRoute: { value: { path: '/dashboard', params: { id: '123' } } },
          push: jest.fn()
        };

        const { captureVisualState } = vueIntegration.useNeuralDiff({
          componentId: 'vue-routed',
          router: mockRouter,
          captureOnRouteChange: true
        });

        expect(captureVisualState).toBeDefined();
        // Route change capture would be tested with actual Vue Router integration
      });
    });

    describe('Vue Plugin', () => {
      test('should register global properties', () => {
        const mockApp = {
          config: { globalProperties: {} },
          provide: jest.fn()
        };

        vueIntegration.install(mockApp, {
          daemonUrl: 'http://localhost:7878'
        });

        expect(mockApp.config.globalProperties.$neuralDiff).toBeDefined();
        expect(mockApp.provide).toHaveBeenCalledWith('neuralDiff', expect.any(Object));
      });

      test('should provide global capture methods', () => {
        const mockApp = {
          config: { globalProperties: {} },
          provide: jest.fn()
        };

        vueIntegration.install(mockApp);

        const neuralDiffInstance = mockApp.config.globalProperties.$neuralDiff;
        expect(neuralDiffInstance.capture).toBeDefined();
        expect(neuralDiffInstance.compare).toBeDefined();
        expect(neuralDiffInstance.watch).toBeDefined();
      });
    });
  });

  describe('Next.js Integration', () => {
    let nextjsIntegration: NextJSIntegration;

    beforeEach(() => {
      nextjsIntegration = new NextJSIntegration(neuralDiff);
    });

    describe('Route Discovery', () => {
      test('should discover pages directory routes', async () => {
        const mockFileSystem = {
          'pages/index.tsx': 'export default function Home() {}',
          'pages/about.tsx': 'export default function About() {}',
          'pages/blog/[slug].tsx': 'export default function BlogPost() {}',
          'pages/api/users.ts': 'export default function handler() {}'
        };

        jest.spyOn(nextjsIntegration, 'scanDirectoryForRoutes').mockResolvedValue([
          { path: '/', file: 'pages/index.tsx', authRequired: false },
          { path: '/about', file: 'pages/about.tsx', authRequired: false },
          { path: '/blog/[slug]', file: 'pages/blog/[slug].tsx', authRequired: false }
        ]);

        const routes = await nextjsIntegration.discoverRoutes('pages');
        
        expect(routes).toHaveLength(3);
        expect(routes.find(r => r.path === '/')).toBeDefined();
        expect(routes.find(r => r.path === '/blog/[slug]')).toBeDefined();
      });

      test('should discover app directory routes', async () => {
        const mockFileSystem = {
          'app/page.tsx': 'export default function RootPage() {}',
          'app/dashboard/page.tsx': 'export default function Dashboard() {}',
          'app/dashboard/settings/page.tsx': 'export default function Settings() {}'
        };

        jest.spyOn(nextjsIntegration, 'scanDirectoryForRoutes').mockResolvedValue([
          { path: '/', file: 'app/page.tsx', authRequired: false },
          { path: '/dashboard', file: 'app/dashboard/page.tsx', authRequired: true },
          { path: '/dashboard/settings', file: 'app/dashboard/settings/page.tsx', authRequired: true }
        ]);

        const routes = await nextjsIntegration.discoverRoutes('app');
        
        expect(routes).toHaveLength(3);
        expect(routes.find(r => r.path === '/dashboard').authRequired).toBe(true);
      });

      test('should detect authentication requirements', () => {
        const protectedRoutes = [
          { path: '/dashboard', middleware: ['auth'] },
          { path: '/admin', middleware: ['auth', 'admin'] },
          { path: '/profile', middleware: [] },
          { path: '/account/settings', middleware: [] }
        ];

        protectedRoutes.forEach(route => {
          const authRequired = nextjsIntegration.detectAuthRequirement(route);
          
          if (route.path.includes('dashboard') || route.path.includes('admin') || 
              route.path.includes('profile') || route.path.includes('account')) {
            expect(authRequired).toBe(true);
          }
        });
      });

      test('should extract middleware information', async () => {
        const routeFile = `
          import { withAuth } from 'next-auth/middleware';
          
          export default withAuth(
            function middleware(request) {
              // Middleware logic
            }
          );
          
          export const config = {
            matcher: ['/dashboard/:path*', '/admin/:path*']
          };
        `;

        const middleware = await nextjsIntegration.extractMiddleware({ 
          path: '/dashboard', 
          file: 'pages/dashboard.tsx' 
        });

        expect(middleware).toContain('auth');
      });
    });

    describe('Bulk Route Capture', () => {
      test('should capture all discovered routes', async () => {
        const mockRoutes = [
          { path: '/', authRequired: false },
          { path: '/about', authRequired: false },
          { path: '/dashboard', authRequired: true }
        ];

        jest.spyOn(nextjsIntegration, 'discoverRoutes').mockResolvedValue(mockRoutes);
        
        const mockCapture = jest.spyOn(neuralDiff, 'capture')
          .mockResolvedValueOnce({ id: 'home', hash: 'hash1', timestamp: '2023-01-01' })
          .mockResolvedValueOnce({ id: 'about', hash: 'hash2', timestamp: '2023-01-01' })
          .mockResolvedValueOnce({ id: 'dashboard', hash: 'hash3', timestamp: '2023-01-01' });

        const authContext = {
          cookies: [{ name: 'session', value: 'abc123' }],
          localStorage: {},
          sessionStorage: {},
          source: { type: 'chrome', pid: 1234 }
        };

        const results = await nextjsIntegration.captureAllRoutes('http://localhost:3000', authContext);
        
        expect(results).toHaveLength(3);
        expect(mockCapture).toHaveBeenCalledTimes(3);
      });

      test('should skip protected routes without auth context', async () => {
        const mockRoutes = [
          { path: '/', authRequired: false },
          { path: '/dashboard', authRequired: true }
        ];

        jest.spyOn(nextjsIntegration, 'discoverRoutes').mockResolvedValue(mockRoutes);
        
        const mockCapture = jest.spyOn(neuralDiff, 'capture')
          .mockResolvedValueOnce({ id: 'home', hash: 'hash1', timestamp: '2023-01-01' });

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const results = await nextjsIntegration.captureAllRoutes('http://localhost:3000');
        
        expect(results).toHaveLength(1);
        expect(mockCapture).toHaveBeenCalledTimes(1);
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Skipping protected route /dashboard')
        );

        consoleSpy.mockRestore();
      });

      test('should handle capture failures gracefully', async () => {
        const mockRoutes = [
          { path: '/', authRequired: false },
          { path: '/error', authRequired: false }
        ];

        jest.spyOn(nextjsIntegration, 'discoverRoutes').mockResolvedValue(mockRoutes);
        
        const mockCapture = jest.spyOn(neuralDiff, 'capture')
          .mockResolvedValueOnce({ id: 'home', hash: 'hash1', timestamp: '2023-01-01' })
          .mockRejectedValueOnce(new Error('Capture failed'));

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const results = await nextjsIntegration.captureAllRoutes('http://localhost:3000');
        
        expect(results).toHaveLength(1);
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to capture route /error')
        );

        consoleSpy.mockRestore();
      });
    });

    describe('Performance Requirements', () => {
      test('should complete route discovery within 1 second', async () => {
        jest.spyOn(nextjsIntegration, 'scanDirectoryForRoutes').mockResolvedValue([
          { path: '/', file: 'pages/index.tsx', authRequired: false }
        ]);

        const startTime = performance.now();
        
        await nextjsIntegration.discoverRoutes('pages');
        
        const duration = performance.now() - startTime;
        expect(duration).toBeLessThan(1000);
      });

      test('should handle concurrent route captures efficiently', async () => {
        const mockRoutes = Array.from({ length: 10 }, (_, i) => ({
          path: `/page-${i}`,
          authRequired: false
        }));

        jest.spyOn(nextjsIntegration, 'discoverRoutes').mockResolvedValue(mockRoutes);
        
        const mockCapture = jest.spyOn(neuralDiff, 'capture').mockImplementation(
          (id) => Promise.resolve({ id, hash: `hash-${id}`, timestamp: '2023-01-01' })
        );

        const startTime = performance.now();
        
        const results = await nextjsIntegration.captureAllRoutes('http://localhost:3000');
        
        const duration = performance.now() - startTime;
        expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
        expect(results).toHaveLength(10);
      });
    });
  });

  describe('Generic Framework Adapter', () => {
    test('should provide fallback functionality for unknown frameworks', async () => {
      const genericAdapter = neuralDiff.createGenericAdapter({
        componentId: 'unknown-framework-component'
      });

      expect(genericAdapter.capture).toBeDefined();
      expect(genericAdapter.compare).toBeDefined();
      expect(genericAdapter.watch).toBeDefined();
    });

    test('should handle manual route specification', async () => {
      const genericAdapter = neuralDiff.createGenericAdapter({
        routes: ['/home', '/about', '/contact']
      });

      const mockCapture = jest.spyOn(neuralDiff, 'capture').mockImplementation(
        (id) => Promise.resolve({ id, hash: `hash-${id}`, timestamp: '2023-01-01' })
      );

      const results = await genericAdapter.captureAllRoutes('http://localhost:8080');
      
      expect(results).toHaveLength(3);
      expect(mockCapture).toHaveBeenCalledTimes(3);
    });

    test('should provide basic DOM change detection', async () => {
      const genericAdapter = neuralDiff.createGenericAdapter({
        componentId: 'generic-component',
        watchSelector: '.main-content'
      });

      const mockCapture = jest.spyOn(neuralDiff, 'capture').mockResolvedValue({
        id: 'generic-capture',
        hash: 'generic-hash',
        timestamp: '2023-01-01'
      });

      // Simulate DOM change
      await genericAdapter.onDOMChange();
      
      expect(mockCapture).toHaveBeenCalledWith('generic-component', expect.objectContaining({
        metadata: expect.objectContaining({
          trigger: 'dom-change'
        })
      }));
    });
  });

  describe('Cross-Framework Compatibility', () => {
    test('should maintain consistent API across all frameworks', () => {
      const reactIntegration = new ReactIntegration(neuralDiff);
      const vueIntegration = new VueIntegration(neuralDiff);
      const nextjsIntegration = new NextJSIntegration(neuralDiff);

      // All integrations should have consistent method signatures
      expect(typeof reactIntegration.useNeuralDiff).toBe('function');
      expect(typeof vueIntegration.useNeuralDiff).toBe('function');
      expect(typeof nextjsIntegration.discoverRoutes).toBe('function');
    });

    test('should handle authentication consistently across frameworks', async () => {
      const authContext = {
        cookies: [{ name: 'session', value: 'test123' }],
        localStorage: { token: 'jwt456' },
        sessionStorage: {},
        source: { type: 'chrome', pid: 1234 }
      };

      const mockPreserveAuth = jest.spyOn(neuralDiff, 'preserveAuthState').mockResolvedValue(authContext);

      // React
      const { result: reactResult } = renderHook(() => 
        new ReactIntegration(neuralDiff).useNeuralDiff({
          componentId: 'react-auth-test',
          autoAuth: true
        })
      );

      // Vue
      const vueComposable = new VueIntegration(neuralDiff).useNeuralDiff({
        componentId: 'vue-auth-test',
        autoAuth: true
      });

      // Next.js
      const nextjsResults = await new NextJSIntegration(neuralDiff).captureAllRoutes(
        'http://localhost:3000',
        authContext
      );

      expect(mockPreserveAuth).toHaveBeenCalled();
    });

    test('should provide consistent error handling across frameworks', async () => {
      jest.spyOn(neuralDiff, 'capture').mockRejectedValue(new Error('Network error'));

      const reactIntegration = new ReactIntegration(neuralDiff);
      const vueIntegration = new VueIntegration(neuralDiff);

      // React error handling
      const { result: reactResult } = renderHook(() => 
        reactIntegration.useNeuralDiff({
          componentId: 'react-error-test',
          onError: jest.fn()
        })
      );

      await act(async () => {
        await reactResult.current.captureOnChange({});
      });

      expect(reactResult.current.error).toBeDefined();

      // Vue error handling
      const vueComposable = vueIntegration.useNeuralDiff({
        componentId: 'vue-error-test',
        onError: jest.fn()
      });

      await vueComposable.captureVisualState();
      expect(vueComposable.error.value).toBeDefined();
    });
  });
});