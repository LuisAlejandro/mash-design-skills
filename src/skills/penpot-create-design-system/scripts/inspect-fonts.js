var usedFonts = {};
penpotUtils.findShapes(function (s) {
  if (s.type === "text") {
    if (s.fontFamily) usedFonts[s.fontFamily] = true;
    var ranges = (s.content && s.content.ranges) || s.ranges || s.textRanges;
    if (ranges)
      ranges.forEach(function (r) {
        if (r.fontFamily) usedFonts[r.fontFamily] = true;
      });
  }
  return false;
}, penpot.root);
var fontList = Object.keys(usedFonts);
var availableFonts = [];
try {
  if (penpot.fonts && typeof penpot.fonts.getAll === "function") {
    availableFonts = penpot.fonts.getAll().map(function (f) {
      return {
        name: f.name,
        family: f.fontFamily,
        variants: (f.variants || []).length,
      };
    });
  }
} catch (e) {}
return {
  usedFonts: fontList,
  availableFonts: availableFonts.length ? availableFonts : "API unavailable",
};
