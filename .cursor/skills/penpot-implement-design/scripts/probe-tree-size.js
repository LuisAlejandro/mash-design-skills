var sel = penpotUtils.findShapeById(storage.targetShapeId) || (penpot.selection && penpot.selection[0]);
if (!sel) return { error: "Target shape not found." };
var maxDepth = 4;
try {
  return penpotUtils.shapeStructure(sel, maxDepth);
} catch (e) {
  return { error: e.message };
}
