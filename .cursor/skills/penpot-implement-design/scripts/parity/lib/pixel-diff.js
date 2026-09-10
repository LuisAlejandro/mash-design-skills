const fs = require("fs");
const path = require("path");

function loadPng(filePath) {
  const { PNG } = require("pngjs");
  return PNG.sync.read(fs.readFileSync(filePath));
}

function extractRect(png, width, height) {
  const { PNG } = require("pngjs");
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const srcStart = y * png.width * 4;
    const destStart = y * width * 4;
    out.data.set(png.data.subarray(srcStart, srcStart + width * 4), destStart);
  }
  return out;
}

function compareScreenshotPair(baselinePath, targetPath, diffPath, options = {}) {
  const threshold = options.threshold ?? 0.1;
  const mismatchBlockRatio = options.mismatchBlockRatio ?? 0.01;
  const mismatchMajorRatio = options.mismatchMajorRatio ?? 0.05;
  const visualSeverity = options.visualSeverity || "major";

  let pixelmatch;
  try {
    const loaded = require("pixelmatch");
    pixelmatch = typeof loaded === "function" ? loaded : loaded?.default || loaded?.pixelmatch;
    if (typeof pixelmatch !== "function") throw new Error("pixelmatch export is not a function");
  } catch {
    return {
      available: false,
      note: "pixelmatch not installed",
      findings: [],
    };
  }

  const baselineFull = loadPng(baselinePath);
  const targetFull = loadPng(targetPath);
  const findings = [];
  const sizeMismatch =
    baselineFull.width !== targetFull.width || baselineFull.height !== targetFull.height;

  if (sizeMismatch) {
    findings.push({
      id: "pixel-dimension-mismatch",
      severity: "minor",
      element: "screenshot",
      expected: `${baselineFull.width}x${baselineFull.height}`,
      observed: `${targetFull.width}x${targetFull.height}`,
      recommendation: "Compared the overlapping top-left region. Unequal PNG sizes are advisory.",
    });
  }

  const width = Math.min(baselineFull.width, targetFull.width);
  const height = Math.min(baselineFull.height, targetFull.height);
  if (width < 1 || height < 1) {
    return {
      available: true,
      width: baselineFull.width,
      height: baselineFull.height,
      targetWidth: targetFull.width,
      targetHeight: targetFull.height,
      mismatchRatio: 1,
      findings,
    };
  }

  const baseline = sizeMismatch ? extractRect(baselineFull, width, height) : baselineFull;
  const target = sizeMismatch ? extractRect(targetFull, width, height) : targetFull;
  const { PNG } = require("pngjs");
  const diff = new PNG({ width, height });
  const numDiffPixels = pixelmatch(baseline.data, target.data, diff.data, width, height, { threshold });

  if (diffPath) {
    fs.mkdirSync(path.dirname(diffPath), { recursive: true });
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
  }

  const mismatchRatio = numDiffPixels / (width * height);
  if (mismatchRatio > mismatchBlockRatio) {
    findings.push({
      id: "pixel-visual-diff",
      severity: mismatchRatio > mismatchMajorRatio ? visualSeverity : "minor",
      element: "full-page screenshot",
      expected: `<= ${(mismatchBlockRatio * 100).toFixed(2)}% pixel drift`,
      observed: `${(mismatchRatio * 100).toFixed(2)}% pixel drift (${numDiffPixels} px)`,
      recommendation: "Adjust spacing, typography, colors, or layout until visual parity is within threshold.",
    });
  }

  return {
    available: true,
    width,
    height,
    targetWidth: targetFull.width,
    targetHeight: targetFull.height,
    numDiffPixels,
    mismatchRatio,
    clipped: sizeMismatch,
    diffPath: diffPath || null,
    findings,
  };
}

module.exports = { compareScreenshotPair, extractRect };
