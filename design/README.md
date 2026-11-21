# Aqua Launcher design kit

Editable, Figma-ready sources for the launcher UI. The frames in `screens/` are exported
from the **running app** (`getBoundingClientRect` + `getComputedStyle` for every element),
so spacing, typography, colors and component states match the shipping interface 1:1.
`build.mjs` remains as a hand-drawn fallback, but `export.mjs` is the source of truth.

## Files

| File | Purpose |
| --- | --- |
| `Aqua-Launcher.fig.svg` | **Single Figma file** — all eight screens on one canvas, labels included. Import this one file |
| `screens/*.svg` | The same eight exported screens as separate 1440 × 900 frames |
| `tokens.json` | Colors, type scale, spacing, radii, shadows, motion, breakpoints, component sizes |
| `DESIGN.md` | Direction, principles, layout, components, responsive and accessibility rules |
| `index.html` | Local gallery of all frames |
| `export.mjs` | Exports the live UI to SVG (primary generator) |
| `build.mjs` | Hand-drawn fallback generator |

## Open the gallery

```powershell
start design/index.html
```

Or run the demo server and open `http://127.0.0.1:8765/../design/index.html` — the gallery uses
relative paths, so opening the file directly is simpler.

## Import into Figma (desktop app)

1. Download and install **Manrope** from Google Fonts (weights 200–800). Optional: **JetBrains Mono**.
2. In Figma: **File → Import** (or drag the file onto the canvas) and choose
   **`design/Aqua-Launcher.fig.svg`**. All eight screens arrive together, laid out 2 × 4 with labels.
   Import a file from `design/screens/` instead if you want one screen per Figma file.
3. The file becomes an editable frame with one layer per element: every box is a `<g>`/rect,
   every label is live text, every icon is a vector, every image is embedded. Top-level groups are
   **`Main menu - titlebar`**, **`Main menu - sidebar`** and **`Scroll panel - below menu`**;
   inside the scroll panel each page keeps its own group (`page-home`, `page-library`, …).
   The scroll panel is clipped below the menu, exactly like the app.
4. To use the tokens as variables, install the **Tokens Studio** plugin and import
   `design/tokens.json`. Without a plugin, copy the values from the JSON into Figma variables.
5. To keep the design in sync with code, run `node design/export.mjs` and re-import the master SVG.
   Figma does not watch local files, so re-import replaces the old frame.

> Figma's native `.fig` is a proprietary binary that only Figma itself can write. This kit gives you
> the exact same result through SVG import: all 2,300+ elements arrive as separate, editable Figma
> layers. After import use **File → Save local copy…** if you specifically need a `.fig` file.

### Notes

- The SVG embeds a Manrope subset. Figma will map the `Manrope` family to the font you installed;
  if it reports a missing font, select the text and choose Manrope manually.
- Game covers, avatars and the hero image are embedded from the live app, so the frames show real art
  rather than placeholders.
- Frame size is 1440 × 900. The shipping window is 1280 × 820; the extra space keeps the page
  margins honest and gives room for annotations.
- The backdrop is one embedded JPEG behind the vector UI; everything above it is editable.

## Regenerate

Export the current interface (start the demo server first):

```powershell
python -m http.server 8765 --bind 127.0.0.1   # workdir: ui
node design/export.mjs
```

This rewrites `screens/*.svg` and `Aqua-Launcher.fig.svg` from the real DOM and CSS.
Text stays live (no rasterised UI), boxes keep their computed radius/border/shadow,
images are embedded, and icons are real vectors.

The older hand-drawn generator still works (`node design/build.mjs`) and has no server
dependency, but its frames are approximations and will not match the app pixel-for-pixel.
