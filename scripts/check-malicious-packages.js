/**
 * This script scans a Node.js project for known malicious package versions
 * associated with the September 2025 npm supply chain attack, as reported by Palo Alto Networks.
 *
 * It checks both:
 *   - pnpm-lock.yaml (used by pnpm for dependency resolution)
 *   - node_modules (installed packages)
 *
 * If any compromised versions are found, it prints a warning to the console.
 * This helps developers quickly assess whether their project may be affected
 * and take action to update or remove vulnerable dependencies.
 *
 * Cross-platform compatible: works on Windows, macOS, and Linux.
 *
 * Usage:
 *   1. Run `npm install yaml` to install the YAML parser.
 *   2. Execute with `node check-malicious-packages.js` from your project root.
 */

const fs = require('fs');
const path = require('path');

const maliciousPackages = {
  "ansi-styles": "6.2.2",
  "debug": "4.4.2",
  "chalk": "5.6.1",
  "supports-color": "10.2.1",
  "strip-ansi": "7.1.1",
  "ansi-regex": "6.2.1",
  "wrap-ansi": "9.0.1",
  "color-convert": "3.1.1",
  "color-name": "2.0.1",
  "is-arrayish": "0.3.3",
  "slice-ansi": "7.1.1",
  "color": "5.0.1",
  "color-string": "2.1.1",
  "simple-swizzle": "0.2.3",
  "supports-hyperlinks": "4.1.1",
  "has-ansi": "6.0.1",
  "chalk-template": "1.1.1",
  "backslash": "0.2.1"
};

let found = false;

// Check pnpm-lock.yaml without external deps (safe for preinstall)
const lockPath = path.join(process.cwd(), 'pnpm-lock.yaml');
if (fs.existsSync(lockPath)) {
  const lockContent = fs.readFileSync(lockPath, 'utf8');
  // Simple string/regex scan: look for lines like "name@version:" or "/name@version:" under packages
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [pkgName, version] of Object.entries(maliciousPackages)) {
    const pattern = new RegExp(
      `(^|\n)\s{0,6}(?:/)?${escapeRegex(pkgName)}@${escapeRegex(version)}\s*:`,
      'm'
    );
    if (pattern.test(lockContent)) {
      console.log(`⚠️ Found in pnpm-lock.yaml: ${pkgName}@${version}`);
      found = true;
    }
  }
} else {
  console.log('📦 pnpm-lock.yaml not found.');
}

// Check node_modules
const nodeModulesPath = path.join(process.cwd(), 'node_modules');
if (fs.existsSync(nodeModulesPath)) {
  for (const pkgName in maliciousPackages) {
    const pkgJsonPath = path.join(nodeModulesPath, pkgName, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkgData = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      if (pkgData.version === maliciousPackages[pkgName]) {
        console.log(`⚠️ Found in node_modules: ${pkgName}@${pkgData.version}`);
        found = true;
      }
    }
  }
} else {
  console.log('📁 node_modules directory not found.');
}

if (!found) {
  console.log('✅ No malicious packages detected.');
} else {
  // Abort install if run in a lifecycle script
  process.exit(1);
}