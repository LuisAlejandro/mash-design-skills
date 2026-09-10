const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  setNameFromLayout,
  buildCreateTokens,
  buildCreateColors,
  writeExecuteCode,
} = require("../render/build-execute-code");

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "layout.json"), "utf8"),
);

test("token set name uses meta.slug", () => {
  assert.equal(setNameFromLayout(fixture), "import-checkout-flow");
});

test("builder emits palette and typography from layout.json", () => {
  const tokens = buildCreateTokens(fixture);
  assert.match(tokens, /addSet\("import-checkout-flow"\)/);
  assert.match(tokens, /addToken\("color", "accent", "#2563eb"\)/);
  assert.match(tokens, /addToken\("spacing", "md", "16px"\)/);
  assert.match(tokens, /addToken\("fontSizes", "heading", "32px"\)/);

  const colors = buildCreateColors(fixture);
  assert.match(colors, /c\.name = "bg"/);
  assert.match(colors, /c\.color = "#ffffff"/);
});

test("writeExecuteCode writes three execute_code files", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "execute-code-"));
  writeExecuteCode(fixture, outDir);
  const tokens = fs.readFileSync(path.join(outDir, "create-tokens.js"), "utf8");
  const types = fs.readFileSync(path.join(outDir, "create-typographies.js"), "utf8");
  assert.match(tokens, /set\.addToken\("color"/);
  assert.match(types, /createTypography\(\)/);
  assert.match(types, /t\.fontFamily = "Inter"/);
});
