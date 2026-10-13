const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const script = path.join(__dirname, "..", "html-to-layout.js");
const html = path.join(__dirname, "fixtures", "titled-page.html");
const gridHtml = path.join(__dirname, "fixtures", "grid-page.html");

function runLayout(source, slug) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "html-to-layout-"));
  const outPath = path.join(outDir, "layout.json");
  execFileSync(process.execPath, [script, "--html", source, "--page-slug", slug, "--out", outPath], {
    encoding: "utf8",
  });
  return JSON.parse(fs.readFileSync(outPath, "utf8"));
}

function findNode(nodes, name) {
  for (const node of nodes || []) {
    if (node.name === name || node.id === name) return node;
    const child = findNode(node.children, name);
    if (child) return child;
  }
  return null;
}

test("meta.slug follows --page-slug, not the HTML title", () => {
  const layout = runLayout(html, "checkout-flow");
  assert.equal(layout.meta.slug, "checkout-flow");
  assert.equal(layout.meta.name, "Dashboard Home");
});

test("grid columns stay horizontal and media queries do not override the desktop table", () => {
  const layout = runLayout(gridHtml, "harbor-board");
  assert.equal(layout.tokens.palette.bg, "#f7f4ee");
  assert.equal(layout.tokens.typography.body.family, "Avenir Next");
  assert.equal(layout.tokens.typography.heading.size, 40);
  const metrics = findNode(layout.layout, "metrics");
  assert.equal(metrics.type, "row");
  assert.equal(metrics.layout.dir, "row");
  assert.equal(metrics.layout.gap, 24);
  const table = findNode(layout.layout, "arrivals-table");
  assert.equal(table.type, "column");
  assert.notEqual(table.height, 1);
  const row = findNode(table.children, "tr");
  assert.equal(row.type, "row");
  const alertValue = findNode(layout.layout, "metric-value");
  assert.equal(alertValue.fill, "color-alert");
});
