const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/** Project-relative root for OpenDesign pipeline artifacts (not rules or DESIGN.md). */
const DESIGNS_DIR = path.join(".mash", "designs");

/**
 * Rules live in `.cursor/rules/*.mdc`. These skills are Cursor-only.
 */
function treeKind() {
  return "cursor";
}

function rulesRoot(projectRoot) {
  return path.join(projectRoot, ".cursor", "rules");
}

function rulesFileExtension() {
  return ".mdc";
}

/** Absolute path to an OpenDesign rule file, target-aware. ruleName excludes extension. */
function rulesFilePath(projectRoot, ruleName) {
  return path.join(rulesRoot(projectRoot), `${ruleName}${rulesFileExtension()}`);
}

function designsRoot(projectRoot) {
  return path.join(projectRoot, DESIGNS_DIR);
}

function latestPath(projectRoot) {
  return path.join(designsRoot(projectRoot), "latest.json");
}

function componentCatalogPath(projectRoot) {
  return path.join(designsRoot(projectRoot), "component-catalog.json");
}

function designSystemManifestPath(projectRoot) {
  return path.join(designsRoot(projectRoot), "design-system.json");
}

function pageDir(projectRoot, pageSlug) {
  return path.join(designsRoot(projectRoot), pageSlug);
}

function pageReviewDir(projectRoot, pageSlug) {
  return path.join(pageDir(projectRoot, pageSlug), "review");
}

function sourceDir(projectRoot, pageSlug) {
  return path.join(pageDir(projectRoot, pageSlug), "source");
}

function importHandoffPath(projectRoot, pageSlug) {
  return path.join(pageDir(projectRoot, pageSlug), "penpot-import", "handoff.json");
}

function loadImportHandoff(projectRoot, pageSlug) {
  if (pageSlug) {
    return readJsonIfExists(importHandoffPath(projectRoot, pageSlug));
  }
  const root = designsRoot(projectRoot);
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const handoff = readJsonIfExists(importHandoffPath(projectRoot, entry.name));
    if (handoff && handoff.rootBoardId) return handoff;
  }
  return null;
}

function controlInventoryPath(projectRoot, pageSlug) {
  return path.join(pageReviewDir(projectRoot, pageSlug), "control-inventory.json");
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function fileChecksum(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function resolveProjectPath(projectRoot, relativeOrAbsolute) {
  if (!relativeOrAbsolute) return null;
  return path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.resolve(projectRoot, relativeOrAbsolute);
}

function normalizeLatestEntry(projectRoot, pageSlug, entry) {
  return {
    pageSlug,
    htmlPath: entry.htmlPath,
    htmlChecksum: entry.htmlChecksum,
    artifactPath: entry.artifactPath,
    catalogPath: entry.catalogPath,
    contextPath: entry.contextPath,
    baseRulePath: entry.baseRulePath,
    generatedAt: entry.generatedAt,
    contextPathAbs: resolveProjectPath(projectRoot, entry.contextPath),
    catalogPathAbs: resolveProjectPath(projectRoot, entry.catalogPath),
    artifactPathAbs: resolveProjectPath(projectRoot, entry.artifactPath),
    reviewDir: pageReviewDir(projectRoot, pageSlug),
  };
}

function migrateLegacyLatest(projectRoot, latest) {
  const pageSlug = latest.pageSlug || "opendesign-page";
  const entry = {
    pageSlug,
    htmlPath: latest.htmlPath || null,
    htmlChecksum: latest.htmlChecksum || null,
    artifactPath: latest.artifactPath,
    catalogPath: latest.catalogPath,
    contextPath: latest.contextPath,
    baseRulePath: latest.baseRulePath,
    generatedAt: latest.generatedAt,
  };
  return {
    generatedAt: latest.generatedAt,
    activePageSlug: pageSlug,
    pages: { [pageSlug]: entry },
  };
}

function loadLatestOd(projectRoot, pageSlug) {
  const latestFile = latestPath(projectRoot);
  let latest = readJsonIfExists(latestFile);
  if (!latest) return null;

  if (!latest.pages && latest.contextPath) {
    latest = migrateLegacyLatest(projectRoot, latest);
  }

  const slug = pageSlug || latest.activePageSlug;
  if (!slug) {
    throw new Error("No active page in .mash/designs/latest.json. Pass --page-slug.");
  }

  const entry = latest.pages?.[slug];
  if (!entry) {
    throw new Error(`Page slug not found in latest.json: ${slug}. Known: ${Object.keys(latest.pages || {}).join(", ") || "none"}`);
  }

  const normalized = normalizeLatestEntry(projectRoot, slug, entry);
  return { latestPath: latestFile, latest, ...normalized };
}

function loadDesignSystemManifest(projectRoot) {
  return readJsonIfExists(designSystemManifestPath(projectRoot));
}

function assertHtmlFresh(context, htmlPath) {
  if (!context?.htmlChecksum || !htmlPath) return;
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`HTML artifact missing: ${htmlPath}.`);
  }
  const current = fileChecksum(htmlPath);
  if (current !== context.htmlChecksum) {
    throw new Error(
      "HTML artifact changed since design-context was generated.",
    );
  }
}

module.exports = {
  DESIGNS_DIR,
  designsRoot,
  latestPath,
  componentCatalogPath,
  designSystemManifestPath,
  pageDir,
  pageReviewDir,
  sourceDir,
  importHandoffPath,
  loadImportHandoff,
  controlInventoryPath,
  readJsonIfExists,
  fileChecksum,
  loadLatestOd,
  loadDesignSystemManifest,
  assertHtmlFresh,
  resolveProjectPath,
  treeKind,
  rulesRoot,
  rulesFileExtension,
  rulesFilePath,
};
