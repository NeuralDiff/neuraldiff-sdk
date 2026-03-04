/**
 * NeuralDiff Daemon - Tool Registry
 * Registry of tools that the remote API agent can call back into the local daemon.
 *
 * Each tool has a name, description, input schema (for validation and documentation),
 * and a handler function. The API agent discovers available tools and can invoke them
 * to collect data from the local environment.
 */

import type { ScreenshotManager } from './screenshot-manager';
import type {
  ToolDefinition,
  ToolResult,
  ToolCallRequest,
  ToolCallResponse,
  ToolInputSchema,
  Logger,
} from './types';

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private screenshotManager: ScreenshotManager;
  private logger: Logger;

  constructor(screenshotManager: ScreenshotManager, logger: Logger) {
    this.screenshotManager = screenshotManager;
    this.logger = logger;

    // Register built-in tools
    this.registerBuiltinTools();
  }

  /**
   * Register a tool.
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      this.logger.warn(`Tool already registered, overwriting: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    this.logger.info(`Tool registered: ${tool.name}`);
  }

  /**
   * Unregister a tool.
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * List all registered tools (for discovery by the API agent).
   */
  listTools(): Array<{ name: string; description: string; inputSchema: ToolInputSchema }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  /**
   * Get a specific tool definition.
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Execute a tool call from the API agent.
   */
  async executeTool(request: ToolCallRequest): Promise<ToolCallResponse> {
    const startTime = Date.now();
    const tool = this.tools.get(request.toolName);

    if (!tool) {
      return {
        requestId: request.requestId,
        toolName: request.toolName,
        result: {
          success: false,
          error: `Unknown tool: ${request.toolName}`,
        },
        duration: Date.now() - startTime,
      };
    }

    this.logger.info(`Executing tool: ${request.toolName} (request: ${request.requestId})`);

    try {
      const result = await tool.handler(request.params);
      return {
        requestId: request.requestId,
        toolName: request.toolName,
        result,
        duration: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Tool execution failed: ${request.toolName} - ${message}`);
      return {
        requestId: request.requestId,
        toolName: request.toolName,
        result: {
          success: false,
          error: message,
        },
        duration: Date.now() - startTime,
      };
    }
  }

  // ── Built-in Tools ─────────────────────────────────────────────────────────

  private registerBuiltinTools(): void {
    this.register({
      name: 'capture_screenshot',
      description:
        'Capture a screenshot of a web page using Playwright. Returns the screenshot ID and perceptual hash.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL of the page to capture',
          },
          name: {
            type: 'string',
            description: 'A name/label for this capture',
          },
          viewport_width: {
            type: 'number',
            description: 'Viewport width in pixels',
            default: 1280,
          },
          viewport_height: {
            type: 'number',
            description: 'Viewport height in pixels',
            default: 720,
          },
          full_page: {
            type: 'boolean',
            description: 'Whether to capture the full scrollable page',
            default: false,
          },
          selector: {
            type: 'string',
            description: 'CSS selector to capture a specific element instead of the full page',
          },
          wait_for: {
            type: 'string',
            description: 'Wait condition: "load", "domcontentloaded", "networkidle", or a number (ms)',
            default: 'networkidle',
          },
        },
        required: ['url'],
      },
      handler: async (params) => {
        const result = await this.screenshotManager.capture({
          url: params.url as string,
          name: params.name as string | undefined,
          viewport: {
            width: (params.viewport_width as number) || 1280,
            height: (params.viewport_height as number) || 720,
          },
          fullPage: params.full_page as boolean | undefined,
          selector: params.selector as string | undefined,
          waitFor: params.wait_for as string | undefined,
        });

        return {
          success: true,
          data: {
            id: result.id,
            name: result.name,
            hash: result.hash,
            timestamp: result.timestamp,
          },
        };
      },
    });

    this.register({
      name: 'get_dom_snapshot',
      description:
        'Get the DOM structure of a web page. Returns a simplified HTML snapshot useful for understanding page structure.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL of the page to snapshot',
          },
          selector: {
            type: 'string',
            description: 'CSS selector to limit the snapshot to a specific subtree',
          },
          max_depth: {
            type: 'number',
            description: 'Maximum DOM depth to traverse',
            default: 10,
          },
        },
        required: ['url'],
      },
      handler: async (params) => {
        try {
          const { chromium } = await import('playwright');
          const browser = await chromium.launch({ headless: true });
          const page = await browser.newPage();
          await page.goto(params.url as string, { waitUntil: 'networkidle', timeout: 30000 });

          const selector = (params.selector as string) || 'body';
          const maxDepth = (params.max_depth as number) || 10;

          const snapshot = await page.evaluate(
            ({ sel, depth }: { sel: string; depth: number }) => {
              function serializeNode(node: Element, currentDepth: number): any {
                if (currentDepth > depth) return { tag: node.tagName, truncated: true };

                const children = Array.from(node.children).map((child) =>
                  serializeNode(child, currentDepth + 1)
                );

                const attrs: Record<string, string> = {};
                for (const attr of Array.from(node.attributes)) {
                  if (['id', 'class', 'role', 'aria-label', 'data-testid', 'href', 'src', 'alt', 'type'].includes(attr.name)) {
                    attrs[attr.name] = attr.value;
                  }
                }

                return {
                  tag: node.tagName.toLowerCase(),
                  attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
                  text: children.length === 0 ? node.textContent?.trim()?.slice(0, 200) : undefined,
                  children: children.length > 0 ? children : undefined,
                };
              }

              const root = document.querySelector(sel);
              if (!root) return { error: `Selector not found: ${sel}` };
              return serializeNode(root, 0);
            },
            { sel: selector, depth: maxDepth }
          );

          await browser.close();

          return { success: true, data: snapshot };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: `DOM snapshot failed: ${message}` };
        }
      },
    });

    this.register({
      name: 'get_computed_styles',
      description:
        'Get computed CSS styles for elements matching a selector on a web page.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL of the page',
          },
          selector: {
            type: 'string',
            description: 'CSS selector for the target element(s)',
          },
          properties: {
            type: 'array',
            description: 'List of CSS property names to retrieve. If empty, returns a common subset.',
            items: { type: 'string', description: 'CSS property name' },
          },
        },
        required: ['url', 'selector'],
      },
      handler: async (params) => {
        try {
          const { chromium } = await import('playwright');
          const browser = await chromium.launch({ headless: true });
          const page = await browser.newPage();
          await page.goto(params.url as string, { waitUntil: 'networkidle', timeout: 30000 });

          const requestedProps = (params.properties as string[]) || [
            'display', 'position', 'width', 'height', 'margin', 'padding',
            'color', 'background-color', 'font-family', 'font-size',
            'font-weight', 'line-height', 'border', 'opacity', 'visibility',
            'z-index', 'overflow', 'flex-direction', 'justify-content', 'align-items',
          ];

          const styles = await page.evaluate(
            ({ sel, props }: { sel: string; props: string[] }) => {
              const elements = document.querySelectorAll(sel);
              return Array.from(elements).slice(0, 20).map((el, index) => {
                const computed = getComputedStyle(el);
                const result: Record<string, string> = {};
                for (const prop of props) {
                  result[prop] = computed.getPropertyValue(prop);
                }
                return {
                  index,
                  tag: el.tagName.toLowerCase(),
                  id: el.id || undefined,
                  className: el.className || undefined,
                  styles: result,
                };
              });
            },
            { sel: params.selector as string, props: requestedProps }
          );

          await browser.close();

          return { success: true, data: { selector: params.selector, elements: styles } };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: `Computed styles failed: ${message}` };
        }
      },
    });

    this.register({
      name: 'get_console_logs',
      description:
        'Navigate to a URL and capture all console output (log, warn, error, info) for a specified duration.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL of the page to monitor',
          },
          duration_ms: {
            type: 'number',
            description: 'How long to capture console output (milliseconds)',
            default: 5000,
          },
          levels: {
            type: 'array',
            description: 'Console levels to capture: log, warn, error, info, debug',
            items: { type: 'string', description: 'Console level' },
          },
        },
        required: ['url'],
      },
      handler: async (params) => {
        try {
          const { chromium } = await import('playwright');
          const browser = await chromium.launch({ headless: true });
          const page = await browser.newPage();

          const logs: Array<{ level: string; text: string; timestamp: number }> = [];
          const levels = new Set(
            (params.levels as string[]) || ['log', 'warn', 'error', 'info']
          );

          page.on('console', (msg) => {
            const level = msg.type();
            if (levels.has(level)) {
              logs.push({
                level,
                text: msg.text(),
                timestamp: Date.now(),
              });
            }
          });

          await page.goto(params.url as string, { waitUntil: 'networkidle', timeout: 30000 });

          const duration = (params.duration_ms as number) || 5000;
          await page.waitForTimeout(duration);

          await browser.close();

          return {
            success: true,
            data: {
              url: params.url,
              duration,
              logCount: logs.length,
              logs,
            },
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: `Console capture failed: ${message}` };
        }
      },
    });

    this.register({
      name: 'get_network_requests',
      description:
        'Navigate to a URL and capture all network requests and responses for a specified duration.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL of the page to monitor',
          },
          duration_ms: {
            type: 'number',
            description: 'How long to capture network activity (milliseconds)',
            default: 5000,
          },
          filter_type: {
            type: 'string',
            description: 'Filter by resource type: document, stylesheet, script, image, fetch, xhr, font, other',
          },
        },
        required: ['url'],
      },
      handler: async (params) => {
        try {
          const { chromium } = await import('playwright');
          const browser = await chromium.launch({ headless: true });
          const page = await browser.newPage();

          const requests: Array<{
            url: string;
            method: string;
            resourceType: string;
            status: number | null;
            timestamp: number;
            duration: number | null;
          }> = [];

          const pendingRequests = new Map<string, number>();

          page.on('request', (request) => {
            const filterType = params.filter_type as string | undefined;
            if (filterType && request.resourceType() !== filterType) return;

            pendingRequests.set(request.url(), Date.now());
            requests.push({
              url: request.url(),
              method: request.method(),
              resourceType: request.resourceType(),
              status: null,
              timestamp: Date.now(),
              duration: null,
            });
          });

          page.on('response', (response) => {
            const startTime = pendingRequests.get(response.url());
            const entry = requests.find((r) => r.url === response.url() && r.status === null);
            if (entry) {
              entry.status = response.status();
              entry.duration = startTime ? Date.now() - startTime : null;
            }
          });

          await page.goto(params.url as string, { waitUntil: 'networkidle', timeout: 30000 });

          const duration = (params.duration_ms as number) || 5000;
          await page.waitForTimeout(duration);

          await browser.close();

          return {
            success: true,
            data: {
              url: params.url,
              duration,
              requestCount: requests.length,
              requests: requests.slice(0, 200), // Cap at 200 entries
            },
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: `Network capture failed: ${message}` };
        }
      },
    });
  }
}
