const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const mergeScript = path.join(__dirname, "..", "merge-parity-report.js");
const { unwrapInventory, buildControlInventoryStatus } = require("../merge-parity-report");

test("unwrapInventory prefers review control-inventory arrays", () => {
  assert.deepEqual(unwrapInventory([{ id: "cta" }]), [{ id: "cta" }]);
  assert.deepEqual(unwrapInventory({ controlInventory: [{ id: "nav" }] }), [{ id: "nav" }]);
});

test("merge-parity-report reads review/control-inventory.json", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "merge-parity-"));
  const reviewDir = path.join(root, ".mash", "designs", "checkout", "review");
  fs.mkdirSync(reviewDir, { recursive: true });
  fs.writeFileSync(
    path.join(reviewDir, "control-inventory.json"),
    JSON.stringify([{ id: "hero-cta", name: "Continue", kind: "button", status: "pending" }]),
  );
  fs.writeFileSync(
    path.join(reviewDir, "parity-1440x900.json"),
    JSON.stringify({
      viewport: "1440x900",
      comparisonMethod: "png-live",
      findings: [{ id: "pixel-visual-diff", severity: "minor", element: "screenshot" }],
    }),
  );

  const stdout = execFileSync(
    process.execPath,
    [
      mergeScript,
      "--project-root",
      root,
      "--page-slug",
      "checkout",
      "--target-url",
      "http://127.0.0.1:3000",
      "--viewports",
      "1440x900",
    ],
    { encoding: "utf8" },
  );
  const summary = JSON.parse(stdout);
  assert.equal(summary.aligned, true);
  const merged = JSON.parse(fs.readFileSync(path.join(reviewDir, "merged-reviewer-findings.json"), "utf8"));
  assert.equal(merged.controlInventoryStatus[0].id, "hero-cta");
  const status = buildControlInventoryStatus(null, null, [{ id: "hero-cta" }]);
  assert.equal(status[0].id, "hero-cta");
});
