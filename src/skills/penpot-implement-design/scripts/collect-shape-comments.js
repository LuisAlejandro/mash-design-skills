var sel = penpotUtils.findShapeById(storage.targetShapeId) || (penpot.selection && penpot.selection[0]);
if (!sel) return { error: "Target shape not found." };
var comments = [];
try {
  var threads = penpot.commentThreads || [];
  if (typeof penpot.getCommentThreads === "function") threads = penpot.getCommentThreads();
  var bx = sel.x, by = sel.y, bw = sel.width, bh = sel.height;
  (threads || []).forEach(function (t) {
    var x = t.x, y = t.y;
    var inside = x >= bx && x <= bx + bw && y >= by && y <= by + bh;
    if (!inside) return;
    var threadData = { id: t.id, resolved: t.resolved, position: { x: x, y: y } };
    try {
      var msgs = typeof t.getComments === "function" ? t.getComments() : t.comments || [];
      threadData.messages = msgs.map(function (m) {
        return { author: m.author, content: m.content, date: m.date };
      });
    } catch (e) {
      threadData.messages = [];
    }
    comments.push(threadData);
  });
} catch (e) {
  comments = [{ note: "Comment API unavailable: " + e.message }];
}
return { commentThreads: comments };
