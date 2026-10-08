const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { PNG } = require("pngjs");
const { compareScreenshotPair } = require("../lib/pixel-diff");

function solidPng(width, height, r, g, b) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

test("unequal PNG sizes are minor and compare the overlap", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pixel-diff-"));
  const baseline = path.join(dir, "baseline.png");
  const target = path.join(dir, "target.png");
  fs.writeFileSync(baseline, solidPng(4, 4, 255, 0, 0));
  fs.writeFileSync(target, solidPng(8, 6, 255, 0, 0));
  const result = compareScreenshotPair(baseline, target, path.join(dir, "diff.png"));
  const dim = result.findings.find((f) => f.id === "pixel-dimension-mismatch");
  assert.ok(dim, "expected a dimension finding");
  assert.equal(dim.severity, "minor");
  assert.equal(result.clipped, true);
  assert.equal(result.width, 4);
  assert.equal(result.height, 4);
  assert.equal(
    result.findings.some((f) => f.severity === "blocking"),
    false,
  );
});
