#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { parseHtml } = require("./serialize-html");
const { compareStructuralDom } = require("./lib/structural-dom-diff");
const { compareScreenshotPair } = require("./lib/pixel-diff");
const { gotoReady } = require("./lib/playwright-nav");

function skillsPrefix() {
  return path.resolve(__dirname, "..", "..");
}

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

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

function flattenDom(node, items = [], depth = 0, pathSegments = []) {
  if (!node) return items;
  if (node.type === "element") {
    const segment = `${node.tag}${node.attrs?.id ? `#${node.attrs.id}` : ""}`;
    const nextPath = [...pathSegments, segment];
    items.push({
      depth,
      tag: node.tag,
      role: node.attrs?.role || null,
      id: node.attrs?.id || null,
      classes: (node.classes || []).slice(0, 8),
      path: nextPath.join(">"),
    });
    if (node.children) {
      node.children.forEach((child) => flattenDom(child, items, depth + 1, nextPath));
    }
    return items;
  }
  if (node.children) node.children.forEach((child) => flattenDom(child, items, depth));
  return items;
}

async function captureRenderedDom(page) {
  return page.evaluate(() => {
    const skip = new Set(["script", "style", "noscript"]);
    const items = [];

    function stableIdFor(el, kind, pathValue, textValue) {
      const parts = [
        kind,
        el.tagName.toLowerCase(),
        el.id || "",
        el.getAttribute("name") || "",
        el.getAttribute("role") || "",
        el.getAttribute("aria-label") || "",
        el.getAttribute("href") || "",
        el.getAttribute("alt") || "",
        el.getAttribute("placeholder") || "",
        el.getAttribute("type") || "",
        Array.from(el.classList).slice(0, 6).join("."),
        pathValue,
        (textValue || "").replace(/\s+/g, " ").trim().slice(0, 80),
      ];
      let hash = 0;
      const input = parts.join("|");
      for (let i = 0; i < input.length; i += 1) hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
      return `${kind}-${hash.toString(16).padStart(12, "0").slice(0, 12)}`;
    }

    function textFor(el) {
      return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
    }

    function classify(el) {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      const type = el.getAttribute("type");
      if (tag === "button" || role === "button") return "button";
      if (tag === "a" && el.getAttribute("href")) return "link";
      if (tag === "input") return type || "input";
      if (tag === "select") return "select";
      if (tag === "textarea") return "textarea";
      if (/^h[1-6]$/.test(tag)) return "heading";
      if (tag === "img" || tag === "svg") return "image";
      if (tag === "nav" || role === "navigation") return "navbar";
      if (tag === "form") return "form";
      return null;
    }

    function walk(el, depth, pathSegments) {
      if (!el || el.nodeType !== 1) return;
      const tag = el.tagName.toLowerCase();
      if (skip.has(tag)) return;
      const segment = el.id ? `${tag}#${el.id}` : tag;
      const nextPath = [...pathSegments, segment];
      const kind = classify(el);
      if (kind) {
        const text = textFor(el);
        items.push({
          depth,
          tag,
          role: el.getAttribute("role"),
          id: el.id || null,
          classes: Array.from(el.classList).slice(0, 8),
          text,
          stableId: stableIdFor(el, kind, nextPath.join(">"), text),
        });
      }
      for (const child of el.children) walk(child, depth + 1, nextPath);
    }

    if (document.body) walk(document.body, 0, []);
    return items;
  });
}

async function runPlaywrightComparison(baselineUrl, targetUrl, viewport, options = {}) {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    return null;
  }

  const [width, height] = viewport.split("x").map(Number);
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height } });
  const targetPage = await context.newPage();
  const baselinePage = baselineUrl ? await context.newPage() : null;

  const navOptions = {
    waitUntil: options.waitUntil || "domcontentloaded",
    settleMs: Number(options.settleMs || 500),
    waitSelector: options.waitSelector || null,
    timeout: Number(options.timeout || 45000),
  };

  const navs = [gotoReady(targetPage, targetUrl, navOptions)];
  if (baselinePage && baselineUrl) navs.unshift(gotoReady(baselinePage, baselineUrl, navOptions));
  await Promise.all(navs);

  let domFindings = [];
  const styleFindings = [];
  if (baselinePage && baselineUrl) {
    const [baselineDom, targetDom] = await Promise.all([
      captureRenderedDom(baselinePage),
      captureRenderedDom(targetPage),
    ]);
    domFindings = compareStructuralDom(baselineDom, targetDom);

    const selectors = ["body", "h1", "h2", "button", "a", "input", "nav", "main", "header", "footer"];
    const props = ["color", "font-size", "font-family", "padding", "margin", "border-radius", "display"];

    for (const selector of selectors) {
      const baselineExists = await baselinePage.locator(selector).first().count();
      const targetExists = await targetPage.locator(selector).first().count();
      if (!baselineExists && !targetExists) continue;
      if (baselineExists !== targetExists) {
        styleFindings.push({
          id: `css-${selector}-presence`,
          severity: "minor",
          element: selector,
          expected: baselineExists ? "present" : "absent",
          observed: targetExists ? "present" : "absent",
          recommendation: `CSS presence vs generated markup is advisory.`,
        });
        continue;
      }
      const baselineStyles = await baselinePage.locator(selector).first().evaluate((el, keys) => {
        const computed = getComputedStyle(el);
        return Object.fromEntries(keys.map((key) => [key, computed.getPropertyValue(key)]));
      }, props);
      const targetStyles = await targetPage.locator(selector).first().evaluate((el, keys) => {
        const computed = getComputedStyle(el);
        return Object.fromEntries(keys.map((key) => [key, computed.getPropertyValue(key)]));
      }, props);

      for (const prop of props) {
        if (baselineStyles[prop] !== targetStyles[prop]) {
          styleFindings.push({
            id: `css-${selector}-${prop}`,
            severity: "minor",
            element: `${selector} (${prop})`,
            expected: baselineStyles[prop],
            observed: targetStyles[prop],
            recommendation: `CSS vs generated markup is advisory. Align ${prop} on ${selector} with Penpot tokens if the PNG disagrees.`,
          });
        }
      }
    }
  }

  const screenshotPaths = [];
  const pixelFindings = [];
  let comparisonMethod = "dom-css";

  if (options.screenshotDir) {
    fs.mkdirSync(options.screenshotDir, { recursive: true });
    const safeViewport = viewport.replace(/[^\d.x]/g, "");
    const baselineShot = path.join(options.screenshotDir, `baseline-${safeViewport}.png`);
    const targetShot = path.join(options.screenshotDir, `target-${safeViewport}.png`);
    const diffShot = path.join(options.screenshotDir, `diff-${safeViewport}.png`);
    await targetPage.screenshot({ path: targetShot, fullPage: true });
    screenshotPaths.push(targetShot);

    let pixelBaseline = options.baselinePng || null;
    let visualSeverity = "major";
    if (pixelBaseline && fs.existsSync(pixelBaseline)) {
      comparisonMethod = "png-live";
    } else if (baselinePage) {
      await baselinePage.screenshot({ path: baselineShot, fullPage: true });
      screenshotPaths.push(baselineShot);
      pixelBaseline = baselineShot;
      visualSeverity = "minor";
      comparisonMethod = "dom-css-screenshots";
    }

    if (pixelBaseline && fs.existsSync(pixelBaseline)) {
      const pixelResult = compareScreenshotPair(pixelBaseline, targetShot, diffShot, {
        ...(options.pixel || {}),
        visualSeverity,
      });
      if (pixelResult.diffPath) screenshotPaths.push(pixelResult.diffPath);
      pixelFindings.push(...(pixelResult.findings || []));
    }
  }

  await browser.close();

  return {
    domFindings,
    styleFindings,
    pixelFindings,
    screenshotPaths,
    comparisonMethod,
    domSource: "rendered-structural",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baselinePng = args["baseline-png"] ? path.resolve(args["baseline-png"]) : null;
  if (!args["target-url"] || (!args["baseline-url"] && !baselinePng)) {
    console.error(
      "Usage: node compare-parity.js --target-url <url> [--baseline-url <url>] [--baseline-png <png>] [--viewport 1440x900] [--out <path>] [--screenshot-dir <dir>] [--wait-selector <sel>] [--settle-ms <ms>]",
    );
    process.exit(1);
  }

  const viewport = args.viewport || "1440x900";
  const screenshotDir = args["screenshot-dir"] ? path.resolve(args["screenshot-dir"]) : null;

  let domFindings = [];
  let styleFindings = [];
  let pixelFindings = [];
  let comparisonMethod = baselinePng ? "png-live" : "dom-css";
  const notes = [];

  const playwrightResult = await runPlaywrightComparison(args["baseline-url"] || null, args["target-url"], viewport, {
    screenshotDir,
    waitSelector: args["wait-selector"] || null,
    settleMs: args["settle-ms"] ? Number(args["settle-ms"]) : 500,
    waitUntil: args["wait-until"] || "domcontentloaded",
    baselinePng,
  });

  if (playwrightResult) {
    domFindings = playwrightResult.domFindings;
    styleFindings = playwrightResult.styleFindings;
    pixelFindings = playwrightResult.pixelFindings;
    comparisonMethod = playwrightResult.comparisonMethod;
    if (playwrightResult.screenshotPaths.length > 0) {
      notes.push(`Screenshots: ${playwrightResult.screenshotPaths.join(", ")}`);
    }
    notes.push("Visual baseline is the Penpot PNG when --baseline-png is set. Markup DOM/CSS is advisory.");
  } else if (args["baseline-url"]) {
    notes.push("Playwright not installed; DOM compared from static HTML fetch (may miss SPA hydration).");
    const [baselineHtml, targetHtml] = await Promise.all([
      fetchUrl(args["baseline-url"]),
      fetchUrl(args["target-url"]),
    ]);
    domFindings = compareStructuralDom(flattenDom(parseHtml(baselineHtml)), flattenDom(parseHtml(targetHtml)));
    notes.push(
      `Install Playwright: npm install --prefix ${skillsPrefix()} && npx --prefix ${skillsPrefix()} playwright install chromium`,
    );
  } else {
    notes.push("Playwright not installed; skipped live PNG compare.");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    comparisonMethod,
    baselineUrl: args["baseline-url"] || "",
    baselinePng: baselinePng || "",
    targetUrl: args["target-url"],
    viewport,
    findings: [...domFindings, ...styleFindings, ...pixelFindings],
    notes,
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(path.resolve(args.out), json);
  }
  process.stdout.write(json);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
