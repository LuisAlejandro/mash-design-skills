var page = penpot.currentPage;
if (!page) return { error: "No page active in Penpot." };
return { pageId: page.id, pageName: page.name };
