# Open vector playing-card asset survey

**Status:** adopted for Table-side Mode. The reviewed RevK-derived Classic and Four
Colour face sets are vendored under `assets/skins/revk-card-sets/` and copied
into the Table-side release artifact; the product has no runtime dependency on the
upstream site. Airplane Mode does not consume these assets.

## Purpose

Identify a complete SVG deck that can serve as the future **Classic** card skin
for Our Poker Table. The product requires legible traditional red/black cards,
proper court faces for Jack, Queen, and King, and reuse terms that work for an
Apache-2.0 open-source project.

## Shortlist

| Candidate                                                                                   | What it provides                                                                                                                                           | Declared license                                                                                                      | Fit                                                                                                                                              | Caution                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [RevK / Adrian Kennard](https://www.me.uk/cards/)                                           | Author-originated SVG sets: standard, old-style, double-index, symmetric, and four-colour variants; courts are based on 19th-century Goodall & Son designs | [CC0 / public domain](https://www.me.uk/cards/)                                                                       | **Best original source.** It directly covers both the desired Classic deck and a four-colour option.                                             | Vendor and pin the selected source revision; do not depend on the site at runtime. Preserve its provenance even though attribution is not required.                                      |
| [OpenDecks](https://github.com/AustinGabriel/OpenDecks-Public-Domain-and-CC0-Playing-Cards) | 54 SVG/PNG cards, including ornate court faces and two backs                                                                                               | [CC0 1.0](https://raw.githubusercontent.com/AustinGabriel/OpenDecks-Public-Domain-and-CC0-Playing-Cards/main/LICENSE) | **Best starting candidate.** CC0 permits reuse, modification, and commercial use without a downstream attribution obligation.                    | The repository is a recent community project; before adoption, preserve its provenance table and independently inspect all 54 SVGs. Do not use the `OpenDecks` name as product branding. |
| [Saul Spatz / SVGCards](https://github.com/saulspatz/SVGCards)                              | Individual SVGs and sprites in two-colour, four-colour, and higher-contrast accessible variants                                                            | [Public domain declaration in the README](https://github.com/saulspatz/SVGCards)                                      | Strong option for a distinct Four Colour skin: it is deliberately built around readable jumbo indices and has an Accessible four-colour variant. | It has no standalone SPDX license file; retain the public-domain statement and upstream-art provenance. Its court art comes from upstream public-domain sources.                         |
| [letele/playing-cards](https://github.com/letele/playing-cards)                             | A complete CC0 deck exposed as React SVG components; standard ranks, courts, backs, and jokers                                                             | [CC0 1.0](https://raw.githubusercontent.com/letele/playing-cards/main/LICENSE)                                        | Good source if the visual style matches, especially for direct SVG extraction.                                                                   | It is a React package rather than an asset-only deck. We would extract only the SVG source and record its upstream attribution/provenance.                                               |
| [Webisso/playing-cards](https://github.com/Webisso/playing-cards)                           | 54 SVG/PNG cards, plus a JSON map and direct asset URLs                                                                                                    | [MIT](https://raw.githubusercontent.com/Webisso/playing-cards/main/LICENSE)                                           | Good modern alternative; MIT is compatible with Apache-2.0 distribution.                                                                         | If bundled, retain the MIT copyright and license notice in the third-party notices file. Visual court-face quality still needs design review.                                            |
| [Block52/cards](https://github.com/block52/cards)                                           | 52 named SVG cards plus backs, chip, and dealer assets for poker UIs                                                                                       | [MIT, declared in its repository README](https://github.com/block52/cards)                                            | Useful comparison set, particularly for poker UI proportions.                                                                                    | Keep the copyright/license notice. Do not hotlink a third-party CDN in the product; vendor reviewed assets instead.                                                                      |
| [bedardjo/playing_cards](https://github.com/bedardjo/playing_cards)                         | Apache-2.0 Flutter package with card imagery and configurable rendering                                                                                    | [Apache-2.0, declared in its repository](https://github.com/bedardjo/playing_cards)                                   | Legally compatible reference and possible source of individual imagery.                                                                          | It is a Flutter package, not an asset-only web deck. Its contents and every upstream asset notice need inspection before extraction.                                                     |

## Recommendation

1. **Design-review RevK first**, then compare the packaged OpenDecks derivative.
   RevK is the author-originated CC0 source and offers both Classic and
   four-colour variants; OpenDecks offers a convenient 54-card package with a
   documented court-style presentation.
2. Compare those two visually against **Saul Spatz SVGCards** and **Webisso** with a small local
   prototype containing 10, J, Q, K, and A in all four suits.
3. Only after visual approval, vendor the selected SVGs into a named
   `third_party` asset directory, preserve the upstream license/provenance, add
   a notice, and test the Classic/Four Colour appearance switch. Do not load
   card faces from a remote CDN: Table-side Mode should remain usable when the
   internet is unavailable after the app loads.

## License boundary

### Facts

- CC0’s text waives copyright and related rights as far as legally possible and
  states that the work may be reused for commercial purposes. The license does
  **not** waive trademark or patent rights.
- MIT permits use, modification, distribution, sublicensing, and sale, but
  requires the copyright and permission notice to accompany substantial copies.
- Apache-2.0 is the repository license for Our Poker Table. CC0 and MIT assets
  can be included in an Apache-2.0 codebase when their respective notices are
  preserved where required.

### Inference

RevK is the strongest candidate because it is the primary creator’s own CC0
deck, states that it contains both classic and four-colour variants, and offers
traditional court artwork. OpenDecks is the best packaged fallback.

### Unknowns before adoption

- Whether its exact court illustration aesthetic meets the product’s visual
  standard on an iPad and Android phone.
- Whether every SVG is compact enough for the Table-side Mode bundle and whether
  selective loading is needed.
- Whether every upstream-provenance statement holds on inspection; this survey
  relies on the repositories’ own license declarations and is not legal advice.

## Sources checked

- [OpenDecks repository and asset/provenance statement](https://github.com/AustinGabriel/OpenDecks-Public-Domain-and-CC0-Playing-Cards)
- [OpenDecks CC0 license text](https://raw.githubusercontent.com/AustinGabriel/OpenDecks-Public-Domain-and-CC0-Playing-Cards/main/LICENSE)
- [RevK playing-card sets and CC0 declaration](https://www.me.uk/cards/)
- [Saul Spatz SVGCards repository and public-domain declaration](https://github.com/saulspatz/SVGCards)
- [letele playing-cards repository](https://github.com/letele/playing-cards)
- [letele CC0 license text](https://raw.githubusercontent.com/letele/playing-cards/main/LICENSE)
- [Webisso deck repository](https://github.com/Webisso/playing-cards)
- [Webisso MIT license text](https://raw.githubusercontent.com/Webisso/playing-cards/main/LICENSE)
- [Block52 cards repository](https://github.com/block52/cards)
- [bedardjo playing_cards repository](https://github.com/bedardjo/playing_cards)
