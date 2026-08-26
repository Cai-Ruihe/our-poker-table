# Our Poker Table brand assets

This directory is the canonical, version-controlled **Our Poker Table** brand
asset package. It contains reusable exports for product, web, app-icon, social,
print, and documentation use without adding the full package to every runtime
build.

![Our Poker Table light-surface lockup](svg/horizontal-light.svg)

![Our Poker Table green-surface lockup](svg/horizontal-green.svg)

## Start here

| Scenario | Preferred asset |
| --- | --- |
| Light surface | [`svg/horizontal-light.svg`](svg/horizontal-light.svg) |
| Brand-green surface | [`svg/horizontal-green.svg`](svg/horizontal-green.svg) |
| Primary app icon | [`svg/app-icon-primary.svg`](svg/app-icon-primary.svg) |
| PWA maskable icon | [`web/pwa-maskable-512.png`](web/pwa-maskable-512.png) |
| Favicon | [`web/favicon.ico`](web/favicon.ico) or [`web/favicon.svg`](web/favicon.svg) |
| Social avatar | [`png/social/avatar-green-1024.png`](png/social/avatar-green-1024.png) |
| Social sharing card | [`png/social/open-graph-green-1200x630.png`](png/social/open-graph-green-1200x630.png) |
| Implementation values | [`brand-tokens.json`](brand-tokens.json) |

Use the symbol alone below the documented lockup minimums. The complete rules,
clearspace, contrast, and misuse guidance are in the
[brand guidelines](../../docs/design/brand/README.md).

## Package structure

- `svg/` — symbols, app icons, favicon, watermark, and horizontal/stacked
  lockups. The symbol geometry is true vector artwork.
- `png/symbol/` — green, gold, ink, and white symbols at 32–1024 px.
- `png/app-icons/` — light, primary, and maskable app-icon exports.
- `png/lockups/` — native and minimum-size horizontal/stacked exports.
- `png/social/` — avatar and 1200 × 630 Open Graph exports.
- `web/` — favicon, Apple touch, PWA, and example web-manifest files.
- `source/wordmark/` — the preserved approved raster wordmark sources and exact
  color variants.
- `asset-manifest.json` — SHA-256, byte-size, and, where applicable,
  image-dimension inventory.

## Runtime integration boundary

These canonical files are not automatically copied into the application. Add
only the chosen runtime assets to `apps/web/public/` or import them from source
when the product integration is separately authorized. This prevents unused
marketing and high-resolution files from increasing every Table-side and Airplane
build.

## Source limitation

The symbol is vector. The approved wordmark was supplied as raster artwork, so
the lockup SVGs embed lossless PNG data instead of claiming a vector outline.
Keep the horizontal lockup at or below its 478 px intrinsic width for
pixel-faithful screen output. Obtain an original vector wordmark or an approved
font-and-spacing specification before large-format print use.

## Verification

From the repository root:

```sh
node tools/branding/verify-brand-assets.mjs
```

Run the same command with `--write` only when intentionally regenerating the
manifest after an approved asset change.

## Licensing and rights

Project-owned files in this package are available under the repository's
[Apache License 2.0](../../LICENSE). The license does not itself grant trademark
rights. See [rights and licensing](../../docs/design/brand/RIGHTS-AND-LICENSING.md)
for the exact boundary and unresolved clearance questions.
