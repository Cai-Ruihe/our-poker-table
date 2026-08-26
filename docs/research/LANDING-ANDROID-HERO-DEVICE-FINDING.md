# Landing hero Android device finding

_Retrieved 2026-08-26. This evidence supports the implemented landing-device
reference; it is not a product-runtime dependency._

## Recommendation

Use the **Samsung Galaxy A16 5G** as the far-side Android reference. Samsung's
official materials document a 6.7-inch display, a 164.4 × 77.9 × 7.9 mm body,
and a front-camera opening. The official product render shows a centered
teardrop/waterdrop opening and a larger bottom chin, giving the front a clear
Android silhouette distinct from an iPhone Dynamic Island. Sources: [Samsung
Newsroom specification table](https://news.samsung.com/br/samsung-apresenta-galaxy-a16-e-a16-5g-no-brasil-com-ate-seis-atualizacoes-de-sistema-android-e-seguranca),
[Samsung product specifications](https://www.samsung.com/uk/smartphones/galaxy-a/galaxy-a16-5g-blue-black-128gb-sm-a166bzkdeub/).

## Sales evidence

Counterpoint ranked the Galaxy A16 5G fifth globally in Q1 2025, with 17%
year-over-year growth, and identified it as the best-selling Android phone in
Q3 2025. This is independent sell-through research, not a Samsung claim:
[Counterpoint Q1 2025](https://counterpointresearch.com/en/insights/top-10-bestselling-smartphones-q1-2025),
[Counterpoint Q3 2025](https://counterpointresearch.com/en/insights/top-10-best-selling-smartphones-q3-2025).

## Screenshot-state finding

**Fact:** the prior far-phone asset had a different public-card rail from the
iPad. The landing now uses `hero-player-android-public-board.png`, recaptured
from the same live journey as `hero-shared-board-ipad.png`. The capture test
asserts all five `data-card` identities match before writing either image.

**Implemented state:** the far phone uses the A16 reference geometry and stays
rotated 180 degrees, genuinely cut by the hero edge. Its current view shows the
same public rail while keeping that player's private cards protected.

**Inference:** the waterdrop opening, larger bottom chin, and squarer corners
are the highest-value A16 silhouette cues. If a future edge crop hides them,
reduce the crop slightly instead of adding decorative camera hardware not
present in the source render.

**Unknown:** regional A16 5G variants differ in bands, memory, and finish; this
does not change the front silhouette or the cited body geometry.
