---
id: DESIGN-PHASE-2-POKER-CHIP-STACK-RENDERING
kind: implementation-guide
status: phase-2-reuse-reference
owner: Ruihe Cai
captured_at: 2026-08-27
audience: product-design, phase-2-frontend, qa
source_status: captured from the owner-reviewed current landing implementation; not a publication approval
update_trigger: owner changes the accepted chip face, stack perspective, colours, placement, or table-centre rule
---

# Phase 2 poker-chip stack rendering implementation

## Purpose

This file preserves the implementation method behind the poker chips used in the
current landing-page play scene so that Phase 2 UI work can reuse the effect
without reconstructing it from screenshots or repeating the earlier visual
mistakes.

The implementation deliberately separates two concerns:

1. **Asset geometry is static.** Each chip or stack is rendered once into a
   transparent PNG. The face, side layers, vertical white edge bands, thickness,
   and compact cast shadow never rearrange in response to viewport size.
2. **Scene orientation is responsive.** The PNG may rotate as one rigid object so
   the line from the stack underside through the face points toward the visual
   centre of the table scene.

This is a reuse reference, not authorization to publish or deploy the landing
page or Phase 2.

## Owner-approved visual contract

These rules are the acceptance boundary. A Phase 2 implementation may change
component architecture, but it must not silently change this visual result.

| Property        | Required result                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Viewpoint       | Near-perpendicular, top-down view of a real table. The side wall is a restrained crescent, not a front-facing cylinder.                                                                   |
| Diameter        | All four chip faces have the same diameter. Stack height changes; diameter does not.                                                                                                      |
| Face            | Classic and elegant, with the current alternating ivory edge inserts, eight small ivory dots, double centre rings, and no denomination.                                                   |
| Black chip      | Highest stack: four visible side offsets beneath the face.                                                                                                                                |
| Green chip      | Medium-high stack: three visible side offsets beneath the face.                                                                                                                           |
| Red chip        | Low stack: two visible side offsets beneath the face.                                                                                                                                     |
| Blue chip       | One chip only. Do not add a multi-chip stack merely to match the other colours.                                                                                                           |
| Side pattern    | Ivory bands are short vertical segments repeated on each visible side layer. They are physical edge inserts, not highlights inside the cast shadow.                                       |
| Stack direction | For every stacked chip, the centre-line from the underside/crescent through the face aims toward the visual centre of the scene. It must not reverse at a responsive breakpoint.          |
| Shadow          | Small, soft, low-opacity contact shadow. It must not read as another chip layer, a thick black crescent, or a long directional drop shadow.                                               |
| Placement       | Preserve the accepted irregular four-chip arrangement, colours, relative sizes, and overlap order unless the owner explicitly changes it. Do not regularize the chips into a row or grid. |
| Scaling         | Scale every PNG uniformly. Never crop, stretch, change aspect ratio, or scale the side layers independently of the face.                                                                  |
| Interaction     | Decorative only: no focus target, hover movement, drag, or pointer interception.                                                                                                          |

### Current assets

All outputs are transparent, 8-bit RGBA PNGs rendered at `deviceScaleFactor: 2`.
Their source canvas is 128 CSS px wide, so every output is 256 physical pixels
wide. Different image heights reserve space for different stack depths and
shadows; they do **not** represent different chip diameters.

| Asset                                                                                      | Output size | Face/stack specification         | Current SHA-256 snapshot                                           |
| ------------------------------------------------------------------------------------------ | ----------: | -------------------------------- | ------------------------------------------------------------------ |
| [`hero-chip-black-stack.png`](../../apps/landing/public/product/hero-chip-black-stack.png) |   256 × 292 | black; side offsets 16, 12, 8, 4 | `5d3e46534b060cea121cc98c48b7099fc56f33a41a791feccf09fd36f4a39c0c` |
| [`hero-chip-green-stack.png`](../../apps/landing/public/product/hero-chip-green-stack.png) |   256 × 284 | green; side offsets 12, 8, 4     | `cbdc884ca931c103b64dbd0f9872aa8090a1627f465fc6c28c4afb46e9b70bb1` |
| [`hero-chip-red-stack.png`](../../apps/landing/public/product/hero-chip-red-stack.png)     |   256 × 280 | red; side offsets 10, 5          | `58570a320d469e6fa4587d77a8af3fab809b478433c785084ded12b700cf0f86` |
| [`hero-chip-blue.png`](../../apps/landing/public/product/hero-chip-blue.png)               |   256 × 272 | blue; one 4 px side offset       | `113d91b80a539e78f073cbaafd8ee2c794a97a66b7ffeaee727da7cd2a87ba61` |

The checksums are diagnostic snapshots, not permanent product identifiers. A
deliberate visual update will change them and must receive new visual approval.

## Why the chips are pre-rendered PNGs

An earlier multi-layer DOM/SVG approach allowed the face, side layers, and
shadow to respond independently to layout changes. That created three visible
failure modes:

- the side crescent changed relative size at different viewport widths;
- several overlapping layers read as a broken or comical stack;
- browser rendering differences could crop or omit SVG `foreignObject` content.

The accepted approach renders the complete chip into one transparent bitmap and
uses the image as a rigid scene prop. This gives the landing and Phase 2 code a
simple invariant:

> One visual chip or stack equals one image element with one transform.

Do not recreate `.face`, `.side`, or `.shadow` elements in the live Phase 2 DOM
unless a future requirement genuinely needs animated stack assembly and has a
new cross-browser visual test plan.

## Asset generator

The reproducible source is
[`apps/landing/scripts/generate-chip-art.mjs`](../../apps/landing/scripts/generate-chip-art.mjs).
It uses headless Chromium through Playwright only as a deterministic CSS raster
renderer; no photographed chip, external stock image, or generative image is
embedded in the output.

### 1. Per-colour configuration

Each entry defines:

- `colour`: face and upper side colour;
- `depth`: darker lower-side colour;
- `file`: deterministic output name;
- `height`: transparent canvas height in CSS px;
- `offsets`: vertical positions of side discs below the face;
- `shadow`: contact-shadow geometry.

The accepted colour pairs are:

```js
black: { colour: "#242b2a", depth: "#111514" }
green: { colour: "#1e5a4c", depth: "#10382f" }
red:   { colour: "#b83239", depth: "#671b25" }
blue:  { colour: "#2e5b9d", depth: "#17345f" }
```

### 2. Shared face geometry

Every colour uses the same 116 × 116 CSS px circular face inside a 128 px-wide
canvas. The face consists of:

1. eight small ivory radial dots;
2. a solid colour centre;
3. a narrow ivory ring and a second colour ring;
4. a repeating conic pattern for the broad ivory edge inserts;
5. an inset dark rule for physical edge definition;
6. a double centre-ring treatment built with `.face::after`.

The warm ivory is `#f6efe0`, matching the product's card-paper family. There is
no number, currency, logo, or denomination in the centre.

### 3. Side-wall construction

Every item in `offsets` creates a complete circular disc behind the face. Only
its lower arc remains visible, producing the near-overhead crescent. Each disc
uses:

```css
background:
  repeating-linear-gradient(
      90deg,
      transparent 0 10%,
      rgba(246, 239, 224, 0.88) 10% 18%,
      transparent 18% 34%
    )
    var(--phase) 0 / 100% 100%,
  linear-gradient(to bottom, var(--chip-colour), var(--chip-depth));
```

The linear-gradient segments create the ivory **vertical edge bands**. The
`--phase` offsets vary between layers so the bands do not form an artificial,
perfectly straight column. The shallow inset shadow separates adjacent layers.

Do not replace the side bands with white arcs in the cast shadow. Do not make
the lower crescent deeper to imply a more dramatic camera angle; the table view
is still nearly perpendicular.

### 4. Contact shadow

The current shadow is a 66 × 7 CSS px ellipse, centred beneath the chip, with:

```css
background: rgba(0, 26, 21, 0.14);
filter: blur(2.4px);
```

Its vertical position varies only enough to remain under each stack height. The
shadow is intentionally smaller than the 116 px face diameter and low-opacity.

## Regenerating the assets

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm exec node apps/landing/scripts/generate-chip-art.mjs
```

Then verify dimensions and transparency:

```bash
file apps/landing/public/product/hero-chip*.png
shasum -a 256 apps/landing/public/product/hero-chip*.png
```

Regeneration is not approval. Compare the new PNGs with the accepted assets and
run the browser checks below before updating the snapshot checksums in this
file.

## Runtime composition

The landing places four decorative `<img>` elements inside the same positioned
scene as the iPad and phones. Phase 2 should preserve this minimal structure:

```html
<img
  class="table-chip table-chip--black"
  src="/product/hero-chip-black-stack.png"
  alt=""
  aria-hidden="true"
/>
```

Required shared CSS:

```css
.play-scene {
  position: relative;
  container-type: size;
}

.table-chip {
  position: absolute;
  width: 12%;
  height: auto;
  max-width: none;
  pointer-events: none;
  user-select: none;
}
```

`width: 12%` gives all four assets the same rendered diameter because their PNG
widths are identical. The image height must remain automatic. The current iPad
uses `width: 77%`, so the nominal chip/iPad-width ratio is `12 / 77 ≈ 0.1558`.
That is within roughly 1.1% of the current physical-size design target
`39 / 247.6 ≈ 0.1575`. If Phase 2 changes device geometry, derive one shared
chip diameter from the device width rather than assigning per-colour sizes.

Do not measure physical diameter from `getBoundingClientRect().width` after
rotation; an axis-aligned bounding box becomes wider as the image rotates.

## Responsive orientation mathematics

### Visual rule

The generated stack extends downward from the face. Therefore its intrinsic
local **up** vector points from the underside/crescent through the face. Rotate
the complete PNG so this local-up vector points to the scene centre.

Let:

- `W` and `H` be the scene width and height;
- `(Cx, Cy) = (0.5W, 0.5H)` be the scene centre;
- `(Px, Py)` be the transformed chip centre before rotation;
- `dx = Cx - Px`;
- `dy = Py - Cy`, expressed as positive upward distance for CSS rotation.

Then:

```text
angle = atan2(dx, dy)
```

CSS positive rotation is clockwise, so `atan2(horizontal delta, upward delta)`
maps the asset's local-up vector onto the centre vector.

### Current black-stack derivation

- left edge: `1.45% W`;
- image width: `12% W`, so centre x is `1.45 + 6 = 7.45% W`;
- horizontal delta: `50 - 7.45 = 42.55% W`;
- bottom edge: `5% H`;
- PNG aspect ratio: `292 / 256`;
- `translateY(16.5%)` offsets the complete image downward;
- resulting upward delta to centre: `45% H - 4.5847% W`.

```css
--chip-axis-angle: atan2(42.55cqw, calc(45cqh - 4.5847cqw));
```

### Current green-stack derivation

- centre x: `24.45 + 6 = 30.45% W`;
- horizontal delta: `19.55% W`;
- bottom edge: `17% H`;
- PNG aspect ratio: `284 / 256`;
- `translateY(14%)` offsets the image downward;
- resulting upward delta to centre: `33% H - 4.7925% W`.

```css
--chip-axis-angle: atan2(19.55cqw, calc(33cqh - 4.7925cqw));
```

### Production CSS pattern with fallback

```css
.play-scene {
  height: clamp(26rem, 40vw, 43rem);
  container-type: size;
}

.table-chip--black {
  bottom: 5%;
  left: 1.45%;
  /* Fallback for browsers without CSS trig/container units. */
  transform: translateY(16.5%) rotate(48deg);
  transform: translateY(16.5%) rotate(atan2(42.55cqw, calc(45cqh - 4.5847cqw)));
}

.table-chip--green {
  bottom: 17%;
  left: 24.45%;
  transform: translateY(14%) rotate(36deg);
  transform: translateY(14%) rotate(atan2(19.55cqw, calc(33cqh - 4.7925cqw)));
}
```

The scene needs an explicit height for `cqh` to resolve under size containment.
A `min-height` alone may leave the query container's contained block size
indefinite and make `100cqh` resolve incorrectly.

The first `transform` declaration is an intentional compatibility fallback. A
browser that cannot evaluate `atan2()`, `cqw`, or `cqh` retains the earlier
fixed angle rather than dropping the transform completely.

### Why fixed angles and breakpoint angle tables are rejected

A fixed angle preserves the same screen-space rotation while the scene centre
moves relative to the chip. It therefore stops obeying the perspective rule on
different scene aspect ratios. A breakpoint table merely replaces one visible
error with several discontinuities near the breakpoints.

Container-relative trigonometry provides a continuous result from narrow phone
layouts through ultra-wide desktop layouts. If Phase 2 moves a chip, changes its
image aspect ratio, changes its translate offset, or changes the scene centre,
recalculate the constants; do not copy them blindly.

The red stack remains near the centre line and currently uses a restrained
`-1deg` rotation. The blue chip is a single chip and has no stack-axis contract.

## Phase 2 component boundary

The recommended component API keeps asset choice and scene placement explicit:

```ts
type TableChipColour = "black" | "green" | "red" | "blue";

type TableChipProp = {
  colour: TableChipColour;
  assetUrl: string;
  leftPercent: number;
  bottomPercent: number;
  widthPercent: number; // one shared value for every colour
  rotation: string; // computed CSS expression or approved fixed angle
  translateYPercent: number;
};
```

Do not expose independent `faceScale`, `sideScale`, `shadowScale`, or
`stackDiameter` properties. Those recreate the failure mode that the static PNG
solved. Stack height is selected by the asset, not by stretching the image.

If Phase 2 needs chips in more than one scene:

1. keep one canonical asset map;
2. define placement and orientation per scene;
3. keep one shared diameter variable per scene;
4. verify every scene at its minimum, breakpoint-adjacent, and maximum widths;
5. make a new generated asset only when stack height or colour truly changes.

## Accessibility and performance

- Use `alt=""` and `aria-hidden="true"` because the chips are decorative scene
  props; the poker state must be conveyed by the actual UI, not this marketing
  composition.
- Use `pointer-events: none` so the props cannot block the iPad or phone links.
- Keep intrinsic `width` and `height` metadata or an equivalent `aspect-ratio`
  reservation when the assets are used in normal document flow.
- Use `object-fit: contain` if a frame is introduced. Never use `cover`.
- Do not encode game state, denomination, or private information into these
  decorative chip images.
- Four small PNG requests are acceptable for the static scene. If Phase 2 uses
  the same assets in a frequently repeated component, preload once and reuse the
  decoded image; do not duplicate base64 data in every instance.

## Automated acceptance contract

The current landing test surface is
[`tests/landing/landing.spec.ts`](../../tests/landing/landing.spec.ts).
Phase 2 should retain equivalent checks even if selectors or component names
change.

### Structure and scale

- exactly four decorative chip images;
- no live `.face`, `.side`, or `.shadow` DOM layers;
- every image decodes with `naturalWidth > 0`;
- every image uses a PNG asset from the canonical set;
- equal computed, untransformed width for every colour;
- rendered width remains approximately 12% of the current scene;
- the four positions span more than 1.4 chip widths vertically so the layout
  does not collapse into a rigid row.

### Perspective direction

Test at minimum, breakpoint-adjacent, ordinary desktop, and ultra-wide widths.
The current width set is:

```text
320, 390, 600, 720, 721, 850, 1024, 1051, 1366, 1800, 2048
```

For each stacked chip:

1. read the computed transform into a `DOMMatrix`;
2. project the intrinsic local-up vector as `(-matrix.c, -matrix.d)`;
3. calculate the vector from chip centre to scene centre;
4. calculate cosine similarity;
5. require `cosine >= 0.999`.

This catches an incorrect flip, a stale fixed angle, and a breakpoint direction
jump without relying on fragile pixel screenshots.

### Shadow bounds

Draw each decoded PNG into a canvas and inspect the lowest 3% of pixels. The
accepted shadow contract is:

- non-empty alpha;
- horizontal alpha span greater than 15% and no more than 62% of canvas width;
- maximum alpha greater than 4 and no more than 50 on the 0–255 scale.

This prevents the contact shadow from disappearing or becoming a thick opaque
crescent.

### Browser and visual checks

Run the focused production harness from the repository root:

```bash
pnpm exec playwright test \
  --config apps/landing/playwright.config.ts \
  --project chromium \
  --project mobile-webkit \
  --grep "hero stages|each stacked chip face|all four chips"
```

Also capture at least 1366 px and 2048 px wide renders and compare:

- the black stack points inward in both;
- no stack flips by 180 degrees;
- face, colour, position, and relative size remain unchanged;
- side crescents remain shallow;
- the blue chip remains a single chip;
- no image is cropped by a parent container.

Playwright WebKit is useful cross-engine evidence, but it is not the same as a
physical iPhone or iPad Safari result. Perform a physical-device check before a
Phase 2 release that materially changes the composition or asset pipeline.

### Current evidence limits

Do not overstate what the present automated checks prove:

- equal CSS width proves equal scene-relative diameter, not a fixed number of
  physical screen pixels; every chip still grows or shrinks with the scene;
- the direction test treats the generated asset's intrinsic up axis as the
  underside-to-face centre-line; it does not locate the crescent pixels and fit
  their centres independently;
- the shadow test measures only the lower alpha footprint, not the complete
  optical softness of the shadow;
- current tests do not assert the exact face colours, ring geometry, number of
  side bands, or the asset checksums;
- current browser automation does not replace real iPhone/iPad Safari evidence.

For a Phase 2 implementation that programmatically changes or recolours the
assets, add a generator-configuration contract and approved image snapshots.
Until then, visual review of the four canonical PNGs remains part of acceptance.

## Change checklist

Before accepting a future modification, answer all of these with evidence:

- [ ] Did the owner explicitly approve any change to the four locked positions,
      sizes, colours, or faces?
- [ ] Are all chip diameters still equal before rotation?
- [ ] Are black, green, and red still visually different stack heights?
- [ ] Is blue still one chip?
- [ ] Are side inserts short vertical ivory bands on each layer?
- [ ] Is the side crescent shallow and consistent with a top-down table view?
- [ ] Does every stacked-chip centre-line point to the scene centre at every
      tested width?
- [ ] Are shadows compact, soft, and thinner than a visible side layer?
- [ ] Are assets displayed with their natural aspect ratios and no crop?
- [ ] Did Chromium, Mobile WebKit, and the two-width visual comparison pass?
- [ ] If generator output changed, were the PNGs and snapshot checksums reviewed
      together?
- [ ] Was publication kept behind its separate owner approval gate?

## Source map

| Concern                                      | Canonical current file                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Deterministic PNG generator                  | [`apps/landing/scripts/generate-chip-art.mjs`](../../apps/landing/scripts/generate-chip-art.mjs) |
| Generated assets                             | [`apps/landing/public/product/`](../../apps/landing/public/product/)                             |
| Decorative image markup                      | [`apps/landing/index.html`](../../apps/landing/index.html)                                       |
| Scene geometry and orientation               | [`apps/landing/src/landing.css`](../../apps/landing/src/landing.css)                             |
| Geometry, scale, direction, and shadow tests | [`tests/landing/landing.spec.ts`](../../tests/landing/landing.spec.ts)                           |
| Wider product visual principles              | [`docs/design/SHARED-VISUAL-SYSTEM.md`](SHARED-VISUAL-SYSTEM.md)                                 |
