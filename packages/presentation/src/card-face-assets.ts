import type { Card } from "@html-poker/card-custody";
import type { CardStyle } from "@html-poker/game-core";

/**
 * Table-side Mode face assets are copied into the web app's public assets folder
 * by the Table-side release build. Keeping this a URL contract (rather than a
 * module glob) is intentional: the standalone Airplane build must not bundle
 * the 104 full SVG faces.
 */
export function cardFaceSrc(cardStyle: CardStyle, card: Card): string {
  const deck = cardStyle === "four-colour" ? "four-colour" : "classic";
  return `./assets/skins/revk-card-sets/${deck}/faces/${card.toUpperCase()}.svg`;
}
