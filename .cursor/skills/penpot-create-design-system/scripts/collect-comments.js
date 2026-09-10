var comments = [];
try {
  var threads = penpot.commentThreads || [];
  if (typeof penpot.getCommentThreads === "function")
    threads = penpot.getCommentThreads();
  if (threads && threads.length) {
    for (var i = 0; i < Math.min(threads.length, 50); i++) {
      var t = threads[i];
      var threadData = {
        id: t.id,
        resolved: t.resolved,
        position: { x: t.x, y: t.y },
      };
      try {
        var msgs =
          typeof t.getComments === "function"
            ? t.getComments()
            : t.comments || [];
        threadData.messages = msgs.map(function (m) {
          return { author: m.author, content: m.content, date: m.date };
        });
      } catch (e) {
        threadData.messages = [];
      }
      comments.push(threadData);
    }
  }
} catch (e) {
  comments = [{ note: "Comment API unavailable: " + e.message }];
}
return { commentThreads: comments };
