var pages = penpotUtils.getPages();
var pageStructure = pages.map(function (p) {
  var page = penpotUtils.getPageById(p.id);
  if (!page || !page.root) return { id: p.id, name: p.name, boards: [] };
  var boards = [];
  if (page.root.children) {
    page.root.children.forEach(function (child) {
      if (child.type === "board") {
        boards.push({
          id: child.id,
          name: child.name,
          width: child.width,
          height: child.height,
        });
      }
    });
  }
  return { id: p.id, name: p.name, boardCount: boards.length, boards: boards };
});
return { pages: pageStructure };
