# CLAUDE.md — neuraldiff-sdk

## What This Is

The `@neuraldiff/sdk` npm package — the core client library for NeuralDiff visual regression testing. Provides screenshot capture, local analysis, a background daemon server, and framework integrations (React, Vue). This is what developers install in their projects.

## System Context

NeuralDiff is a multi-repo system:
- **neuraldiff-web** — Dashboard UI
- **neuraldiff-api** — Backend analysis engine (this SDK sends data to it)
- **neuraldiff-sdk** (this repo) — Client library + daemon + local analysis
- **neuraldiff-mcp** — MCP server (connects to this SDK's daemon)
- **neuraldiff-docs** — Public documentation
- **neuraldiff-research** — Private algorithm research

The SDK runs in two modes: (1) imported as a library in user code for screenshot capture, and (2) as a background daemon that the MCP server and API connect to.

## Tech Stack

- **Language**: TypeScript 5.2+ (very strict — see tsconfig)
- **Build**: tsup (CJS + ESM + DTS output)
- **Test**: vitest with @vitest/coverage-v8
- **Lint**: ESLint with @typescript-eslint
- **Runtime deps**: axios, p-limit, ws
- **Peer deps** (all optional): playwright (>=1.40), react (>=16.8), vue (>=3.0)
- **License**: MIT
- **Package**: `@neuraldiff/sdk` (public on npm)

## Key Commands

```bash
npm run build          # tsup → dist/ (CJS + ESM + DTS)
npm run build:watch    # tsup in watch mode
npm test               # vitest run
npm run test:watch     # vitest (watch mode)
npm run test:coverage  # vitest with coverage
npm run lint           # eslint
npm run lint:fix       # eslint --fix
npm run typecheck      # tsc --noEmit (strict checks only)
npm run clean          # rimraf dist coverage

# Versioning & publishing
npm run release        # version:patch + publish:latest
npm run release:minor  # version:minor + publish:latest
npm run release:beta   # version:patch + publish:beta
```

## Directory Structure

```
src/
├── index.ts                  # Main entry: exports NeuroSpec class + types
├── types.ts                  # Core type definitions
├── error-handling.ts         # Error types and utilities
├── react.ts                  # React integration (hooks/components)
├── vue.ts                    # Vue integration (composables)
├── daemon/
│   ├── server.ts             # HTTP daemon server (port 7878)
│   ├── api-client.ts         # Client for calling neuraldiff-api
│   ├── screenshot-manager.ts # Playwright screenshot capture + management
│   ├── analysis.ts           # Local analysis algorithms
│   ├── hash.ts               # Perceptual hashing (aHash, dHash)
│   ├── tool-registry.ts      # Tool registration for agent/MCP
│   └── types.ts              # Daemon-specific types
├── analysis/
│   ├── computed-style-delta.ts  # CSS computed style diffing
│   └── css-mutation-testing.ts  # CSS mutation testing framework
└── __tests__/
    └── framework-integrations.test.ts
```

### Subpath Exports
The package exposes multiple entry points:
```json
"@neuraldiff/sdk"           → src/index.ts       (main NeuroSpec class)
"@neuraldiff/sdk/react"     → src/react.ts        (React hooks)
"@neuraldiff/sdk/vue"       → src/vue.ts          (Vue composables)
"@neuraldiff/sdk/daemon"    → src/daemon/server.ts (daemon server)
"@neuraldiff/sdk/analysis"  → src/analysis/        (analysis tools)
```

## Architecture & Patterns

### NeuroSpec (Main Class)
`src/index.ts` — EventEmitter-based main class. Users instantiate it with config and use it to capture, compare, and analyze screenshots.

### Daemon Server
`src/daemon/server.ts` — Native Node.js HTTP server (not Express) on port 7878. Provides endpoints for:
- Screenshot capture (via Playwright)
- Image comparison and analysis
- Tool registration for MCP
- Health checks

The MCP server connects to this daemon to expose NeuralDiff tools to AI assistants.

### Perceptual Hashing
`src/daemon/hash.ts` — Implements perceptual hash algorithms for fast image comparison:
- Average hash (aHash): grayscale → resize → threshold against mean
- Difference hash (dHash): grayscale → resize → compare adjacent pixels
- Both operate on 8x8 grids producing 64-bit hashes
- Hamming distance for comparison

### Analysis Modules
- `computed-style-delta.ts` — Diffs CSS computed styles between two DOM snapshots
- `css-mutation-testing.ts` — Applies controlled CSS mutations to test detection sensitivity

## Coding Conventions

- **TypeScript strictness**: This repo has the strictest tsconfig in the system:
  - `exactOptionalPropertyTypes: true` — Can't assign `undefined` to optional props
  - `noUnusedLocals: true` — No unused variables
  - `noUnusedParameters: true` — No unused function parameters
  - `noUncheckedIndexedAccess: true` — Array/object index access returns `T | undefined`
  - `noImplicitReturns: true` — All code paths must return
  - `noFallthroughCasesInSwitch: true` — Switch cases must break/return
- **File naming**: camelCase for modules (`api-client.ts` exception in daemon/)
- **Exports**: Named exports preferred. Default export only for main class.
- **Error handling**: Custom error types in `error-handling.ts`
- **Concurrency**: Use `p-limit` for throttling parallel operations

## Environment Variables

The daemon uses these when running:
```
NEURALDIFF_API_URL=http://localhost:3001   # API server URL
NEURALDIFF_API_KEY=                        # API authentication key
NEURALDIFF_DAEMON_PORT=7878                # Daemon listen port
```

## Common Tasks

### Add a new daemon endpoint
1. Add the handler in `src/daemon/server.ts`
2. Register it in the server's route table
3. If it's a tool, also register in `src/daemon/tool-registry.ts`

### Add a new analysis algorithm
1. Create a new file in `src/analysis/` or add to `src/daemon/analysis.ts`
2. Export the function
3. Wire it into the analysis pipeline
4. Add tests in `src/__tests__/`

### Add a framework integration
1. Follow the pattern in `src/react.ts` or `src/vue.ts`
2. Export from the appropriate subpath in package.json exports map
3. Peer dependency should be optional in `peerDependenciesMeta`

## Gotchas

- **exactOptionalPropertyTypes**: You must use `prop?: T | undefined` (not just `prop?: T`) when the property can explicitly be `undefined`. This catches real bugs but requires careful type definitions.
- **noUncheckedIndexedAccess**: `arr[0]` is `T | undefined`. Always check or assert after indexing.
- **Playwright is optional**: Not all users need screenshot capture. Code that uses Playwright must handle the case where it's not installed.
- **Daemon is native HTTP**: Not Express. Route handling is manual. Keep it lightweight — this runs in the background.
- **tsup bundles**: Be careful with dynamic imports and peer deps — tsup may try to bundle them. Use `external` in tsup config if needed.
- **Nx workspace**: This repo is part of an Nx monorepo setup (`project.json`). The Nx cache and task pipeline affect builds.
