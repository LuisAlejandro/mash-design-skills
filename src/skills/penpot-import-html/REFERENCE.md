# Penpot Render — Property Reference and Errors

## Property patterns (execute_code)

```javascript
// Fill (replace the whole array — items are read-only)
shape.fills = [{ fillColor: "#1a1a2e", fillOpacity: 1 }];

// Linear gradient fill
shape.fills = [
  {
    fillColorGradient: {
      type: "linear",
      startX: 0,
      startY: 0,
      endX: 1,
      endY: 1,
      stops: [
        { color: "#1a1a2e", opacity: 1, offset: 0 },
        { color: "#e94560", opacity: 1, offset: 1 },
      ],
    },
  },
];

// Stroke
shape.strokes = [
  { strokeColor: "#ffffff", strokeOpacity: 1, strokeWidth: 1 },
];

// Shadow
shape.shadows = [
  {
    style: "drop-shadow",
    offsetX: 0,
    offsetY: 4,
    blur: 16,
    spread: 0,
    color: "#000000",
    opacity: 0.2,
  },
];

// Blur
shape.blur = { type: "layer-blur", value: 8 };

// Border radius
shape.r1 = 8;
shape.r2 = 8;
shape.r3 = 8;
shape.r4 = 8;

// Text
shape.characters = "Hello";
shape.fontSize = "16";
shape.fontWeight = "600";
shape.growType = "auto-width"; // reset after resize()

// Size / rotation
shape.resize(320, 48);
shape.rotation = 0;

// Ellipse
var ellipse = penpot.createEllipse();
ellipse.resize(24, 24);
```

Token apply (async — wait ~100ms):

```javascript
shape.applyToken(token, ["fill"]); // or "font-size", "p1", "row-gap", ...
```

Z-order: `insertChild(index, shape)`. Flex `dir` `row`/`column`: visual order is reversed vs `children`.

## Error handling

| Failure | What to do |
| ------- | ---------- |
| `execute_code` exception | Read the message; simplify the script; never log the same object you return |
| Payload too large | Split by top-level section; stash IDs in `storage` |
| `storage` lost (MCP reconnect) | Re-run page lookup by `meta.slug` / handoff `pageId`; do not assume selection |
| Shape name collisions | Suffix ` (2)`, `(3)` |
| Token apply no-op | Confirm set is `active`; wait 100ms; fall back to raw fill |
| Gradient API shape | Verify with `penpot_api_info` type `Gradient` |
| Interaction API | Verify `Interaction` / `Flow` with `penpot_api_info` before retrying |
| `appendChild` wrong z-order | Use `insertChild` (or Board `appendChild` only for flex visual-end) |
