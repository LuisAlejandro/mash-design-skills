const test = require("node:test");
const assert = require("node:assert/strict");
const { compareStructuralDom } = require("../lib/structural-dom-diff");

test("tag mismatch is minor", () => {
  const findings = compareStructuralDom(
    [{ tag: "button", role: "button", stableId: "cta", depth: 2, text: "Save" }],
    [{ tag: "div", role: "button", stableId: "cta", depth: 2, text: "Save" }],
  );
  const mismatch = findings.find((f) => f.id.startsWith("dom-mismatch"));
  assert.ok(mismatch);
  assert.equal(mismatch.severity, "minor");
});
