/** Directories excluded from project architecture scans and token walks. */
const SCAN_IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".cursor",
  ".github",
]);

module.exports = { SCAN_IGNORE_DIRS };
