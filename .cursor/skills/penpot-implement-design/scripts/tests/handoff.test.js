const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadImportHandoff, importHandoffPath } = require("../parity/lib/od-paths");

test("loadImportHandoff reads pageSlug and rootBoardId from import handoff.json", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-"));
  const dest = importHandoffPath(root, "checkout-flow");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(
    dest,
    JSON.stringify({
      pageSlug: "checkout-flow",
      pageId: "page-1",
      rootBoardId: "board-9",
    }),
  );
  const handoff = loadImportHandoff(root, "checkout-flow");
  assert.equal(handoff.pageSlug, "checkout-flow");
  assert.equal(handoff.rootBoardId, "board-9");
  assert.equal(handoff.pageId, "page-1");
});
