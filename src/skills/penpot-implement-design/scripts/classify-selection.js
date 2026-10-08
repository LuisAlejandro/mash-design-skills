var sel =
  (storage.targetShapeId && penpotUtils.findShapeById(storage.targetShapeId)) ||
  (penpot.selection && penpot.selection[0]);
if (!sel) return { error: "No target shape. Set storage.targetShapeId from ROOT_BOARD_ID / handoff.json, or select the frame in Penpot." };
var root = penpot.root;
var isPageRootChild = !!(root && sel.parent && sel.parent.id === root.id);
var isMainBoard = isPageRootChild && sel.type === "board";
var depth = 0;
var p = sel.parent;
while (p && root && p.id !== root.id) {
  depth += 1;
  p = p.parent;
  if (depth > 50) break;
}
return {
  shapeId: sel.id,
  shapeName: sel.name,
  type: sel.type,
  isMainBoard: isMainBoard,
  isPageRootChild: isPageRootChild,
  depthFromRoot: depth,
  childCount: (sel.children && sel.children.length) || 0,
  width: sel.width,
  height: sel.height,
};
