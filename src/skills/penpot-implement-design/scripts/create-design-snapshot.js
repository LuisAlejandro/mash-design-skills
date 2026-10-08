var sel = penpotUtils.findShapeById(storage.targetShapeId) || (penpot.selection && penpot.selection[0]);
if (!sel) return { error: "Target shape not found." };
var shapes = {};
function snap(shape) {
  if (!shape) return;
  var entry = {
    name: shape.name,
    type: shape.type,
    width: shape.width,
    height: shape.height,
    hidden: !!shape.hidden,
    fills: shape.fills ? JSON.parse(JSON.stringify(shape.fills)) : [],
    strokes: shape.strokes ? JSON.parse(JSON.stringify(shape.strokes)) : [],
    shadows: shape.shadows ? JSON.parse(JSON.stringify(shape.shadows)) : [],
    characters: shape.type === "text" ? shape.characters : undefined,
    fontSize: shape.fontSize,
    fontWeight: shape.fontWeight,
    tokens: shape.tokens ? JSON.parse(JSON.stringify(shape.tokens)) : undefined,
    childIds: (shape.children || []).map(function (c) { return c.id; }),
  };
  if (shape.flex) {
    entry.layout = { type: "flex", dir: shape.flex.dir, rowGap: shape.flex.rowGap, columnGap: shape.flex.columnGap };
  }
  if (shape.grid) {
    entry.layout = { type: "grid", rows: shape.grid.rows, columns: shape.grid.columns };
  }
  shapes[shape.id] = entry;
  (shape.children || []).forEach(snap);
}
snap(sel);
return { shapes: shapes, rootShapeId: sel.id, shapeCount: Object.keys(shapes).length };
