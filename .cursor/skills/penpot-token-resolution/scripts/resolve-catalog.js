var overview = {};
try {
  overview = penpotUtils.tokenOverview() || {};
} catch (e) {
  return { error: "tokenOverview unavailable: " + e.message };
}
var names = [];
Object.keys(overview).forEach(function (setName) {
  var byType = overview[setName] || {};
  Object.keys(byType).forEach(function (typ) {
    (byType[typ] || []).forEach(function (n) {
      names.push(n);
    });
  });
});
var resolvedTokens = {};
var failedTokens = [];
function resolveOne(name, depth) {
  if (!name || (depth || 0) > 10) return;
  if (resolvedTokens[name] !== undefined) return;
  try {
    var t = penpotUtils.findTokenByName(name);
    if (!t || t.value == null) {
      failedTokens.push(name);
      return;
    }
    var val = String(t.value);
    if (val.charAt(0) === "{" && val.charAt(val.length - 1) === "}") {
      var ref = val.substring(1, val.length - 1);
      resolveOne(ref, (depth || 0) + 1);
      resolvedTokens[name] =
        resolvedTokens[ref] !== undefined ? resolvedTokens[ref] : val;
    } else {
      resolvedTokens[name] = val;
    }
  } catch (err) {
    failedTokens.push(name);
  }
}
var BATCH = 100;
for (var i = 0; i < names.length; i += BATCH) {
  names.slice(i, i + BATCH).forEach(function (n) {
    resolveOne(n, 0);
  });
}
var themes = [];
try {
  var catalog = penpot.library.local && penpot.library.local.tokens;
  themes = (catalog && catalog.themes) || [];
} catch (e) {}
return {
  overview: overview,
  setCount: Object.keys(overview).length,
  themeCount: themes.length,
  resolvedTokens: resolvedTokens,
  failedTokens: failedTokens,
};
