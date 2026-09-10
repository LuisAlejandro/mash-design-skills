function serializeShape(shape, depth) {
  if (!shape || depth > 15) return null;
  var node = {
    id: shape.id,
    name: shape.name,
    type: shape.type,
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    rotation: shape.rotation,
    opacity: shape.opacity,
    hidden: shape.hidden,
    fills: shape.fills ? JSON.parse(JSON.stringify(shape.fills)) : [],
    strokes: shape.strokes ? JSON.parse(JSON.stringify(shape.strokes)) : [],
    shadows: shape.shadows ? JSON.parse(JSON.stringify(shape.shadows)) : [],
    blur: shape.blur ? JSON.parse(JSON.stringify(shape.blur)) : null,
  };
  if (shape.tokens) node.tokens = JSON.parse(JSON.stringify(shape.tokens));
  if (shape.interactions && shape.interactions.length) {
    node.interactions = shape.interactions.map(function (i) {
      return {
        trigger:
          i.trigger != null ? JSON.parse(JSON.stringify(i.trigger)) : null,
        action: i.action != null ? JSON.parse(JSON.stringify(i.action)) : null,
      };
    });
  }
  if (shape.r1 != null)
    node.borderRadius = {
      r1: shape.r1,
      r2: shape.r2,
      r3: shape.r3,
      r4: shape.r4,
    };
  if (shape.type === "text") {
    node.characters = shape.characters;
    node.growType = shape.growType;
    node.fontFamily = shape.fontFamily;
    node.fontSize = shape.fontSize;
    node.fontWeight = shape.fontWeight;
    node.lineHeight = shape.lineHeight;
    node.letterSpacing = shape.letterSpacing;
    node.textAlign = shape.align;
    node.verticalAlign = shape.verticalAlign;
    node.textRanges = [];
    var ranges =
      (shape.content && shape.content.ranges) ||
      shape.ranges ||
      shape.textRanges;
    if (ranges && ranges.length) {
      for (var ri = 0; ri < ranges.length; ri++) {
        var r = ranges[ri];
        var rangeObj = {
          start: r.start != null ? r.start : r.startIndex,
          end: r.end != null ? r.end : r.endIndex,
        };
        if (r.fontSize != null) rangeObj.fontSize = r.fontSize;
        if (r.fontFamily != null) rangeObj.fontFamily = r.fontFamily;
        if (r.fontWeight != null) rangeObj.fontWeight = r.fontWeight;
        if (r.fill) rangeObj.fill = JSON.parse(JSON.stringify(r.fill));
        if (r.style && typeof r.style === "object")
          rangeObj.style = JSON.parse(JSON.stringify(r.style));
        node.textRanges.push(rangeObj);
      }
    }
  }
  if (shape.flex) {
    node.layout = {
      type: "flex",
      dir: shape.flex.dir,
      rowGap: shape.flex.rowGap,
      columnGap: shape.flex.columnGap,
      alignItems: shape.flex.alignItems,
      justifyContent: shape.flex.justifyContent,
      padding: {
        top: shape.flex.topPadding,
        right: shape.flex.rightPadding,
        bottom: shape.flex.bottomPadding,
        left: shape.flex.leftPadding,
      },
      childrenReversed: shape.flex.dir === "column" || shape.flex.dir === "row",
    };
  }
  if (shape.grid) {
    node.layout = {
      type: "grid",
      rows: shape.grid.rows,
      columns: shape.grid.columns,
      rowGap: shape.grid.rowGap,
      columnGap: shape.grid.columnGap,
    };
  }
  if (shape.layoutChild) {
    node.layoutChild = {
      absolute: shape.layoutChild.absolute,
      horizontalSizing: shape.layoutChild.horizontalSizing,
      verticalSizing: shape.layoutChild.verticalSizing,
      topMargin: shape.layoutChild.topMargin,
      rightMargin: shape.layoutChild.rightMargin,
      bottomMargin: shape.layoutChild.bottomMargin,
      leftMargin: shape.layoutChild.leftMargin,
      minWidth: shape.layoutChild.minWidth,
      maxWidth: shape.layoutChild.maxWidth,
      minHeight: shape.layoutChild.minHeight,
      maxHeight: shape.layoutChild.maxHeight,
      zIndex: shape.layoutChild.zIndex,
    };
  }
  if (shape.layoutCell) {
    node.layoutCell = {
      row: shape.layoutCell.row,
      column: shape.layoutCell.column,
      rowSpan: shape.layoutCell.rowSpan,
      columnSpan: shape.layoutCell.columnSpan,
    };
  }

  if (shape.type === "path" && shape.content) {
    try { node.pathContent = JSON.parse(JSON.stringify(shape.content)); } catch (e) {}
  }
  if (shape.type === "svg-raw" || shape.type === "svg") {
    node.svgContent = shape.content || shape.svg || null;
  }
  if (shape.type === "bool" || shape.type === "boolean") {
    node.booleanType = shape.booleanType || shape.boolType || null;
  }
  if (shape.exports) {
    try { node.exportSettings = JSON.parse(JSON.stringify(shape.exports)); } catch (e) {}
  }
  if (shape.children && shape.children.length) {
    node.children = shape.children
      .map(function (c) {
        return serializeShape(c, depth + 1);
      })
      .filter(Boolean);
  }
  return node;
}
function collectTokenNames(node, out) {
  if (!node) return;
  if (node.tokens && typeof node.tokens === "object") {
    for (var k in node.tokens) {
      var n = node.tokens[k];
      if (n) out[n] = true;
    }
  }
  if (node.children && node.children.length)
    for (var i = 0; i < node.children.length; i++)
      collectTokenNames(node.children[i], out);
}
// Prefer storage.targetShapeId (ROOT_BOARD_ID / import handoff.json) over live selection.
var sel =
  (storage.targetShapeId && penpotUtils.findShapeById(storage.targetShapeId)) ||
  (penpot.selection && penpot.selection[0]);
if (!sel)
  return {
    error:
      "No target shape. Set storage.targetShapeId from ROOT_BOARD_ID / handoff.json, or select the frame in Penpot.",
  };
storage.targetShapeId = sel.id;
var designContext = serializeShape(sel, 0);
var generatedCss = null;
var generatedMarkup = null;
var styleTarget = [sel];
try {
  generatedCss = penpot.generateStyle(styleTarget, {
    type: "css",
    withChildren: true,
  });
} catch (e) {
  generatedCss = e && e.message ? e.message : String(e);
}
try {
  generatedMarkup = penpot.generateMarkup(styleTarget, { type: "html" });
} catch (e) {
  generatedMarkup = e && e.message ? e.message : String(e);
}
var tokenNames = {};
collectTokenNames(designContext, tokenNames);
storage.tokenNamesToResolve = Object.keys(tokenNames);
var resolvedTokens = {};
function resolveToken(name, depth) {
  if (!name || (depth || 0) > 10 || resolvedTokens[name] !== undefined) return;
  try {
    var t = penpotUtils.findTokenByName(name);
    if (t && t.value != null) {
      var val = String(t.value);
      if (val.charAt(0) === "{" && val.charAt(val.length - 1) === "}") {
        var ref = val.substring(1, val.length - 1);
        resolveToken(ref, (depth || 0) + 1);
        resolvedTokens[name] =
          resolvedTokens[ref] !== undefined ? resolvedTokens[ref] : val;
      } else {
        resolvedTokens[name] = val;
      }
    }
  } catch (err) {}
}
for (var name in tokenNames) {
  resolveToken(name, 0);
}
return {
  designContext: designContext,
  generatedCss: generatedCss,
  generatedMarkup: generatedMarkup,
  resolvedTokens: resolvedTokens,
};
