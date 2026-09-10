var names = storage.tokenNamesToResolve || [];
if (!names.length) {
  return { resolvedTokens: {}, failedTokens: [], note: "storage.tokenNamesToResolve empty" };
}
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
names.forEach(function (n) {
  resolveOne(n, 0);
});
return { resolvedTokens: resolvedTokens, failedTokens: failedTokens };
