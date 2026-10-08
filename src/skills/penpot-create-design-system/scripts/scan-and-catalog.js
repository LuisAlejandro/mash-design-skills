#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { extractExports, extractProps } = require("./lib/ast-exports");
const { loadPathAliases, computeImportPath, resolveAliasImport } = require("./lib/project-paths");
const { SCAN_IGNORE_DIRS: IGNORE_DIRS } = require("./lib/scan-constants");

const COMPONENT_HINTS = {
  button: ["button"],
  link: ["link", "anchor", "nav"],
  input: ["input", "field", "text-field", "search"],
  select: ["select", "dropdown", "combobox"],
  textarea: ["textarea"],
  checkbox: ["checkbox"],
  radio: ["radio"],
  card: ["card", "panel", "tile"],
  dialog: ["dialog", "modal", "drawer"],
  heading: ["heading", "title", "typography", "text"],
  image: ["image", "avatar", "icon"],
  navbar: ["navbar", "nav", "header", "appbar", "topbar"],
  tabs: ["tabs", "tablist", "tab-panel"],
  accordion: ["accordion", "collapse", "disclosure"],
  carousel: ["carousel", "slider", "swiper"],
  grid: ["grid", "row", "col", "layout"],
  form: ["form"],
  list: ["list", "menu"],
  section: ["section", "hero", "banner", "footer"],
};

const DEFAULT_COMPONENT_DIRS = [
  "src/components",
  "app/components",
  "components",
  "src/ui",
  "lib/components",
  "packages/ui",
  "packages/design-system",
];

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

function walkFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, files);
    else if (
      /\.(tsx|jsx|ts|js|vue|svelte)$/.test(entry.name) &&
      !/\.(test|spec|stories|story)\.(tsx|jsx|ts|js|vue|svelte)$/.test(entry.name)
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function inferKinds(name, filePath, content) {
  const haystack = `${name} ${filePath} ${content.slice(0, 2000)}`.toLowerCase();
  const kinds = [];
  for (const [kind, hints] of Object.entries(COMPONENT_HINTS)) {
    if (hints.some((hint) => haystack.includes(hint))) kinds.push(kind);
  }
  return kinds;
}

function ruleGlobs(architecture, projectRoot) {
  const dirs = [...(architecture.componentDirs || []), ...(architecture.routeDirs || [])];
  const existing = dirs.filter((dir) => fs.existsSync(path.resolve(projectRoot, dir)));
  const globs = existing.map((dir) => `${dir}/**`);
  if (globs.length > 0) return globs;
  if (projectRoot && fs.existsSync(path.join(projectRoot, "src"))) return ["src/**"];
  return [];
}

function buildCatalog(projectRoot, architecture) {
  const aliases = loadPathAliases(projectRoot);
  const dirs = (architecture.componentDirs || DEFAULT_COMPONENT_DIRS)
    .map((dir) => path.resolve(projectRoot, dir))
    .filter((dir) => fs.existsSync(dir));
  const files = dirs.flatMap((dir) => walkFiles(dir));
  const components = {};
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const relPath = path.relative(projectRoot, file);
    for (const name of extractExports(content, file)) {
      const props = extractProps(content, file, name);
      const aliasImport = resolveAliasImport(relPath, projectRoot, aliases);
      const relativeImport = computeImportPath("src/App.tsx", relPath, projectRoot, aliases);
      components[name] = {
        path: relPath,
        matches: inferKinds(name, file, content),
        props,
        suggestedImport: aliasImport || relativeImport,
      };
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    projectRoot,
    pathAliases: Object.keys(aliases),
    componentDirs: dirs.map((dir) => path.relative(projectRoot, dir) || "."),
    components,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(args["project-root"] || process.cwd());
  const { execFileSync } = require("child_process");
  const architecture = JSON.parse(
    execFileSync(process.execPath, [path.join(__dirname, "scan-project-architecture.js"), "--root", projectRoot], {
      encoding: "utf8",
    }),
  );
  const catalog = buildCatalog(projectRoot, architecture);
  const globs = ruleGlobs(architecture, projectRoot);

  const architecturePath = path.join(projectRoot, ".cursor", "penpot-architecture.json");
  const catalogPath = path.join(projectRoot, ".mash", "designs", "component-catalog.json");
  fs.mkdirSync(path.dirname(architecturePath), { recursive: true });
  fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
  fs.writeFileSync(architecturePath, `${JSON.stringify(architecture, null, 2)}\n`);
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

  process.stdout.write(
    `${JSON.stringify(
      {
        architecturePath: path.relative(projectRoot, architecturePath),
        catalogPath: path.relative(projectRoot, catalogPath),
        globs,
        framework: architecture.framework,
        styling: architecture.styling,
        componentDirs: architecture.componentDirs,
        routeDirs: architecture.routeDirs,
        assetDirs: architecture.assetDirs,
        componentCount: Object.keys(catalog.components).length,
      },
      null,
      2,
    )}\n`,
  );
}

if (require.main === module) main();

module.exports = { buildCatalog, ruleGlobs };
