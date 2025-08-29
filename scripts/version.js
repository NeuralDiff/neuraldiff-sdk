#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Automated versioning script for NeuralDiff SDK
 * Supports semantic versioning with automatic changelog generation
 */

const PACKAGE_JSON_PATH = path.join(__dirname, '..', 'package.json');
const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md');

function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  return packageJson.version;
}

function updateVersion(newVersion) {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  packageJson.version = newVersion;
  fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2) + '\n');
  return newVersion;
}

function generateChangelog(version) {
  try {
    // Get commits since last tag
    const lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
    const commits = execSync(`git log ${lastTag}..HEAD --oneline --no-merges`, { encoding: 'utf8' }).trim();
    
    if (!commits) {
      console.log('No new commits since last release');
      return;
    }

    const date = new Date().toISOString().split('T')[0];
    const changelogEntry = `\n## [${version}] - ${date}\n\n${commits.split('\n').map(commit => `- ${commit}`).join('\n')}\n`;
    
    let changelog = '';
    if (fs.existsSync(CHANGELOG_PATH)) {
      changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    } else {
      changelog = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n';
    }
    
    // Insert new entry after the header
    const lines = changelog.split('\n');
    const headerEndIndex = lines.findIndex(line => line.startsWith('## '));
    if (headerEndIndex === -1) {
      changelog += changelogEntry;
    } else {
      lines.splice(headerEndIndex, 0, ...changelogEntry.split('\n'));
      changelog = lines.join('\n');
    }
    
    fs.writeFileSync(CHANGELOG_PATH, changelog);
    console.log(`Updated CHANGELOG.md with version ${version}`);
  } catch (error) {
    console.warn('Could not generate changelog:', error.message);
  }
}

function bumpVersion(type = 'patch') {
  const currentVersion = getCurrentVersion();
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  
  let newVersion;
  switch (type) {
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
    default:
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
  }
  
  return newVersion;
}

function main() {
  const args = process.argv.slice(2);
  const versionType = args[0] || 'patch';
  const customVersion = args[1];
  
  if (customVersion) {
    // Use custom version
    if (!/^\d+\.\d+\.\d+(-\w+(\.\d+)?)?$/.test(customVersion)) {
      console.error('Invalid version format. Use semantic versioning (e.g., 1.0.0, 1.0.0-beta.1)');
      process.exit(1);
    }
    updateVersion(customVersion);
    generateChangelog(customVersion);
    console.log(`Version updated to ${customVersion}`);
  } else {
    // Auto-bump version
    const newVersion = bumpVersion(versionType);
    updateVersion(newVersion);
    generateChangelog(newVersion);
    console.log(`Version bumped from ${getCurrentVersion()} to ${newVersion}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { getCurrentVersion, updateVersion, bumpVersion, generateChangelog };