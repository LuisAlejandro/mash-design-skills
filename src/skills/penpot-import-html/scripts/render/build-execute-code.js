#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[name] = true;
    else {
      args[name] = next;
      i += 1;
    }
  }
  return args;
}

function js(value) {
  return JSON.stringify(value);
}

function asPx(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return `${value}px`;
  const text = String(value).trim();
  if (/^-?[\d.]+$/.test(text)) return `${text}px`;
  return text;
}

function setNameFromLayout(layout) {
  const slug = layout?.meta?.slug || "page";
  return `import-${slug}`;
}

function paletteEntries(layout) {
  const palette = layout?.tokens?.palette || {};
  return Object.entries(palette).map(([name, color]) => ({ name, color: String(color) }));
}

function spacingEntries(layout) {
  const spacing = layout?.tokens?.spacing || {};
  return Object.entries(spacing)
    .map(([name, value]) => ({ name, value: asPx(value) }))
    .filter((entry) => entry.value);
}

function typographyEntries(layout) {
  const typography = layout?.tokens?.typography || {};
  return Object.entries(typography).map(([name, spec]) => {
    if (spec && typeof spec === "object") {
      return {
        name,
        family: spec.family || spec.fontFamily || "Inter",
        size: asPx(spec.size || spec.fontSize) || "16px",
        weight: String(spec.weight || spec.fontWeight || 400),
        lineHeight: spec.lineHeight != null ? String(spec.lineHeight) : "",
      };
    }
    return { name, family: "Inter", size: "16px", weight: "400", lineHeight: "" };
  });
}

function buildCreateTokens(layout) {
  const setName = setNameFromLayout(layout);
  const lines = [
    `var catalog = penpot.library.local.tokens;`,
    `var set = catalog.addSet(${js(setName)});`,
    `if (set && !set.active) set.toggleActive();`,
    `var created = [];`,
  ];
  for (const { name, color } of paletteEntries(layout)) {
    lines.push(`created.push({ kind: "color", name: ${js(name)}, token: set.addToken("color", ${js(name)}, ${js(color)}) });`);
  }
  for (const { name, value } of spacingEntries(layout)) {
    lines.push(`created.push({ kind: "spacing", name: ${js(name)}, token: set.addToken("spacing", ${js(name)}, ${js(value)}) });`);
  }
  for (const entry of typographyEntries(layout)) {
    lines.push(`created.push({ kind: "fontSizes", name: ${js(entry.name)}, token: set.addToken("fontSizes", ${js(entry.name)}, ${js(entry.size)}) });`);
    lines.push(`created.push({ kind: "fontFamilies", name: ${js(entry.name)}, token: set.addToken("fontFamilies", ${js(entry.name)}, ${js(entry.family)}) });`);
    lines.push(`created.push({ kind: "fontWeights", name: ${js(entry.name)}, token: set.addToken("fontWeights", ${js(entry.name)}, ${js(entry.weight)}) });`);
  }
  lines.push(`return { setName: set.name, created: created };`);
  return `${lines.join("\n")}\n`;
}

function buildCreateColors(layout) {
  const lines = [`var created = [];`];
  for (const { name, color } of paletteEntries(layout)) {
    lines.push(`(function () {`);
    lines.push(`  var c = penpot.library.local.createColor();`);
    lines.push(`  c.name = ${js(name)};`);
    lines.push(`  c.color = ${js(color)};`);
    lines.push(`  created.push({ name: c.name, id: c.id });`);
    lines.push(`})();`);
  }
  lines.push(`return { colors: created };`);
  return `${lines.join("\n")}\n`;
}

function buildCreateTypographies(layout) {
  const lines = [`var created = [];`];
  for (const entry of typographyEntries(layout)) {
    lines.push(`(function () {`);
    lines.push(`  var t = penpot.library.local.createTypography();`);
    lines.push(`  t.name = ${js(entry.name)};`);
    lines.push(`  t.fontFamily = ${js(entry.family)};`);
    lines.push(`  t.fontSize = ${js(entry.size)};`);
    lines.push(`  t.fontWeight = ${js(entry.weight)};`);
    if (entry.lineHeight) lines.push(`  t.lineHeight = ${js(entry.lineHeight)};`);
    lines.push(`  created.push({ name: t.name, id: t.id });`);
    lines.push(`})();`);
  }
  lines.push(`return { typographies: created };`);
  return `${lines.join("\n")}\n`;
}

function writeExecuteCode(layout, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = {
    "create-tokens.js": buildCreateTokens(layout),
    "create-colors.js": buildCreateColors(layout),
    "create-typographies.js": buildCreateTypographies(layout),
  };
  const written = [];
  for (const [name, source] of Object.entries(files)) {
    const dest = path.join(outDir, name);
    fs.writeFileSync(dest, source);
    written.push(dest);
  }
  return written;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.layout || !args["out-dir"]) {
    console.error("Usage: node build-execute-code.js --layout <layout.json> --out-dir <dir>");
    process.exit(1);
  }
  const layoutPath = path.resolve(args.layout);
  const layout = JSON.parse(fs.readFileSync(layoutPath, "utf8"));
  const written = writeExecuteCode(layout, path.resolve(args["out-dir"]));
  process.stdout.write(`${JSON.stringify({ written: written.map((p) => path.relative(process.cwd(), p)) }, null, 2)}\n`);
}

module.exports = {
  parseArgs,
  setNameFromLayout,
  paletteEntries,
  spacingEntries,
  typographyEntries,
  buildCreateTokens,
  buildCreateColors,
  buildCreateTypographies,
  writeExecuteCode,
};

if (require.main === module) main();
