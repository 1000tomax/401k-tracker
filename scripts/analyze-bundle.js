#!/usr/bin/env node

/**
 * Bundle Analysis Script
 *
 * Analyzes build output and checks against performance budgets.
 * Run after `npm run build` to get detailed bundle analysis.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, '..', 'dist');
const BUDGETS_FILE = path.join(__dirname, '..', 'performance-budgets.json');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

function getDirectorySize(dir, extensions = []) {
  let size = 0;
  let count = 0;

  function traverse(currentPath) {
    const files = fs.readdirSync(currentPath);

    for (const file of files) {
      const filePath = path.join(currentPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        traverse(filePath);
      } else {
        if (extensions.length === 0 || extensions.some(ext => file.endsWith(ext))) {
          size += stat.size;
          count++;
        }
      }
    }
  }

  traverse(dir);
  return { size, count };
}

function analyzeBundle() {
  console.log(`${colors.bold}${colors.cyan}📦 Bundle Analysis${colors.reset}\n`);

  if (!fs.existsSync(DIST_DIR)) {
    console.error(`${colors.red}Error: dist directory not found. Run 'npm run build' first.${colors.reset}`);
    process.exit(1);
  }

  // Load budgets
  let budgets = null;
  if (fs.existsSync(BUDGETS_FILE)) {
    budgets = JSON.parse(fs.readFileSync(BUDGETS_FILE, 'utf-8'));
  }

  // Analyze by file type
  const jsStats = getDirectorySize(DIST_DIR, ['.js']);
  const cssStats = getDirectorySize(DIST_DIR, ['.css']);
  const imageStats = getDirectorySize(DIST_DIR, ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif']);
  const fontStats = getDirectorySize(DIST_DIR, ['.woff', '.woff2', '.ttf', '.eot']);
  const totalStats = getDirectorySize(DIST_DIR);

  console.log(`${colors.bold}Bundle Sizes:${colors.reset}`);
  console.log(`  JavaScript:  ${formatBytes(jsStats.size)} (${jsStats.count} files)`);
  console.log(`  CSS:         ${formatBytes(cssStats.size)} (${cssStats.count} files)`);
  console.log(`  Images:      ${formatBytes(imageStats.size)} (${imageStats.count} files)`);
  console.log(`  Fonts:       ${formatBytes(fontStats.size)} (${fontStats.count} files)`);
  console.log(`  ${colors.bold}Total:       ${formatBytes(totalStats.size)} (${totalStats.count} files)${colors.reset}\n`);

  // Check budgets
  if (budgets && budgets.budget) {
    console.log(`${colors.bold}Budget Compliance:${colors.reset}`);
    let violations = 0;

    // Check resource size budgets
    if (budgets.budget.resourceSizes) {
      for (const budget of budgets.budget.resourceSizes) {
        let actual = 0;
        let label = '';

        switch (budget.resourceType) {
          case 'script':
            actual = jsStats.size / 1024; // Convert to KB
            label = 'JavaScript';
            break;
          case 'stylesheet':
            actual = cssStats.size / 1024;
            label = 'CSS';
            break;
          case 'image':
            actual = imageStats.size / 1024;
            label = 'Images';
            break;
          case 'font':
            actual = fontStats.size / 1024;
            label = 'Fonts';
            break;
          case 'total':
            actual = totalStats.size / 1024;
            label = 'Total';
            break;
          default:
            continue;
        }

        const exceeded = actual > budget.budget;
        const percentage = ((actual / budget.budget) * 100).toFixed(1);
        const symbol = exceeded ? '❌' : '✅';
        const color = exceeded ? colors.red : colors.green;

        console.log(
          `  ${symbol} ${label}: ${formatBytes(actual * 1024)} / ${budget.budget} KB ${color}(${percentage}%)${colors.reset}`
        );

        if (exceeded) violations++;
      }
    }

    console.log();

    if (violations > 0) {
      console.log(`${colors.red}${colors.bold}⚠️  ${violations} budget violation(s) detected!${colors.reset}\n`);
      process.exit(1);
    } else {
      console.log(`${colors.green}${colors.bold}✅ All budgets met!${colors.reset}\n`);
    }
  }

  // List largest files
  console.log(`${colors.bold}Largest Files:${colors.reset}`);
  const files = [];

  function collectFiles(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        collectFiles(fullPath);
      } else {
        files.push({
          path: path.relative(DIST_DIR, fullPath),
          size: stat.size,
        });
      }
    }
  }

  collectFiles(DIST_DIR);
  files.sort((a, b) => b.size - a.size);

  for (let i = 0; i < Math.min(10, files.length); i++) {
    const file = files[i];
    console.log(`  ${i + 1}. ${file.path} - ${formatBytes(file.size)}`);
  }

  console.log();
}

// Run analysis
analyzeBundle();
