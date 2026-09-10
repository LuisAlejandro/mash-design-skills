// Substitute: delta = { shapeId: { text?, fills?, layout?, typography? } }
var results = [];
var delta = storage.pendingDelta || {};
Object.keys(delta).forEach(function (id) {
  var shape = penpotUtils.findShapeById(id);
  var patch = delta[id];
  if (!shape) {
    results.push({ shapeId: id, ok: false, error: "not found" });
    return;
  }
  try {
    if (patch.text != null && shape.type === "text") shape.characters = patch.text;
    if (patch.fills) shape.fills = patch.fills;
    if (patch.typography && shape.type === "text") {
      if (patch.typography.fontSize != null) shape.fontSize = String(patch.typography.fontSize);
      if (patch.typography.fontWeight != null) shape.fontWeight = String(patch.typography.fontWeight);
    }
    if (patch.layout && shape.flex) {
      if (patch.layout.dir) shape.flex.dir = patch.layout.dir;
      if (patch.layout.rowGap != null) shape.flex.rowGap = patch.layout.rowGap;
      if (patch.layout.columnGap != null) shape.flex.columnGap = patch.layout.columnGap;
      if (patch.layout.padding) {
        var p = patch.layout.padding;
        if (p.top != null) shape.flex.topPadding = p.top;
        if (p.right != null) shape.flex.rightPadding = p.right;
        if (p.bottom != null) shape.flex.bottomPadding = p.bottom;
        if (p.left != null) shape.flex.leftPadding = p.left;
      }
    }
    results.push({ shapeId: id, ok: true });
  } catch (e) {
    results.push({ shapeId: id, ok: false, error: e.message });
  }
});
return { results: results };
