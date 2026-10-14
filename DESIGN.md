---
name: Gitarchy
description: Git hosting with Spark analytics built in, in one stone-graphite developer workspace.
colors:
  canvas: "#19191a"
  shell: "#141415"
  deep: "#0a0a0a"
  surface: "#2a2a2a"
  raised: "#363636"
  line: "#363636"
  line-soft: "#262627"
  stone: "#938a87"
  stone-2: "#605e5e"
  stone-hi: "#cfc6c2"
  fg: "#f3f0ee"
  fg-2: "#b7b0ad"
  fg-3: "#a39b98"
  fg-4: "#7a7574"
  ok: "#88c098"
  warn: "#e0b066"
  err: "#ec8a7c"
  info: "#a4b4c4"
  focus: "#e6dfdb"
  viz-1: "#a39b98"
  viz-cool: "#5b98d2"
  viz-warm: "#c47f40"
  viz-grid: "#2a2a2b"
typography:
  display:
    fontFamily: "Urbanist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.6rem, 5.6vw, 4.6rem)"
    fontWeight: 780
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Urbanist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: "2.125rem"
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Urbanist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 700
    lineHeight: "1.625rem"
  body:
    fontFamily: "Urbanist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 450
    lineHeight: "1.375rem"
  label:
    fontFamily: "Urbanist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 650
    lineHeight: "1.125rem"
  meta:
    fontFamily: "Urbanist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 450
    lineHeight: "1rem"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: "1.35rem"
rounded:
  xs: "2px"
  sm: "3px"
  md: "4px"
spacing:
  topbar: "52px"
  rail: "232px"
  control-x: "12px"
  cell-y: "8px"
  cell-x: "12px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-hover:
    backgroundColor: "{colors.raised}"
  button-primary:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.fg-2}"
    rounded: "{rounded.md}"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.err}"
    rounded: "{rounded.md}"
    height: "32px"
  button-sm:
    height: "28px"
    padding: "0 9px"
  input:
    backgroundColor: "{colors.deep}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "0 11px"
    height: "36px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.fg-2}"
    rounded: "{rounded.sm}"
    padding: "0 6px"
    height: "20px"
  menu:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "5px"
  dialog:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    width: "min(30rem, calc(100vw - 2rem))"
  code-well:
    backgroundColor: "{colors.deep}"
    textColor: "{colors.fg}"
    typography: "{typography.mono}"
---

# Design System: Gitarchy

## Overview

**Creative North Star: "The Stone Ledger"**

Gitarchy is a dark, warm-graphite developer workspace where repository hosting and Spark analytics share one visual grammar. Everything is a ledger: rows ruled by 1px lines, history threaded down a single vertical rail, code sunk into near-black wells. The accent is a desaturated warm stone, used sparingly enough that it reads as "you are here" rather than decoration.

Density is high and calm. Product UI runs on a 14px body with a tight 1.2 scale; only the landing page is allowed a large display headline. Depth comes from tonal layering (shell darker than canvas, wells darker still, menus lighter), not from cards or shadows. The one recurring signature is the commit spine: the same rail-and-ring-node form carries commit history, activity feeds, the sidebar nav, the landing feature list and the Spark job lifecycle.

**Key Characteristics:**
- Dark warm-graphite canvas with tonal layers, never pure black UI chrome.
- 1px rules instead of cards; corners never exceed 4px.
- Stone accent reserved for selection, the active rail node and spine nodes.
- State colours (sage, amber, brick, slate) appear only where they carry meaning, always with a glyph or label.
- Urbanist for all UI; JetBrains Mono only for code, hashes, paths, Spark operators and table numerals.
- The commit spine is the signature form across hosting and analytics.

## Colors

A warm graphite neutral ladder with one muted stone accent and four soft state hues.

### Primary
- **Weathered Stone** (stone): selection tint, the active rail node, spine ring nodes, chart single-series fills, blockquote and link underlines. 5.21:1 on canvas but 4.26:1 on surface, so it never sets small text on surface.
- **Pale Stone** (stone-hi): accent text and hover-on-accent, the second line of the landing display headline, active nav icon, input focus border and caret.
- **Dim Stone** (stone-2): the spine rail itself, idle nodes, link underline at rest, input hover border, chart zero lines.

### Neutral
- **Warm Graphite** (canvas): the main application canvas and the landing body.
- **Shell Graphite** (shell): the top bar, side rail, mobile drawer and alternating landing bands.
- **Well Black** (deep): code wells, diffs, and input fields (fields are sunk, not raised).
- **Surface Graphite** (surface): default buttons, selected nav rows, inline code, table header fills.
- **Raised Graphite** (raised / line): menus, dialogs, toasts; the same value is the standard 1px rule.
- **Soft Rule** (line-soft): row dividers inside tables and under spine rows.
- **Bone** (fg): primary text and the inverted primary button.
- **Ash** (fg-2): secondary text (8.22:1 on canvas, 6.72:1 on surface).
- **Metadata Ash** (fg-3): timestamps, hints, table headers, axis labels (6.44 on canvas, 5.26 on surface, 4.43 on raised).
- **Spent Ash** (fg-4): disabled text and placeholders only.

### Tertiary (state)
- **Sage** (ok): succeeded jobs, additions, connected states.
- **Amber** (warn): queued, running and live states; the pulsing live node ring and job progress bars.
- **Brick** (err): failures, deletions, destructive actions.
- **Slate** (info): informational nodes.
- Diff rows tint with the state hue at 11% (24% for emphasis): `rgb(136 192 152 / 0.11)` additions, `rgb(236 138 124 / 0.11)` deletions.

### Data visualization
- **Stone series** (viz-1): every single-series chart.
- **Cool / Warm polarity pair** (viz-cool, viz-warm): additions vs deletions, positive vs negative coefficients. Validated as a pair on the canvas; do not swap in the state colours for polarity.
- **Grid** (viz-grid): horizontal gridlines only, no vertical grid.

### Named Rules
**The Stone Is A Marker Rule.** Stone marks position and selection: the active node, the selected radio card, the highlighted code line. It is not a fill for buttons, banners or headings.

**The Meaning-Only State Rule.** Sage, amber, brick and slate appear only when the thing is in that state, and always paired with a glyph or text label; colour alone never carries status.

**The Small-Text Floor Rule.** Small text on surface or raised uses fg-3 or lighter. Stone is not small text on surface; fg-4 is disabled-only.

## Typography

**Display Font:** Urbanist (with ui-sans-serif, system-ui)
**Body Font:** Urbanist (with ui-sans-serif, system-ui)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, SFMono-Regular, Menlo), ligatures off

**Character:** Urbanist's geometric, slightly rounded forms set at heavy weights with negative tracking give headings a dense, engraved feel; JetBrains Mono marks anything machine-shaped. Body runs at a non-default 450 weight for legibility on the dark canvas.

### Hierarchy
- **Display** (780, clamp(2.6rem, 5.6vw, 4.6rem), 0.98, -0.035em): the landing headline only.
- **Landing section headline** (700, clamp(1.75rem, 3vw, 2.5rem), tight, -0.025em): landing section heads only.
- **Headline** (700, 1.75rem, -0.02em): page titles in the app, auth and error screens. Repository titles step down to 1.4375rem.
- **Title** (700, 1.1875rem): section heads inside a page and spine item titles on the landing.
- **Body** (450, 0.875rem / 1.375rem): all product UI. Long-form README prose runs at 0.9375rem / 1.7, max 78ch.
- **Label** (600-650, 0.8125rem): buttons, form labels, nav (500 at 0.84375rem in the rail).
- **Meta** (450-650, 0.75rem): hints, timestamps, table headers, spine day separators. Chips are 0.6875rem / 650.
- **Mono** (400, 0.8125rem / 1.35rem): code wells; inline hashes, paths and Spark operators use mono at the surrounding size.

### Named Rules
**The Mono Means Machine Rule.** JetBrains Mono is for code, hashes, paths, branch names, Spark operators and numerals. Never for headings, labels or prose.

**The Sentence Case Rule.** Labels, table headers, group labels and day separators are sentence case at normal or near-normal tracking. No uppercase tracked labels.

**The Tabular Rule.** Tables and data numerals always use tabular figures.

## Layout

The app is a fixed frame: a sticky 52px top bar (mark, search, create, notifications, avatar) over a 232px collapsible side rail, both on the shell layer and separated from content by a 1px rule. Content padding steps 16 / 24 / 32px across breakpoints, with 24px top and 64px bottom. Pages open with breadcrumb or back link, title with an inline status chip, and the primary action at the right edge, then the table, code well or spine fills the width. Below the `lg` breakpoint the rail becomes a modal drawer (min(18rem, 86vw)) opened from a ghost icon button.

The landing is a max 84rem column with 20 / 32px gutters, a two-column hero (copy 0.9fr, live preview 1.1fr) that stacks on mobile, and full-bleed bands alternating canvas and shell separated by 1px rules.

Spacing rhythm is small and regular: controls 32px tall (28px small, 36px fields), table cells 8px by 12px, label to field 6px, spine rows separated by roughly 28px.

## Elevation & Depth

Flat by default; depth is tonal. Shell chrome (`#141415`) is darker than the canvas so it recedes, the work area sits forward, wells sink furthest, and floating layers (menus, dialogs, toasts, chart tooltips) step up to raised graphite with a slightly lighter `#474545` border. Shadows appear only on those floating layers, as soft, dark, diffuse falloff.

### Shadow Vocabulary
- **Popover** (`box-shadow: 0 12px 32px -8px rgb(0 0 0 / 0.6), 0 2px 6px rgb(0 0 0 / 0.35)`): menus and toasts.
- **Dialog** (`box-shadow: 0 24px 60px -12px rgb(0 0 0 / 0.7)`): modal dialogs, over a `rgb(5 5 5 / 0.62)` backdrop.
- **Field focus** (`box-shadow: 0 0 0 3px rgb(207 198 194 / 0.16)`): input focus halo with a stone-hi border.

### Named Rules
**The Floating-Only Shadow Rule.** Only things in the top layer cast shadows. Panels, tables and sections never do; they separate with 1px rules and tone.

## Shapes

Corners are small and squared: 2px for focus outlines and legend swatches, 3px for chips, inline code and menu items, 4px for everything else (buttons, fields, menus, dialogs, panels, bar-chart caps). Circles are reserved for spine nodes, rail nodes, avatars, status dots and progress tracks. Borders are always 1px (1.5px on spine node rings). The repeating geometry is the vertical rail with ring nodes; the Gitarchy mark (a branch arching from two pillar nodes to a merge node) is the same idea drawn as a logo.

## Components

### Buttons
Compact and quiet; the only bright object on a screen is the primary action.
- **Shape:** gently squared (4px), 32px tall, 600 weight at 0.8125rem, 15px icons with a 6px gap.
- **Default:** surface fill with a 1px line border; hover lifts to raised with a `#4a4848` border; active nudges 0.5px down.
- **Primary:** inverted bone fill with canvas text; hover brightens to `#fffdfb`. One per view.
- **Ghost:** transparent, ash text; hover fills surface. Used for chrome and toolbar actions.
- **Danger:** transparent with brick text and a 40% brick border; a solid brick variant for confirmed destructive steps in dialogs.
- **Small / Icon:** 28px small; icon buttons are square.
- **Focus:** a 2px bone (focus) outline offset 2px, everywhere.

### Chips
- **Style:** 20px tall, 3px corners, 1px line border, transparent fill, ash text at 0.6875rem / 650, optional 11px glyph.
- **State:** status chips pair a glyph and label (e.g. "Waiting for worker" with a spinner glyph); "Sample data" chips label illustrative content.

### Cards / Containers
There are no cards. Groupings are ruled regions: a 1px line border at 4px corners when a frame is needed (preview panels, diff frames), otherwise just a rule above or below. Internal padding is 10-16px.

### Inputs / Fields
- **Style:** sunk into well black, 36px tall, 1px `#4a4848` border, 4px corners, 14px text; placeholders in spent ash.
- **Hover:** border warms to dim stone.
- **Focus:** border to pale stone plus a 3px 16% pale-stone halo.
- **Error / Disabled:** brick border with a brick message below; disabled goes transparent with spent-ash text.
- **Radio cards:** bordered option rows that take a stone border and an 8% stone tint when checked.

### Tables
Rules, not cards: header cells in metadata ash at 0.75rem / 600 over a 1px line; body rows divided by the soft rule, with a faint surface tint on hover. Tabular figures throughout.

### Navigation
The side rail is itself a spine: a 1px rule runs behind the items, the current page is a filled stone node on the rail, its row filled surface and its icon pale stone. Inactive items are ash with metadata-ash icons; hover shows a hollow dim-stone node. Items are 32px tall at 0.84375rem / 500. Repo context nav stacks above the workspace group.

### Menus and Dialogs
Popover-API menus and native `<dialog>` on raised graphite with a `#474545` border, 4px corners and the floating shadows. Menu items are 0.8125rem with 15px metadata-ash icons, hovering to `#424040`. Dialogs enter with a 180ms fade-rise on the house ease.

### Code Wells
Well black, JetBrains Mono 0.8125rem / 1.35rem, ligatures off, tab size 4. A sticky right-aligned line-number gutter (`#6a6564`, brightening on hover); a targeted line takes a 14% stone tint. Syntax colours follow the warm "gitarchy-stone" theme: tan keywords, sage strings, amber numbers, slate types, bold bone function names, italic muted comments.

### The Commit Spine (signature)
A 1px dim-stone vertical rail threading a list, with 10px ring nodes (canvas fill, 1.5px stone ring) centered on each row's first line. Node tone carries state: sage ok, amber warn, brick err (filled), slate info, dim-stone idle, solid stone for emphasis. A live node adds a pulsing amber ring. Day separators break the rail with a dashed segment and a 0.75rem / 650 metadata-ash date. The same component carries commit history, activity, landing feature lists and the job lifecycle (queued, dispatched, running, result), where each step also carries a glyph and a label.

### Charts
Single series in stone; polarity in the cool/warm pair; horizontal gridlines only; 4px caps on bar ends; axis labels in metadata ash at 11px, category labels in ash (mono for feature names); tooltips on raised graphite with a small square swatch. No chart animation.

## Do's and Don'ts

### Do:
- **Do** separate regions with 1px rules (line `#363636`, line-soft `#262627`) and tonal steps, not cards.
- **Do** keep every corner at 4px or less; circles are only for nodes, dots, avatars and progress tracks.
- **Do** thread any history, feed or multi-step process down the commit spine with toned ring nodes.
- **Do** pair every state colour with a glyph or a text label.
- **Do** set code, hashes, paths and Spark operators in JetBrains Mono, and everything else in Urbanist.
- **Do** use one inverted bone primary button per view; the rest are default, ghost or danger.
- **Do** transition state changes over 150ms on `cubic-bezier(0.16, 1, 0.3, 1)` and honour reduced motion.
- **Do** label illustrative content with a "Sample data" chip.

### Don't:
- **Don't** use stone as a button fill, banner, or small text on surface (4.26:1).
- **Don't** use fg-4 (`#7a7574`) for anything but disabled text and placeholders.
- **Don't** add shadows to panels, tables or sections; shadows are for menus, dialogs, toasts and tooltips only.
- **Don't** build hero-metric card grids or a separate admin-dashboard look for analytics; analytics uses the same tables, spine and charts as hosting.
- **Don't** use uppercase tracked labels or kicker lines above headings.
- **Don't** set text below 0.6875rem.
- **Don't** use the state colours for chart polarity; use the cool/warm pair.
