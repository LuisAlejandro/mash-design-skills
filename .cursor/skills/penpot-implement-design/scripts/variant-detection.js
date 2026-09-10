var sel = penpotUtils.findShapeById(storage.targetShapeId);
if (!sel)
  return {
    error:
      "Target shape not found. storage.targetShapeId may have been lost — ask user for shape id.",
  };
var result = {
  isComponentInstance: false,
  variants: [],
  libraryMatch: null,
  variantProperties: [],
  apiMethodsAvailable: {},
};

// Probe variant API methods individually so one failure doesn't block the rest
try {
  result.isComponentInstance =
    typeof sel.isComponentInstance === "function" && sel.isComponentInstance();
  result.apiMethodsAvailable.isComponentInstance = true;
} catch (e) {
  result.apiMethodsAvailable.isComponentInstance = false;
}

var comp = null;
try {
  comp = typeof sel.component === "function" ? sel.component() : null;
  result.apiMethodsAvailable.component = !!comp;
} catch (e) {
  result.apiMethodsAvailable.component = false;
}

if (comp) {
  try {
    result.libraryMatch = { name: comp.name, id: comp.id };
    var isVar = typeof comp.isVariant === "function" && comp.isVariant();
    result.apiMethodsAvailable.isVariant = typeof comp.isVariant === "function";
    if (isVar && comp.variants) {
      result.variantProperties = comp.variants.properties || [];
      var varComps =
        typeof comp.variants.variantComponents === "function"
          ? comp.variants.variantComponents()
          : [];
      result.apiMethodsAvailable.variantComponents =
        typeof comp.variants.variantComponents === "function";
      for (var i = 0; i < varComps.length; i++) {
        var vc = varComps[i];
        if (vc.id !== comp.id) {
          var main =
            typeof vc.mainInstance === "function" ? vc.mainInstance() : null;
          result.variants.push({
            id: main ? main.id : vc.id,
            name: vc.name,
            props: vc.variantProps || {},
          });
        }
      }
    }
  } catch (e) {
    result.variantError = e.message;
  }
}

// Heuristic fallback: scan sibling shapes with matching base name
if (!result.variants.length && sel.parent && sel.parent.type === "board") {
  var baseName = sel.name.replace(/\s*[\/\(].*/, "");
  sel.parent.children.forEach(function (sibling) {
    if (sibling.id !== sel.id) {
      var sibBase = sibling.name.replace(/\s*[\/\(].*/, "");
      if (sibBase === baseName && sibling.name !== sel.name) {
        result.variants.push({ id: sibling.id, name: sibling.name, props: {} });
      }
    }
  });
  if (result.variants.length) result.variantDetection = "heuristic";
}
return result;
