# Contributing to NeuralDiff

Thank you for your interest in contributing to NeuralDiff! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. We are committed to providing a welcoming and inclusive environment for all contributors.

## Getting Started

1. **Fork the repository** and clone your fork locally
2. **Install dependencies**: `npm install`
3. **Create a branch** for your changes: `git checkout -b feature/your-feature-name`
4. **Make your changes** and ensure tests pass
5. **Submit a pull request** with a clear description of your changes

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/neuraldiff-sdk.git
cd neuraldiff-sdk

# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build the project
npm run build

# Run linting
npm run lint
```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Code Style

We use ESLint and Prettier to maintain consistent code style. Configuration is included in the project.

```bash
# Check linting
npm run lint

# Format code
npm run format

# Type checking
npm run typecheck
```

## Project Structure

```
neurospec-sdk/
├── src/
│   ├── core/           # Core functionality
│   ├── utils/          # Utility functions
│   ├── adapters/       # Framework adapters (React, Vue, etc.)
│   ├── types.ts        # TypeScript type definitions
│   └── index.ts        # Main entry point
├── tests/              # Test files
├── examples/           # Example usage
└── docs/              # Documentation
```

## Pull Request Process

1. **Update documentation** for any changed functionality
2. **Add tests** for new features
3. **Ensure all tests pass** locally
4. **Update the README** if needed
5. **Submit your PR** with a descriptive title and detailed description

### PR Title Format

Use conventional commit format for PR titles:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, missing semicolons, etc.)
- `refactor:` Code changes that neither fix bugs nor add features
- `perf:` Performance improvements
- `test:` Test additions or corrections
- `chore:` Maintenance tasks

### PR Description Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] Added new tests for changes
- [ ] Updated documentation

## Screenshots (if applicable)
Add screenshots for UI changes.
```

## Testing Guidelines

### Writing Tests

- Place test files next to the code they test
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies

Example test structure:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { NeuroSpec } from '../src';

describe('NeuroSpec', () => {
  it('should capture screenshots successfully', async () => {
    const neuro = new NeuroSpec({ apiKey: 'test-key' });
    
    const result = await neuro.capture('test-page', {
      url: 'https://example.com'
    });
    
    expect(result.status).toBe('captured');
  });
});
```

## Commit Guidelines

We follow conventional commits specification. Each commit message should be structured as:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Examples:
```
feat(capture): add support for mobile viewports

Add viewport configuration options for mobile device testing.
Includes common device presets and custom viewport settings.

Closes #123
```

## Documentation

- Update JSDoc comments for any API changes
- Add examples for new features
- Keep README.md up to date
- Document breaking changes clearly

## Release Process

Releases are automated using GitHub Actions. To trigger a release:

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create a PR with these changes
4. Once merged, tag the commit: `git tag v0.1.0`
5. Push the tag: `git push origin v0.1.0`

## Questions?

Feel free to:
- Open an issue for bugs or feature requests
- Start a discussion for questions
- Join our Discord community
- Email us at contribute@neurospec.dev

## Recognition

Contributors will be recognized in:
- The project README
- Release notes
- Our website's contributor page

Thank you for helping make NeuroSpec better!