var solidColors = {};
var gradients = [];
var imageFills = [];
var shadows = [];
var seenGradients = {};
var seenImages = {};
var seenShadows = {};
penpotUtils.findShapes(function (s) {
  if (s.fills && s.fills.length) {
    s.fills.forEach(function (f) {
      if (f.fillColor) {
        solidColors[f.fillColor] = (solidColors[f.fillColor] || 0) + 1;
      }
      if (f.fillColorGradient) {
        var gKey = JSON.stringify(f.fillColorGradient);
        if (!seenGradients[gKey]) {
          seenGradients[gKey] = true;
          gradients.push({
            type: f.fillColorGradient.type,
            stops: (f.fillColorGradient.stops || []).map(function (st) {
              return {
                color: st.color,
                opacity: st.opacity,
                offset: st.offset,
              };
            }),
            shapeName: s.name,
          });
        }
      }
      if (f.fillImage) {
        var iKey = f.fillImage.id || f.fillImage.name + "-" + s.id;
        if (!seenImages[iKey]) {
          seenImages[iKey] = true;
          imageFills.push({
            imageId: f.fillImage.id,
            name: f.fillImage.name || s.name,
            width: f.fillImage.width,
            height: f.fillImage.height,
            shapeName: s.name,
            shapeId: s.id,
          });
        }
      }
    });
  }
  if (s.strokes && s.strokes.length) {
    s.strokes.forEach(function (st) {
      if (st.strokeColor)
        solidColors[st.strokeColor] = (solidColors[st.strokeColor] || 0) + 1;
    });
  }
  if (s.shadows && s.shadows.length) {
    s.shadows.forEach(function (sh) {
      var sKey = JSON.stringify({
        color: sh.color,
        offsetX: sh.offsetX,
        offsetY: sh.offsetY,
        blur: sh.blur,
        spread: sh.spread,
      });
      if (!seenShadows[sKey]) {
        seenShadows[sKey] = true;
        shadows.push({
          color: sh.color,
          opacity: sh.opacity,
          offsetX: sh.offsetX,
          offsetY: sh.offsetY,
          blur: sh.blur,
          spread: sh.spread,
          style: sh.style,
          shapeName: s.name,
        });
      }
    });
  }
  return false;
}, penpot.root);
var sorted = Object.keys(solidColors).sort(function (a, b) {
  return solidColors[b] - solidColors[a];
});
return {
  solidColors: sorted.map(function (c) {
    return { color: c, count: solidColors[c] };
  }),
  gradients: gradients,
  imageFills: imageFills,
  shadows: shadows,
};
