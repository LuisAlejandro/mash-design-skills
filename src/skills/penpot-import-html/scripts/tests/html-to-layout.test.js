const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const script = path.join(__dirname, "..", "html-to-layout.js");
const html = path.join(__dirname, "fixtures", "titled-page.html");

test("meta.slug follows --page-slug, not the HTML title", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "html-to-layout-"));
  const outPath = path.join(outDir, "layout.json");
  execFileSync(
    process.execPath,
    [script, "--html", html, "--page-slug", "checkout-flow", "--out", outPath],
    { encoding: "utf8" },
  );
  const layout = JSON.parse(fs.readFileSync(outPath, "utf8"));
  assert.equal(layout.meta.slug, "checkout-flow");
  assert.equal(layout.meta.name, "Dashboard Home");
});
