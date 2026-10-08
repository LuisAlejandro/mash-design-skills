function fromLib(lib, source) {
  if (!lib) return { components: [], colors: [], typographies: [] };
  return {
    components: (lib.components || []).map(function (c) {
      var compData = { name: c.name, id: c.id, source: source };
      try {
        if (typeof c.isVariant === "function" && c.isVariant() && c.variants) {
          compData.variantProperties = c.variants.properties || [];
          var varComps =
            typeof c.variants.variantComponents === "function"
              ? c.variants.variantComponents()
              : [];
          compData.variants = varComps.map(function (vc) {
            return { name: vc.name, props: vc.variantProps || {} };
          });
        }
      } catch (e) {}
      return compData;
    }),
    colors: (lib.colors || []).map(function (c) {
      return { name: c.name, color: c.color, source: source };
    }),
    typographies: (lib.typographies || []).map(function (t) {
      return {
        name: t.name,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        source: source,
      };
    }),
  };
}
var local = fromLib(penpot.library.local, "local");
var connected = { components: [], colors: [], typographies: [] };
if (penpot.library.connected && penpot.library.connected.length) {
  penpot.library.connected.forEach(function (lib, i) {
    var src = fromLib(lib, "connected-" + (lib.name || i));
    connected.components = connected.components.concat(src.components);
    connected.colors = connected.colors.concat(src.colors);
    connected.typographies = connected.typographies.concat(src.typographies);
  });
}
var available = [];
try {
  var avail = await penpot.library.availableLibraries();
  if (avail && avail.length) {
    var connectedIds = {};
    if (penpot.library.connected)
      penpot.library.connected.forEach(function (l) {
        connectedIds[l.id] = true;
      });
    if (penpot.library.local) connectedIds[penpot.library.local.id] = true;
    available = avail
      .filter(function (l) {
        return !connectedIds[l.id];
      })
      .map(function (l) {
        return { id: l.id, name: l.name };
      });
  }
} catch (e) {}
return {
  components: local.components.concat(connected.components),
  colors: local.colors.concat(connected.colors),
  typographies: local.typographies.concat(connected.typographies),
  availableLibraries: available,
};
