# D365FO Field & Help Text Scanner

A Chrome extension that scans the currently open Dynamics 365 Finance & Operations
form and lists every field's **control name**, **label**, and **help text**, with
CSV/JSON export.

## Install (unpacked, for now)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder
4. Pin the extension for easy access

## Use

1. Open the D365FO form you want to document
2. Click the extension icon
3. Click **Scan current form**
4. Export as CSV or copy as JSON

The extension only runs when you click the button (`activeTab` permission) — it
does not run in the background or on pages you haven't explicitly scanned.

## How it works

D365FO renders forms as plain HTML and tags nearly every control with a
`data-dyn-controlname` attribute (its AOT name). The scanner:

- Finds all `[data-dyn-controlname]` elements
- Resolves each one's label via `<label for>`, `aria-label`, `aria-labelledby`,
  or a nearby label node in the field's wrapper
- Resolves help text via the `title` attribute, `aria-describedby`, or a nearby
  info-icon tooltip
- Skips pure layout containers (groups, tabs, sections) that have no label of
  their own

## Forms with tabs / FastTabs

D365FO only renders a tab's fields into the DOM once that tab has been
opened, so a plain scan only ever sees whichever tab is currently active
(e.g. only "General" on a form with General / Planned orders / Standard
update / … in the left-hand tab strip).

Two ways to handle this:

1. **Auto-walk (experimental)** — the "Try to auto-click through this form's
   tabs" option (on by default) looks for a tab strip, clicks through each
   tab, waits for its content to render, and merges the fields it finds. This
   depends on recognizing the tab strip's markup, which varies across D365FO
   versions/forms, so it won't always find one — if it doesn't, it silently
   falls back to scanning just the currently active tab.
2. **Manual merge (always works)** — turn on **"Merge with previous scan
   results"**, then: scan the first tab, click the next tab yourself, scan
   again, and so on. Each scan adds its fields to the running total instead
   of replacing it (matched by tab name + control name, so re-scanning the
   same tab just refreshes it). Use **"Clear accumulated results"** to start
   over.

If auto-walk isn't finding your form's tabs and you'd like it fixed rather
than relying on the manual merge: open DevTools on the form, right-click one
of the tab labels (e.g. "Planned orders") → Inspect, and share the outer HTML
of that element and its parent — that's enough to add a matching selector.



Many D365FO forms only render a field's help text as a tooltip when you hover
the field label — it isn't in the page's HTML until that happens. The
**"Also hover fields to reveal tooltip-only help text"** option (on by
default) handles this: for every field with no help text already in the DOM,
the extension simulates hovering its label, waits ~500ms for the tooltip to
mount, reads it, then moves to the next field. Fields whose help text came
from a simulated hover are tagged `hover` (a badge in the table, and a
"Help Source" column in the CSV).

This is slower — roughly 0.4s per field that needs it — so on a form with
many empty-help fields the scan can take several seconds. **Keep the popup
open and the tab active/focused until it finishes**; closing the popup mid-scan
cancels the injected script.

If a field still comes back empty after a deep scan, its tooltip likely needs
a real mouse position over the element (some virtualized/animated tooltips
are picky) — try hovering it manually once yourself, then re-scan.

## Screenshots

Turn on **"Capture a screenshot of each tab"** to grab what's visible in the
browser viewport right after switching to each tab (works with both
auto-walk and the manual merge workflow). Screenshots appear in a gallery at
the bottom of the popup — click one to view it full-size in a new tab, or use
the per-image **Download** link. **"Download all screenshots (combined
PNG)"** stitches every captured screenshot into a single tall image with a
label bar above each one, handy for a one-file overview of the whole form.

Only the visible viewport is captured, not the full scrollable page — if a
tab is taller than the browser window, scroll to the section you care about
before scanning, or scan multiple times and combine the results.

## Lookup fields

Turn on **"Open lookup fields and capture their available values"** to have
the extension detect dropdown/lookup-style fields, open each one, read the
values shown in the resulting list/grid, and close it again. Results show up
in a **Lookup values** table and can be exported via **Export Lookups CSV**.
If screenshots are also enabled, each opened lookup gets its own screenshot
too (appears in the gallery labeled `<field> (lookup)`).

This is experimental and heuristic-based (it looks for `role="combobox"`,
`aria-haspopup`, or a nearby button with "lookup" in its class/aria-label),
so detection may miss some fields or, for grid-style lookups with many rows,
only capture what's visible without scrolling through the whole list. If a
lookup isn't being detected or opened correctly, send me the outer HTML of
that field and its lookup button (right-click → Inspect) and I'll refine the
selector — same approach that fixed the tooltip and tab-strip detection.

## Other known limitations

- **Grids**: D365FO virtualizes grid rows/columns, so only currently-rendered
  columns are captured. Scroll the grid horizontally and re-scan to pick up
  more columns.
- **Fast-tab / collapsed sections**: fields inside a collapsed FastTab aren't
  in the DOM yet — expand the section first.
- **Popup lifetime**: like any browser-action popup, closing it (including by
  clicking elsewhere) stops the in-progress scan. There's no way around this
  without turning the extension into a side panel — let me know if you'd
  rather have that instead.

## Files

- `manifest.json` — Manifest V3 config (activeTab + scripting only, no broad
  host permissions, no background script)
- `scanner.js` — injected into the page on demand to walk the DOM
- `popup.html` / `popup.js` — the extension's UI, results table, and export
