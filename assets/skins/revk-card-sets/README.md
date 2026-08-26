# RevK card-face sets

This folder contains two complete SVG face sets for the Table-side Mode of Our
Poker Table:

- `classic/faces/`: 52 RevK faces using the traditional red/black palette.
- `four-colour/faces/`: 52 RevK faces using black spades, red hearts, green
  clubs, and blue diamonds.

`AS.svg` in both sets is the Our Poker Table replacement Ace of Spades. It
preserves the owner-approved black centre spade and four gold ornament paths
from `../classic-revk/ace-center-artwork-figma.svg`. The rejected outer dotted
stroke and its white separator are omitted, while the nested SVG viewport is
allowed to overflow so the approved pointed tip is not clipped.

## Source and licence boundary

The 51 unmodified faces in each set were exported from the official RevK deck
generator using the poker size, standard value style, normal pips, and the
public default face colours. The generator source was pinned for provenance at
commit `50477e1537cd6f4ee3503a27b5df6fa1f1944ddf`.

RevK declares the card graphics public domain / CC0 on the official cards
page: <https://www.me.uk/cards/>. This asset folder does not include RevK's
GPL-3.0 generator source. The Our Poker Table branding remains governed by the
project's own brand documentation.

## Integration and review

Open `review/index.html` to compare every face at a consistent physical ratio.
The Table-side build copies both sets into its deployed assets for Tablet/TV shared
cards and phone-private cards. Compact Host Controls and phone-community cards
continue to use the lightweight rank-and-suit renderer. Airplane Mode is
unchanged and does not consume this asset set.
