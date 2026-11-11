# Theme palette

`src/theme.py` defines the shared accent colors and tonal variants used by the
interface, syntax highlighting, semantic map and social controls.

| Theme | Accent |
|---|---|
| `green` | `#71C7A6` |
| `blue` | `#5AA9FF` |
| `rose` | `#F06A93` |
| `violet` | `#9B7BFF` |

Each entry in `THEMES` contains an `accent` color and a `portrait_filter`.
The `theme` query parameter selects the palette and persists during navigation.

The portrait uses `assets/me.jpg`; its colored strokes are adjusted with the
selected `portrait_filter`. Semantic-map activity pulses, nodes and connection
gradients use the corresponding palette variants.
