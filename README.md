# Artura — website

Two screens: a splash gate, and a 360° aerial tour behind it.

The 360 runs from page load, underneath the splash. Entering is a camera move,
not a page change — the same renderer throughout, so the handover cannot show a
seam.

## The title, and how it becomes the map label

The ARTURA text is one element for the whole journey, and **it never moves**. It
sits from the first frame exactly where it will end up — on the site pin, as that
landmark's label — so the brand name and the place on the map are literally the
same piece of text. Entering only changes its size: the name and tagline scale
down, and the place line fades.

This works because the tour's opening `YAW` is set to the pin's own yaw, which
centres the pin in frame so the title reads as a title. **Change `YAW` or `PITCH`
and you must re-run `tools/render-poster.ps1`**, or the splash still no longer
matches the live panorama behind it.

The scale is taken about the *core's* centre, not the element's top-left, which
is what keeps the core pinned to its landing point at every size and at any
viewport. Verified: the core centre measures identically on both screens, with
only the scale differing.

What makes the landing invisible: both the flying title and the pin's label are
the **same `.lockup` component** — ARTURA RESORTS over `Clubhouse & Concierge`.
Sharing one class makes the typographic
match structural rather than two rules someone has to remember to keep in step.
The flight ends at `scale(1)`, so the flying text lands pixel-for-pixel on the
real label, which fades in as the flying copy disappears.

### The core

The lockup has two parts. `.lockup__core` is name + tagline — **this is what
flies and becomes the pin's label.** `.lockup__place` (`Pointe aux Biches,
Mauritius`) sits outside the core, because it belongs to the title card and not
to a map label; it fades as the flight begins and the pin's label never carries
it.

So the flight measures the **core**, not the whole lockup, and then backs out the
core's offset within the lockup — the transform positions the lockup's top-left,
which is not necessarily the core's. Right now the name line is the widest in the
block, so that offset happens to measure zero — but it is measured, not assumed,
which is why it survived the rename. Add another line to the title card and the
flight keeps working.

Positioning is entirely by `transform` from a `0,0` origin, so the move is a
single interpolation and stays correct at any viewport size. The splash scale is
computed from the viewport rather than hard-coded per breakpoint, because
whichever line is widest runs out of room first — since the name became "Artura
Resorts" that is the name line (436px against the tagline's 430px), where it used
to be the tagline.

One subtlety in `primaryLabelTarget()`: the pin's label is centred above the
marker using `translate(-50%, -100%)`, and a transform is invisible to
`getComputedStyle`'s `left`/`top`. So the flying title passes in its own measured
size and the function undoes the translate. Without that the landing is half a
label's width to the right and a label's height too low. The measurement comes
from the flying title rather than the label itself because the label sits inside
a Marzipano hotspot and may not be laid out yet.

Once landed, the pin's label carries the brand. If the visitor turns far enough
that the pin leaves the frame, a small corner wordmark fades in to stand in, and
fades out again when the pin returns.

## The locator

Bottom left of the splash: an outline of Mauritius with Artura marked, fading out
with the title card on entry. Coastline and marker only, no districts, no fill.

**The coastline is real geometry**, traced from a raster outline map rather than
drawn. `tools/trace-coastline.ps1` reads the pixels, flood-fills the sea from the
image border, and follows the outer boundary of what is left with Moore-neighbour
tracing, then simplifies with Douglas-Peucker. Output: 559 points, viewBox
`0 0 1000 1089`.

Because only the **outer** contour is followed, the district lines inside the
source map are ignored automatically — which is exactly what "outline only"
needs. To retrace from a different source:

```bash
powershell -File tools/trace-coastline.ps1 -Source "C:\path\to\map.png"
```

It prints a path to paste over `.locator__coast`. `-Tolerance` controls detail
(1.6 gives 559 points; higher is coarser).

### The marker

Placed from Pointe aux Biches' real coordinates — 20.086°S, 57.531°E — mapped
onto the island's bounding box, which works because the source map is
effectively equirectangular. Then snapped to the nearest point on the traced
coast, since the village centre sits about 34 units (roughly 1.7 km) inland of
the shore. It now sits 0.2 units off the path.

An earlier version of this locator was hand-drawn at an aspect of 1.40, from the
often-quoted "65 × 47 km". **That was wrong.** At 20°S the island's true lat/lon
span works out near 1.10, and the traced map measures 1.089. The real data
corrected the estimate.

Azuri's map was not reused: it is a raster with no path data, and it carries
their branding.

## Sun glare

Turning away from the estate turns you into the light. A glare element is
anchored to a fixed direction in the panorama (`SUN` at the top of
`assets/js/tour.js`) and moved to wherever that direction lands on screen, so it
behaves like a real sun rather than a filter laid over the picture. Its strength
comes from how near the centre of frame it is, squared so the glare arrives late
and quickly instead of washing over the whole rotation.

It blends with `screen`, which lifts the photograph rather than greying it.

Measured across a full turn: zero at the site, peaking at 0.74 at the sun's own
bearing, ramping smoothly and wrapping continuously across ±π. Move `SUN` to
change where the light sits — negative pitch is above the horizon.

There is **no audio**.

Modelled on [azulina-mauritius.com](https://azulina-mauritius.com), which is a
Pano2VR tour on WordPress + Elementor and also does not scroll.

## Running it

Plain static files — no build step, nothing to install.

```bash
powershell -File tools/serve.ps1
```

Then <http://localhost:8087/>. Use the server rather than opening `index.html`
directly: browsers block the panorama texture over `file://`.

## Layout

```
index.html                   the two screens
assets/css/styles.css        all styling, design tokens at the top
assets/js/tour.js            the 360 — landmarks and site boundary live here
assets/js/main.js            splash gate and the wordmark's flight
assets/js/picker.js          coordinate picker, loaded only with ?pick
assets/img/                  panorama, poster, plan
content/sections-parked.html the old scrolling sections — not loaded, not lost
tools/serve.ps1              local static server
tools/resize-images.ps1      regenerates assets/img from the drone originals
tools/render-poster.ps1      re-renders the splash still to match the tour view
```

## Marking up your landmarks and the site boundary

Open the page with `?pick` on the end:

```
http://localhost:8087/?pick
```

A panel appears top right with two modes.

**Landmark mode** — click a point, it records one landmark. Drag to look around
as normal; only a clean click drops a point, so you can navigate freely without
leaving stray markers.

**Boundary mode** — click each corner of the site in order, going round the
outside. Three or more corners close into a shape, drawn live as you go.

Both modes write a paste-ready block into the box. Press **Copy**, then paste it
over `LANDMARKS` or `BOUNDARY` at the top of `assets/js/tour.js`. For landmarks,
fill in the `label`, `title` and `text` afterwards — the picker cannot know what
you are pointing at.

The picker is exact: clicking at a screen position and converting back returns
the same pixel, verified to zero error.

**Undo** removes the last point, **Clear** empties the current mode, **Close**
leaves picker mode.

### If you would rather not use the picker

Positions are yaw/pitch in radians. To convert a pixel in the equirectangular
original (12000 × 6000):

```
yaw   = (x / 12000 - 0.5) * 2 * Math.PI
pitch = (y /  6000 - 0.5) * Math.PI
```

Or drag a point to the centre of the screen and read it off the console:

```bash
arturaTour.view.yaw(); arturaTour.view.pitch()
```

## What is a placeholder

**The site boundary is real** — four corners marked up from the panorama with the
picker. Re-run `?pick` in Boundary mode to adjust it. Corner order matters: the
sequence must trace the outside of the shape, or the polygon crosses itself.

The boundary **is** drawn on the splash, unlike the landmarks. That was the
literal instruction rather than a considered choice — say if it should be hidden
there too.

**Seven landmarks, all picked from the panorama:** Coin de Mire, Mont Choisy,
Grand Baie, Trou aux Biches, Artura, Pointe aux Piments, Turtle Bay. Artura
carries `primary: true`, which gives it a larger dot in lagoon blue and a larger
label — it is the estate, not a distant view.

Port Louis was removed. Pointe aux Piments and Turtle Bay replaced it, both on
the coast to the east.

One spelling was corrected from how it was sent: **Mont Choisy** (not "Mon
choisy").

### Marker shape and crowding

**Landmarks do not appear on the splash.** The first screen is the photograph
and the wordmark, nothing else. They ease in once the push-in has settled.

Two marker styles:

- **Distant landmarks** are a dot with a thin leader line rising to the label.
  The dot never moves off its picked coordinate; the label is lifted clear on
  the leader, and the line keeps the two visibly tied together however far apart
  they get.
- **Artura** is a line-art map pin — hollow teardrop, dashed inner circle,
  outlined star, standing on a ground ellipse. Its label is the full lockup,
  centred **above** the marker, and is the text that flew in from the splash.
  No leader line: a stem growing out of a pin looks wrong.

  The artwork lives as `<symbol id="pin-artura">` in `index.html` rather than
  inside a JS string, and the source file's inline `#444b54` fills were stripped
  so the colour comes from CSS — it is the lagoon blue from the site's own
  aerial. The ground ellipse is held at 50% opacity; it is scenery, and at full
  strength it competes with the pin over a photograph.

  **The anchor is 32,53 in the 64×64 box** — the tip, where the pin meets the
  ground, not the centre of the artwork. CSS offsets the marker by half its
  width and 0.828 of its height to put that point on the coordinate.

  **`.landmark__pin` must keep `max-width: none`.** The reset applies
  `max-width: 100%` to every `svg`, and `.landmark` is deliberately `width: 0` so
  the marker lands exactly on its coordinate — so `100%` resolved to zero and
  collapsed the icon to nothing. It rendered at 0×0 and was simply invisible.
  The `viewBox` and `width`/`height` attributes on the tag are a second line of
  defence: an inline `<svg>` with neither has no intrinsic size at all, so it
  depends entirely on the stylesheet resolving.

  Size is set by `--pin` (40px). The artwork fills about 57 of its 64 units
  vertically, so it draws ~35px tall — matching the ARTURA text beside it.

### Stacking order

Markers and labels sit **in front of** the boundary hatch and perimeter. Getting
that right took two goes, and both traps are easy to fall back into.

Marzipano's DOM under `#pano` looks like this:

```
#pano                       (must stay z-index: auto)
├── canvas
└── DIV                     ← .tour__hotspots goes HERE
    └── DIV                 ← carries a transform
        └── hotspot container
```

1. **`#pano` must not have a `z-index`.** Any value creates a stacking context
   and traps everything below it. It was `z-index: 0`, which is why the hatch
   painted over the pin in the first place. The canvas renders beneath every
   positioned layer without needing one, so nothing is lost at `auto`.
2. **The class goes on the outermost Marzipano layer, not the hotspot
   container.** The container sits inside a wrapper carrying a transform, and a
   transform creates its own stacking context — so a z-index on the container
   only competes *inside* that wrapper, which itself sits at `auto` and paints
   below the shapes. `tour.js` walks up from the container to the direct child
   of `#pano` and tags that.

With `.tour__hotspots { z-index: 4 }` on the right element, markers paint above
the shapes (2), the sun glare (2) and the scrim (3).

**Verify structurally, not by `elementFromPoint`.** While the tab is not
compositing, Marzipano leaves its hotspot wrappers unpositioned, so hit-testing
returns whatever happens to be stacked at the origin and will happily report a
pass that is not real. Check instead that the tagged element is a direct child of
`#pano`, that its z-index beats the shapes', and that nothing between it and
`#tour` sets z-index, transform, filter or opacity.

The **site boundary** is filled in dark pastel red (`--clay #8F4A45`, stroke
`--clay-lt #C4736C` at 3.5px), which reads against both the green scrub and the
sand, and echoes the laterite soil already visible on the cleared ground.

`lead` is the leader length in pixels, and it is the whole mechanism for keeping
labels apart (ignored for the pin):

| Landmark | lead |
|---|---|
| Coin de Mire | 150 |
| Mont Choisy | 110 |
| Pointe aux Piments | 110 |
| Grand Baie | 70 |
| Turtle Bay | 40 |
| Trou aux Biches | 30, `side: "left"` |
| Artura | — pin |

The four northern landmarks crowd on the horizon — Coin de Mire and Mont Choisy
sit 36px apart on screen, Grand Baie and Trou aux Biches 41px, and the labels
are several times wider than that. Stepped leader lengths (150 / 110 / 70 / 30)
fan their labels up and away from one another, so the gaps between the dots stop
mattering.

The eastern pair crowds the same way. Pointe aux Piments and Turtle Bay sit
0.156 rad apart — about 70px on screen at the tour framing — while "Pointe aux
Piments" alone measures 172px wide. 110 and 40 fan them apart vertically, which
leaves 43px of clear air between the two labels at the tour framing.

**A longer leader is not automatically safer.** Where one dot sits below
another, lengthening the lower one's leader carries its label *up towards* its
neighbour; lifting the upper one opens the gap instead. Check which way the dots
lie before changing a value.

`side: "left"` puts a label on the other side of its leader. **Trou aux Biches
uses it**, and has to: the Artura lockup is 426px wide and centred on its pin, so
at fov 1.90 the two labels collided by 24px with Trou aux Biches on its default
side. Lengthening its leader to 190 also clears, but by only 3.5px — flipping it
leaves 21px, which is why the flip won.

That collision appeared when the name line became "Artura Resorts": the lockup
went from 341px wide to 426px, and a centred label spreads half of any growth
onto each side. **Widening the lockup is never a purely typographic change** —
re-run the overlap check after any edit to the brand text.

Verified free of overlap by sweeping the full zoom range (0.5–1.90) across yaw in
0.02 rad steps and six pitch values, at 1280×720 — **24,211 visible label pairs,
zero overlaps.** Tightest clearance anywhere is 21.2px, between Mont Choisy and
Grand Baie at fov 1.90. **If you add or move a landmark, or change the brand
text, re-run that check** — both clusters have little slack.

The check measures each label by cloning it outside its Marzipano hotspot and
computing screen positions from `coordinatesToScreen`, rather than reading the
live hotspots. That is deliberate: while the tab is not compositing, Marzipano
reports a view size of 0×0 and leaves hotspot wrappers unpositioned, so every
label measures 0×0 and the check silently passes without testing anything.

No unverified text appears on either screen.

The village is **Pointe aux Biches**, confirmed. An earlier draft said "Pointe
aux Piments", inferred from the filename `PTE O PIMENT SURVEY.dwg` and flagged as
unverified at the time — that was wrong, and the drone folder `POB_AERIAL_FINAL`
fits Biches. Corrected throughout: page title, meta, image alt text, the splash,
and the parked sections.

The splash carries a third line under the tagline, `Pointe aux Biches,
Mauritius`, at 0.5rem against the tagline's 0.58rem. It belongs to the title card
only — see the note on the lockup's core, below.

## The 360

[Marzipano](https://www.marzipano.net/) — free, open source, no licence cost,
loaded from a CDN. To vendor it, download `marzipano.js` into `assets/js/` and
change the script tag in `index.html`.

The panorama is `pano-aerial-4096.jpg`, from
`Incoming/2026-08-21_Drone/POB_AERIAL_FINAL/360_V01.jpg` (12000 × 6000
equirectangular). 4096px is the safe single-texture ceiling for mobile GPUs;
phones get the 2048px version. No tiling needed at this size.

Marzipano's `fov` is the **vertical** field of view — verified against
`coordinatesToScreen`, where `focal = (height / 2) / tan(fov / 2)`.

### The framing must stay in step

The splash still and the live panorama have to be framed identically or the
handover shows a jump. Three values must match:

| Where | Values |
|---|---|
| `assets/js/tour.js` | `YAW` `PITCH` `SPLASH_FOV` |
| `tools/render-poster.ps1` | `$YAW` `$PITCH` `$FOV` |

Change either, and re-run:

```bash
powershell -File tools/render-poster.ps1
```

That script does a proper rectilinear reprojection from the equirect image — a
plain crop will not line up.

`SPLASH_FOV` (1.60) is deliberately wider than `TOUR_FOV` (1.45); the difference
is the gentle push-in when the visitor enters.

## Page 3 — the plan view

Clicking the site boundary is meant to open a plan view of the estate. That page
does not exist yet, so the shape is **drawn but inert** — its fill brightens on
hover so it feels present, but there is no pointer cursor and no click, because
a shape that invites a click and goes nowhere reads as broken.

The handler is in `assets/js/tour.js` inside `addShape()`, commented, one line
from working. `assets/img/site-plan-1200.jpg` — the vertical top-down aerial —
is already the right asset for it.

## Known gaps

- **No enquiry form.** It went with the scrolling sections; the markup is in
  `content/sections-parked.html`. It never submitted anywhere.
- **No full loading screen.** The splash is the gate, shown every visit.
- **English only.**
- **No logo artwork.** `26-02_Artura/Logo/ARTURA LOGO AUG 2026.docx` holds a
  Word-typeset wordmark, not a logo file — no chosen typeface, no brand colour
  (72pt Times New Roman in grey `#595959` is Word's default, not a decision).
  The site sets it in Jost spaced capitals as an interim. Note the source
  document spells it "CONCIREGE"; the site uses "CONCIERGE".

## Deferred

Plot availability map, dated progress timeline, build-cost guide, location map.

## Images

`tools/resize-images.ps1` regenerates `assets/img` from the drone originals. It
uses .NET imaging via PowerShell, because this machine has neither Node nor a
real Python install.

It generates only what the page uses. Three further drone shots are available as
commented-out entries near the top of the script — the coast and lagoon wide, and
the estate from the west and from the east.
