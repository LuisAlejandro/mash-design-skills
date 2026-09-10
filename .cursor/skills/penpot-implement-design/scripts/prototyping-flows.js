var sel = penpotUtils.findShapeById(storage.targetShapeId) || (penpot.selection && penpot.selection[0]);
if (!sel) return { error: "Target shape not found." };
var flows = [];
try {
  var page = penpot.currentPage;
  var rawFlows = (page && page.flows) || penpot.currentPage && penpot.currentPage.flows || [];
  if (typeof page.getFlows === "function") rawFlows = page.getFlows();
  (rawFlows || []).forEach(function (f) {
    flows.push({
      name: f.name,
      startShapeId: f.startingShape || (f.start && f.start.id) || f.origin,
    });
  });
} catch (e) {
  flows = [{ note: "Flow API unavailable: " + e.message }];
}
var interactions = [];
function walk(shape) {
  if (!shape) return;
  if (shape.interactions && shape.interactions.length) {
    shape.interactions.forEach(function (i) {
      interactions.push({
        shapeId: shape.id,
        shapeName: shape.name,
        trigger: i.trigger != null ? JSON.parse(JSON.stringify(i.trigger)) : null,
        action: i.action != null ? JSON.parse(JSON.stringify(i.action)) : null,
      });
    });
  }
  (shape.children || []).forEach(walk);
}
walk(sel);
return { flows: flows, interactions: interactions };
