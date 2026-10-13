#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { textContent, parseStyle, walk } = require("./serialize-html");

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

function slugify(value, fallback = "page") {
  return (
    String(value || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || fallback
  );
}

function tokenNameFromCssVar(name) {
  return String(name)
    .replace(/^--/, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "token";
}

function parsePx(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const match = String(value).trim().match(/^(-?[\d.]+)px$/i);
  if (match) return Number(match[1]);
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseColor(value) {
  if (!value || value === "transparent" || value === "inherit" || value === "currentcolor") return null;
  const trimmed = String(value).trim();
  if (/^#(?:[0-9a-fA-F]{3,8})$/.test(trimmed)) return trimmed;
  if (/^(?:rgba?|hsla?)\(/i.test(trimmed)) return trimmed;
  return null;
}

function expandBox(value) {
  if (value == null || value === "") return {};
  const parts = String(value).trim().split(/\s+/);
  const nums = parts.map((part) => parsePx(part, null));
  if (nums.some((n) => n == null) || nums.length === 0) return {};
  if (nums.length === 1) return { top: nums[0], right: nums[0], bottom: nums[0], left: nums[0] };
  if (nums.length === 2) return { top: nums[0], right: nums[1], bottom: nums[0], left: nums[1] };
  if (nums.length === 3) return { top: nums[0], right: nums[1], bottom: nums[2], left: nums[1] };
  return { top: nums[0], right: nums[1], bottom: nums[2], left: nums[3] };
}

function parseSpacingBox(styles, prefix) {
  const shorthand = expandBox(styles[prefix]);
  return {
    top: parsePx(styles[`${prefix}-top`], shorthand.top ?? 0) ?? 0,
    right: parsePx(styles[`${prefix}-right`], shorthand.right ?? 0) ?? 0,
    bottom: parsePx(styles[`${prefix}-bottom`], shorthand.bottom ?? 0) ?? 0,
    left: parsePx(styles[`${prefix}-left`], shorthand.left ?? 0) ?? 0,
  };
}

function resolveCssValue(value, variables, seen = new Set(), depth = 0) {
  if (value == null || depth > 8) return value == null ? "" : String(value);
  return String(value).replace(/var\(\s*(--[A-Za-z0-9-_]+)(?:\s*,\s*([^)]*))?\)/g, (full, name, fallback) => {
    if (seen.has(name)) return fallback ? fallback.trim() : full;
    const next = variables[name];
    if (next == null) return fallback ? resolveCssValue(fallback.trim(), variables, seen, depth + 1) : full;
    seen.add(name);
    const resolved = resolveCssValue(next, variables, seen, depth + 1);
    seen.delete(name);
    return resolved;
  });
}

function resolveCssVariables(variables) {
  const resolved = {};
  for (const [name, value] of Object.entries(variables || {})) {
    resolved[name] = resolveCssValue(value, variables);
  }
  for (const [name, value] of Object.entries(resolved)) {
    resolved[name] = resolveCssValue(value, resolved);
  }
  return resolved;
}

function stripAtMedia(css) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf("@media", i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, at);
    const open = css.indexOf("{", at);
    if (open === -1) break;
    let depth = 0;
    let j = open;
    for (; j < css.length; j += 1) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}") {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    i = j;
  }
  return out;
}

function trackCount(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.toLowerCase() === "none") return 0;
  const repeat = raw.match(/^repeat\(\s*(\d+)/i);
  if (repeat) return Number(repeat[1]);
  let depth = 0;
  let count = 0;
  let token = "";
  const flush = () => {
    if (token.trim()) count += 1;
    token = "";
  };
  for (const ch of raw) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (/\s/.test(ch) && depth === 0) flush();
    else token += ch;
  }
  flush();
  return count;
}

function isSkippedTag(tag) {
  return ["script", "style", "link", "meta", "title", "head", "noscript", "template"].includes(tag);
}

function isTextishTag(tag) {
  return ["h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "label", "button", "a", "li", "td", "th", "figcaption", "small", "strong", "em"].includes(
    tag,
  );
}

function uniqueName(base, used) {
  let name = base || "shape";
  let i = 2;
  while (used.has(name)) {
    name = `${base}-${i}`;
    i += 1;
  }
  used.add(name);
  return name;
}

function paletteFor(color, palette, usedNames) {
  if (!color) return null;
  for (const [name, value] of Object.entries(palette)) {
    if (String(value).toLowerCase() === String(color).toLowerCase()) return name;
  }
  const name = uniqueName(`color-${Object.keys(palette).length + 1}`, usedNames);
  palette[name] = color;
  return name;
}

function collectCssVariables(serialized, tokenResult) {
  const palette = {};
  const used = new Set();
  const vars = resolveCssVariables({
    ...(serialized.cssVariables || {}),
    ...(tokenResult?.extractedTokens?.cssVariables || {}),
  });
  for (const [rawName, rawValue] of Object.entries(vars)) {
    const color = parseColor(rawValue);
    if (!color) continue;
    const name = uniqueName(tokenNameFromCssVar(rawName), used);
    palette[name] = color;
  }
  for (const color of tokenResult?.extractedTokens?.colors || []) {
    paletteFor(color, palette, used);
  }
  if (!palette.bg) palette.bg = "#ffffff";
  if (!palette.text) palette.text = "#111827";
  return palette;
}

function inferFlex(styles) {
  const display = String(styles.display || "").toLowerCase();
  const direction = String(styles["flex-direction"] || "").toLowerCase();
  if (display === "flex" || display === "inline-flex" || direction) {
    return direction === "column" || direction === "column-reverse" ? "column" : "row";
  }
  if (display === "grid" || display === "inline-grid") {
    const cols = trackCount(styles["grid-template-columns"]);
    const rows = trackCount(styles["grid-template-rows"]);
    if (cols > 1) return "row";
    if (rows > 1 && cols <= 1) return "column";
    return "row";
  }
  return null;
}

function firstText(node) {
  if (!node) return "";
  if (node.type === "text") return node.value || "";
  return textContent(node).replace(/\s+/g, " ").trim();
}

function mapNode(node, ctx) {
  if (!node) return null;
  if (node.type === "text") {
    const characters = (node.value || "").replace(/\s+/g, " ").trim();
    if (!characters) return null;
    const id = `text-${ctx.nextId()}`;
    return {
      id,
      type: "text",
      name: uniqueName("text", ctx.usedNames),
      characters,
      fill: "text",
      typography: "body",
    };
  }
  if (node.type !== "element" || isSkippedTag(node.tag)) return null;

  const styles = node.styles || {};
  const children = (node.children || []).map((child) => mapNode(child, ctx)).filter(Boolean);
  const id = uniqueName(node.attrs?.id || node.classes?.[0] || node.tag || "shape", ctx.usedIds);
  const name = uniqueName(node.attrs?.id || node.classes?.[0] || node.tag || "shape", ctx.usedNames);

  if (node.tag === "img") {
    const src = node.attrs?.src || "";
    if (src) ctx.assets.push({ id, src, name });
    return {
      id,
      type: "image",
      name,
      src,
      alt: node.attrs?.alt || "",
      width: parsePx(styles.width, parsePx(node.attrs?.width, 120)),
      height: parsePx(styles.height, parsePx(node.attrs?.height, 80)),
    };
  }

  const characters = firstText(node);
  const onlyText =
    children.length === 0 ||
    (children.length === 1 && children[0].type === "text" && !children[0].children);
  if (isTextishTag(node.tag) && onlyText && characters) {
    const fill = paletteFor(parseColor(styles.color), ctx.palette, ctx.usedTokenNames) || "text";
    const size = parsePx(styles["font-size"], node.tag.startsWith("h") ? 24 : 16);
    return {
      id,
      type: "text",
      name,
      characters,
      fill,
      fontSize: size,
      fontWeight: parsePx(styles["font-weight"], node.tag.startsWith("h") ? 700 : 400),
      fontFamily: styles["font-family"] ? String(styles["font-family"]).split(",")[0].replace(/['"]/g, "").trim() : undefined,
      typography: node.tag.startsWith("h") ? "heading" : "body",
    };
  }

  let dir = inferFlex(styles);
  if (node.tag === "tr") dir = "row";
  else if (node.tag === "table" || node.tag === "thead" || node.tag === "tbody") dir = "column";
  const bg = paletteFor(parseColor(styles["background-color"] || styles.background), ctx.palette, ctx.usedTokenNames);
  const width = parsePx(styles.width, null);
  const height = parsePx(styles.height, null);
  const padding = parseSpacingBox(styles, "padding");
  const gap = parsePx(styles.gap, parsePx(styles["row-gap"], parsePx(styles["column-gap"], 0)));
  const radius = parsePx(styles["border-radius"], 0);

  const mapped = {
    id,
    type: dir === "row" ? "row" : dir === "column" ? "column" : "board",
    name,
    children,
  };
  if (width != null) mapped.width = width;
  if (height != null) mapped.height = height;
  if (bg) mapped.fill = bg;
  if (radius) mapped.borderRadius = radius;
  if (dir) {
    mapped.layout = {
      dir,
      gap: gap || 0,
      padding,
      alignItems: styles["align-items"] || undefined,
      justifyContent: styles["justify-content"] || undefined,
    };
  } else if (padding.top || padding.right || padding.bottom || padding.left) {
    mapped.layout = { dir: "column", gap: gap || 0, padding };
    mapped.type = "column";
  }
  return mapped;
}

function applyStyleBlocks(serialized) {
  const variables = resolveCssVariables(serialized.cssVariables || {});
  serialized.cssVariables = variables;
  const rules = [];
  for (const block of serialized.styleBlocks || []) {
    const cleaned = stripAtMedia(String(block).replace(/\/\*[\s\S]*?\*\//g, ""));
    const regex = /([^{]+)\{([^}]+)\}/g;
    let match;
    while ((match = regex.exec(cleaned))) {
      const styles = parseStyle(match[2]);
      for (const selector of match[1].split(",")) {
        const sel = selector.trim();
        if (sel && sel !== ":root" && !sel.startsWith("@")) rules.push({ sel, styles });
      }
    }
  }

  function matchesSimple(node, sel) {
    if (!node || node.type !== "element") return false;
    const base = sel.trim().split(/[:[]/)[0];
    if (!base || /[>+~]/.test(base)) return false;
    if (base.startsWith(".")) return (node.classes || []).includes(base.slice(1));
    if (base.startsWith("#")) return node.attrs?.id === base.slice(1);
    return node.tag === base.toLowerCase();
  }

  function matches(node, sel) {
    const parts = sel.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return false;
    let current = node;
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      if (i === parts.length - 1) {
        if (!matchesSimple(current, parts[i])) return false;
        continue;
      }
      let ancestor = current.parent;
      let found = false;
      while (ancestor) {
        if (matchesSimple(ancestor, parts[i])) {
          current = ancestor;
          found = true;
          break;
        }
        ancestor = ancestor.parent;
      }
      if (!found) return false;
    }
    return true;
  }

  function linkParents(node, parent = null) {
    if (!node || typeof node !== "object") return;
    node.parent = parent;
    for (const child of node.children || []) linkParents(child, node);
  }

  linkParents(serialized.dom);

  walk(serialized.dom, (node) => {
    if (node.type !== "element") return;
    let merged = {};
    for (const rule of rules) {
      if (matches(node, rule.sel)) merged = { ...merged, ...rule.styles };
    }
    const styles = {};
    for (const [key, value] of Object.entries({ ...merged, ...(node.styles || {}) })) {
      styles[key] = resolveCssValue(value, variables);
    }
    node.styles = styles;
  });
}

function findBody(serialized) {
  const root = serialized.dom;
  if (!root) return { type: "root", children: [] };
  const children = root.children || [];
  const html = children.find((child) => child.type === "element" && child.tag === "html");
  const fromHtml = html?.children || [];
  const body = [...children, ...fromHtml].find((child) => child.type === "element" && child.tag === "body");
  return body || root;
}

function fontFamilyName(value) {
  if (!value) return "";
  return String(value).split(",")[0].replace(/['"]/g, "").trim();
}

function buildTypography(serialized) {
  const body = findBody(serialized);
  const bodyStyles = body?.styles || {};
  let headingStyles = null;
  walk(serialized.dom, (node) => {
    if (!headingStyles && node.type === "element" && node.tag === "h1") headingStyles = node.styles || {};
  });
  const bodyFamily = fontFamilyName(bodyStyles["font-family"]) || "Inter";
  const headingFamily = fontFamilyName(headingStyles?.["font-family"]) || bodyFamily;
  return {
    heading: {
      family: headingFamily,
      size: parsePx(headingStyles?.["font-size"], 32) || 32,
      weight: parsePx(headingStyles?.["font-weight"], 700) || 700,
      lineHeight: 1.2,
    },
    body: {
      family: bodyFamily,
      size: parsePx(bodyStyles["font-size"], 16) || 16,
      weight: parsePx(bodyStyles["font-weight"], 400) || 400,
      lineHeight: 1.5,
    },
  };
}

function spacingFromVariables(variables) {
  const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 };
  for (const [name, value] of Object.entries(variables || {})) {
    if (!/space|gap|padding|margin/i.test(name)) continue;
    const px = parsePx(value, null);
    if (px == null) continue;
    spacing[tokenNameFromCssVar(name)] = px;
  }
  return spacing;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.html || !args["page-slug"]) {
    console.error(
      "Usage: node html-to-layout.js --html <path> --page-slug <slug> [--project-root <root>] [--assets-dir <dir>] [--out <path>]",
    );
    process.exit(1);
  }

  const htmlPath = path.resolve(args.html);
  const scriptsDir = __dirname;
  const serialized = JSON.parse(
    execFileSync(
      process.execPath,
      [
        path.join(scriptsDir, "serialize-html.js"),
        "--html",
        htmlPath,
        ...(args["assets-dir"] ? ["--assets-dir", path.resolve(args["assets-dir"])] : []),
      ],
      { encoding: "utf8" },
    ),
  );
  applyStyleBlocks(serialized);

  let tokenResult = { extractedTokens: { cssVariables: serialized.cssVariables || {}, colors: [] } };
  try {
    tokenResult = JSON.parse(
      execFileSync(
        process.execPath,
        [
          path.join(scriptsDir, "resolve-tokens.js"),
          "--html",
          htmlPath,
          ...(args["project-root"] ? ["--project-root", path.resolve(args["project-root"])] : []),
          ...(args["assets-dir"] ? ["--assets-dir", path.resolve(args["assets-dir"])] : []),
        ],
        { encoding: "utf8" },
      ),
    );
  } catch {
    // Token resolution is best-effort; layout still proceeds from serialized CSS.
  }

  const palette = collectCssVariables(serialized, tokenResult);
  const ctx = {
    palette,
    assets: [],
    usedNames: new Set(),
    usedIds: new Set(),
    usedTokenNames: new Set(Object.keys(palette)),
    nextId: (() => {
      let n = 0;
      return () => {
        n += 1;
        return n;
      };
    })(),
  };

  const body = findBody(serialized);
  const bodyNode = mapNode(body.type === "element" ? body : { type: "element", tag: "body", attrs: {}, classes: [], styles: {}, children: body.children || [] }, ctx);
  const layoutNodes = bodyNode ? [bodyNode] : [];
  const pageSlug = slugify(args["page-slug"]);
  const pageName = String(serialized.title || pageSlug).trim() || pageSlug;

  const result = {
    meta: {
      name: pageName,
      slug: pageSlug,
      width: 1440,
      height: "auto",
      background: "bg",
      sourceHtml: htmlPath,
    },
    tokens: {
      palette,
      spacing: spacingFromVariables(serialized.cssVariables),
      typography: buildTypography(serialized),
    },
    assets: ctx.assets,
    layout: layoutNodes,
    controlInventory: serialized.controlInventory || [],
    serializedTitle: serialized.title || null,
  };

  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (args.out) {
    const outPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, json);
  } else {
    process.stdout.write(json);
  }
}

if (require.main === module) main();
