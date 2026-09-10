#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

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

function writeBaseline(outDir, markup, css) {
  fs.mkdirSync(outDir, { recursive: true });
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Penpot generated markup</title>
  <style>
html, body { margin: 0; padding: 0; }
${css || ""}
  </style>
</head>
<body>
${markup || ""}
</body>
</html>
`;
  const htmlPath = path.join(outDir, "index.html");
  fs.writeFileSync(htmlPath, html);
  return htmlPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args["out-dir"] || path.join(process.cwd(), "rosey", "designs", "review", "generated-baseline"));
  let markup = args.markup || "";
  let css = args.css || "";
  if (args.json) {
    const data = JSON.parse(fs.readFileSync(path.resolve(args.json), "utf8"));
    markup = data.generatedMarkup || data.markup || markup;
    css = data.generatedCss || data.css || css;
  }
  if (!markup) {
    console.error("Usage: node serve-generated-markup.js --markup <html> --css <css> --out-dir <dir> [--background]");
    console.error("   or: node serve-generated-markup.js --json <serialize-shape-output.json> --out-dir <dir> [--background]");
    process.exit(1);
  }

  const htmlPath = writeBaseline(outDir, markup, css);
  const serve = path.join(__dirname, "serve-artifact.js");
  const childArgs = [serve, "--html", htmlPath, "--port", String(args.port || 0)];
  if (args.background) {
    childArgs.push(
      "--background",
      "--state-file",
      args["state-file"] || path.join(outDir, "baseline-server.json"),
      "--pid-file",
      args["pid-file"] || path.join(outDir, "baseline-server.pid"),
    );
  }

  const child = spawn(process.execPath, childArgs, { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code || 0));
}

if (require.main === module) main();
