# Landing product renders

These assets are synthetic browser screenshots rendered from the current product
code on 2026-08-26. They are not photographs, stock imagery, or captures of a
physical table.

The hero pair is captured from one current-code table journey. Before capture,
the journey asserts that the shared table and player phone have the same five
public-card identities; the phone then reveals its own private cards locally.

| Asset                  | Current-code render state                                                                                                  | Viewport    | SHA-256                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| `home-start.webp`      | Product home with all Trusted Host capability checks ready and the Create table action visible                             | 1366 x 1024 | `61dfb98dc54d1c8f5e53e7c16cd5be526b9f223c50d20347a01413d550252f63` |
| `host-lobby.webp`      | Trusted Host lobby with Alice and Bob seated, the complete one-use QR invitation, and the table map visible                | 1366 x 1200 | `eee181600a8f60ba3784cad462767fb30bda899ad655de76413ffa335996576c` |
| `shared-board.webp`    | Dark Green Table View after flop, turn, and river; two seats; no unrevealed private cards                                  | 1366 x 1024 | `9cc0965b31794bab4afb8f0b128a3fd5d409f6487b538d70566fbf571633aaf0` |
| `player-private.webp`  | Player phone immediately after the first deal; private cards covered behind the deliberate reveal control                  | 393 x 852   | `4ad53eb261148e2145c8283ac61cd1ec8588932b947d2540eea0a0adca8ec428` |
| `player-revealed.webp` | The same Player phone after the local-only private reveal; public show remains a separate guarded action                   | 393 x 852   | `54e8d4213f536c5e9b82fae9f472c5791faaf71bd34b87403aff677c37dbbcab` |
| `host-controls.webp`   | The same Dark Green Table View with lower-right dealer controls open                                                       | 1366 x 1024 | `3e664b4f14610137f71d1936ca4460e9ebfdc81138441aa74f6231c6fabb8a29` |
| `table-showdown.webp`  | Shared Table View after both players choose to show; public private cards and the best available five-card hand are marked | 1366 x 1024 | `24c2cb9b40c4e78abc73ec1e75992b80246e1c76a27c5a0aea0d526659bd2dca` |
| `hero-shared-board-ipad.png` | Current shared Table View at the 11-inch iPad Air display ratio, paired with both player views in the hero | 1238 x 860 | `9a5cab4ebb15bf7efc04e2cba9162c745deb96d7ccae3bdaa19093b184d299c1` |
| `hero-player-android-public-board.png` | Current far-player view of that exact hand: public cards are visible while private cards remain protected | 393 x 852 | `caf187622baa02ccf5454e64ddfb5036d4032eff613af76dee7a0576067c71ba` |
| `hero-player-private-board.png` | Current Player View of that exact hand after this player privately reveals their cards; the same five public cards remain visible | 393 x 852 | `b81956650b451fdb01aae9df5caa2b5c891191bf883e148361f73c91c03a4b42` |
| `hero-player-board-public.png` | Earlier public-player capture retained as a source reference; it is not used by the landing page | 393 x 852 | `842ed239b431b86c09f1b190dc8fe33a28a1aa38d059a1128c5edbec7bc38b29` |

The exact current-code states were also rechecked through:

- `PLAYER-PHONE-HAND-LAYOUT-001: Table-side Player hand fits real phone widths without a visible title`
- `Tablet quiet and quick-control states conform to approved geometry`

Both focused Chromium journeys passed immediately before the first capture.
The expanded seven-image narrative set was then rendered again from the same
current product build through the equivalent deterministic journey: Home,
two-player Host Lobby, first deal, local private reveal, full board, Trusted
Host controls, and two-player showdown.
