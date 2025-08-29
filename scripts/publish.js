#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Automated publishing script for NeuralDiff SDK
 * Handles build, test, and publish workflow with proper error handling
 */

const PACKAGE_JSON_PATH = path.join(__dirname, '..', 'package.json');

function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  return packageJson.version;
}

function runCommand(command, description) {
  console.log(`\n🔄 ${description}...`);
  try {
    execSync(command, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    console.log(`✅ ${description} completed successfully`);
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    process.exit(1);
  }
}

function checkGitStatus() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8', cwd: path.join(__dirname, '..') });
    if (status.trim()) {
      console.error('❌ Git working directory is not clean. Please commit or stash changes before publishing.');
      console.log('Uncommitted changes:');
      console.log(status);
      process.exit(1);
    }
    console.log('✅ Git working directory is clean');
  } catch (error) {
    console.warn('⚠️  Could not check git status:', error.message);
  }
}

function checkNpmAuth() {
  try {
    execSync('npm whoami', { stdio: 'pipe' });
    console.log('✅ NPM authentication verified');
  } catch (error) {
    console.error('❌ NPM authentication failed. Please run "npm login" first.');
    process.exit(1);
  }
}

function createGitTag(version) {
  try {
    execSync(`git tag -a v${version} -m "Release v${version}"`, { cwd: path.join(__dirname, '..') });
    execSync('git push origin --tags', { cwd: path.join(__dirname, '..') });
    console.log(`✅ Created and pushed git tag v${version}`);
  } catch (error) {
    console.warn('⚠️  Could not create git tag:', error.message);
  }
}

function publishPackage(tag = 'latest') {
  const publishCommand = tag === 'latest' ? 'npm publish' : `npm publish --tag ${tag}`;
  runCommand(publishCommand, `Publishing to NPM with tag "${tag}"`);
}

function main() {
  const args = process.argv.slice(2);
  const tag = args[0] || 'latest';
  const skipChecks = args.includes('--skip-checks');
  
  console.log('🚀 Starting NeuralDiff SDK publish process...');
  
  const version = getCurrentVersion();
  console.log(`📦 Publishing version ${version} with tag "${tag}"`);
  
  if (!skipChecks) {
    // Pre-publish checks
    checkGitStatus();
    checkNpmAuth();
  }
  
  // Build and test
  runCommand('npm run clean || true', 'Cleaning previous build');
  runCommand('npm run build', 'Building package');
  runCommand('npm run test', 'Running tests');
  runCommand('npm run lint', 'Running linter');
  runCommand('npm run typecheck', 'Type checking');
  
  // Publish
  publishPackage(tag);
  
  if (!skipChecks && tag === 'latest') {
    createGitTag(version);
  }
  
  console.log(`\n🎉 Successfully published @neuraldiff/sdk@${version} to NPM!`);
  console.log(`📋 Install with: npm install @neuraldiff/sdk@${tag}`);
  
  // Post-publish verification
  setTimeout(() => {
    try {
      const publishedVersion = execSync(`npm view @neuraldiff/sdk@${tag} version`, { encoding: 'utf8' }).trim();
      if (publishedVersion === version) {
        console.log('✅ Package successfully published and verified on NPM registry');
      } else {
        console.warn(`⚠️  Version mismatch: expected ${version}, found ${publishedVersion}`);
      }
    } catch (error) {
      console.warn('⚠️  Could not verify published package:', error.message);
    }
  }, 5000);
}

if (require.main === module) {
  main();
}