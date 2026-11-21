# Aqua Launcher — design system

Direction: **deep-water instrument panel**. A dark, quiet surface with one luminous accent,
crisp Manrope type and glass panels that sit on top of an animated ocean backdrop. The goal is
to make a game launcher feel like a precise desktop tool, not a marketing page.

## Principles

1. **One accent at a time.** Aqua `#5ce8dc` carries selection, primary action and progress.
   Everything else is a neutral surface or a status colour. Never introduce a second brand hue.
2. **Hierarchy before decoration.** Size, weight and space separate levels. Borders stay under
   10% white; shadows are wide and soft, never glowy except on the primary button.
3. **Calm density.** 13 px body, 20 px card padding, an 18 px grid gutter. Dense data is allowed
   inside cards (specs, file rows) but the page frame keeps generous 48 px margins.
4. **State is visible.** Hover lifts a surface by one step, focus draws a 2 px accent ring,
   selection gets an accent-soft fill plus a 3 px bar. No state is communicated by colour alone.
5. **Motion explains.** 150–220 ms, `cubic-bezier(.22,.68,0,1)`. Surfaces fade and shift a few
   pixels; nothing bounces. Reduced motion keeps opacity changes only.

## Layout

| Token | Value |
| --- | --- |
| Window | 1280 × 820 default, 960 × 640 minimum |
| Design frame | 1440 × 900, export at 1× |
| Title bar | 52 px, draggable, window controls right |
| Rail | 248 px expanded, 76 px collapsed, 100% bottom bar under 680 px |
| Page padding | 48 px horizontal, 32 px top |
| Content max | 1240 px |
| Grid | 12 columns, 18 px gutter |

The rail is the anchor: brand at top, primary navigation, account and version at the bottom.
Pages never repeat the brand or add a second sidebar. Settings is the only two-column page
(212 px tab list + fluid panel) and the tab list must not scroll with the panel.

## Type

Manrope variable (200–800), fallback Inter/system. JetBrains Mono only for logs and numbers
that need column alignment. Scale: 44/52 display, 30/38 page title, 20/28 section, 15/22 card
title, 13/20 body, 11/16 secondary, 9–10 px uppercase labels with 1–1.6 px tracking.

Rules: page titles use −0.8 px tracking; never use letter-spacing on body text; uppercase labels
are 800 weight and muted, never accent unless they are an eyebrow.

## Colour

- Background: `#050f17` with two radial auras (aqua and azure) at 10–16% opacity.
- Surfaces: panel `#0a1923`, raised `#0d202b`, field `#0e2430`.
- Lines: 8% white (12% for strong dividers). On light theme use 10% ink.
- Text: primary `#e9f5f8`, secondary `#aac2cc`, muted `#7d97a4`.
- Status: ok `#5fe3a1`, warn `#ffc86b`, danger `#ff8095`; each has a 12% soft fill.
- Accent presets: 12 hues, all desaturated enough to keep white text readable. Primary buttons
  use an accent → azure gradient and dark ink text.

Contrast: body and secondary text pass 4.5:1 on `#050f17`; muted text is reserved for
non-essential metadata, never for actions or field values.

## Components

- **Button** — 34/40/46/58 px heights, 12 px radius. Primary is the only gradient; soft is a
  5.5% white fill with a 14% border; quiet has no chrome. Icon + label gap 9 px.
- **Field** — 44 px, 12 px radius, `#0e2430`, 10% border, accent ring on focus. Labels sit above,
  hints below in 10–11 px muted.
- **Card** — 20 px radius, 20–22 px padding, panel fill, 8% border. Cards may contain a media
  strip at the top with a 12 px inner radius.
- **Chip / tag** — 24 px pill, 10.5 px 700 text, 0.3 px tracking; status variants use soft fills.
- **Rail item** — 42 px, 12 px radius, 18 px icon, 13 px label. Active: accent-soft fill, 3 px
  accent bar at the left, 700 weight. Collapsed: icon only, labels become tooltips.
- **Stat tile** — label 9 px uppercase, value 19–20 px 800, number never wraps.
- **Progress ring** — 132 px, 10 px track, rounded accent cap, percentage centred.
- **Lists** — project rows 92 px, file rows 54 px, both 14–16 px radius. Icon 36–64 px, title
  and one metadata line, actions right-aligned.

## Page recipes

- **Home** — 336 px hero with art, 44 px headline, version selector + primary Play, meta line.
  Below: section header and three equal 4/4/4 widgets (overview, PC, latest).
- **Library** — header + action, search / segmented filter / sort toolbar, 4-column version
  cards, “show more” at the end.
- **Discover** — title, content tabs, catalog bar (search, sort, filters), active filter chips,
  result count + source, 92 px result rows, pager. Filters collapse into a side sheet under 1100 px.
- **Instances** — 4-column cards (icon, name, loader, meta, Play + management), then a dashed
  “new instance” card, then one explanatory panel.
- **Pack** — back link, 148 px pack hero (icon, tags, title, meta, Play / Add content), tabs,
  four stat tiles, filter chips, search + select-all, 54 px file rows.
- **Achievements** — progress hero with ring and three numbers, then 3-column achievement cards.
- **Accounts** — account list left (92 px rows, active accent border), 422 px Microsoft/offline
  panel right. Exactly one primary button per panel.
- **Settings** — 208 px tab list, fluid panel; each field is a label/hint column plus a control
  column. Theme cards are 4-up, swatches are 12 circles, sliders use a 4 px track with a 7 px knob.

## Responsive

| Width | Behaviour |
| --- | --- |
| ≥ 1280 | 4-column cards, full rail, widgets 4/4/4 |
| 1100–1279 | 3-column cards, filter rail becomes overlay |
| 900–1099 | 2-column cards, page header wraps, actions stay on the title row |
| 680–899 | rail collapses to 76 px, widget grid 2-up, stat tiles 2×2 |
| < 680 | rail becomes a 100% bottom bar, one column everywhere, hero stacks Play below selector |

Never shrink tap targets below 40 px. Tables and file rows may scroll horizontally but page
headers must not.

## Accessibility

- Visible 2 px accent focus ring on every interactive element; focus is never removed.
- Icon-only buttons need `aria-label` and a 40 px hit area.
- Status chips pair colour with text. Risk levels include the word (safe / warning / high).
- Images have empty alt inside cards when the title is adjacent; decorative art is `aria-hidden`.
- Motion respects `prefers-reduced-motion`. Do not autoplay video in the hero.
- Minimum body 13 px; do not use 9 px labels for information a user must act on.

## Figma workflow

1. Drag `screens/*.svg` into Figma, or use **File → Import**. Each file becomes one 1440 × 900
   frame with named groups (Title bar, Rail, Hero, Widgets section, …).
2. Text stays live text. If Figma asks for a font, install **Manrope** (Google Fonts) and
   **JetBrains Mono**; the SVG embeds a preview subset but Figma maps to the installed family.
3. Import `tokens.json` with the **Tokens Studio** plugin, or copy values into Figma variables.
4. Keep the 48 px page margin and 18 px gutter when adding new screens. Reuse the component
   patterns above instead of inventing new radii or shadows.
5. `node design/build.mjs` regenerates every frame after a code change; edit the generator, not
   the exported SVG, when the change should apply everywhere.
