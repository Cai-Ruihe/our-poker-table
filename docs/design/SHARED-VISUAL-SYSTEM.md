---
id: DESIGN-SHARED-VISUAL-SYSTEM
kind: design-system
status: accepted
owner: Ruihe Cai
accepted_at: 2026-08-16
audience: product, design, frontend, qa
production_integration_authorized: true
implementation_status: integrated
integrated_at: 2026-08-16
update_trigger: owner changes the visual direction, role model, or accessibility baseline
---

# HTML Poker shared visual system

This document is the durable visual reference for HTML Poker. It records the
owner-approved Tablet revision-v6 direction and its production integration as
a shared color, component, and interaction language.

The color system, principles, and role-specific layouts are **Accepted**. The
production implementation is reconciled into M06, the decision register, and
the browser journey suite. Prototype markup remains disposable evidence and is
not a production dependency.

## Product character

HTML Poker should feel like a quiet, well-made object placed on a real poker
table: dark, calm, tactile, and immediately understandable. The interface
supports the conversation around the table instead of competing with it.

The interaction principles may learn from Bold Poker's low-attention physical
table experience, but HTML Poker uses original layouts, assets, and code.

## Product identity

The accepted product-facing name is **Our Poker Table**. The canonical v1
symbol, lockups, palette, clearspace rules, and export inventory are maintained
in the [brand guidelines](brand/README.md) and
[brand asset package](../../assets/brand/README.md). The identity reuses this
system's four-sided corner language, but branding stays subordinate to cards
and play state on the quiet table surface.

The public GitHub repository and GitHub Pages project-site slug are
`our-poker-table`. Internal npm workspace identifiers, the `@html-poker/*`
package namespace, and the established local directory remain
`html-poker-app`; keeping those implementation identifiers stable avoids
unrelated Phase 1 build churn.

## Design principles

### 1. Cards first; chrome later

Cards are the product's primary visual object. During ordinary play, cards
receive most of the space, contrast, and attention. Branding, revision numbers,
connection details, player management, and diagnostics stay out of the quiet
surface unless they are needed.

### 2. Design for the physical table

The Tablet sits in the center of a physical table. Every side is equally
important. Its four corner control callouts have equal size and priority, and
upper-side panels rotate in full so their controls and words face the person
using them. No side is the permanent "right way up."

Phone layouts instead have one reading direction and put frequent actions in
comfortable thumb reach. TV layouts assume distance and low-precision input.

### 3. One visual family, distinct role renderers

Player, Tablet, TV, Public Table, Host Controls, and pairing surfaces use the
same tokens, cards, status vocabulary, and motion language. They do not share
one universal layout. Each renderer exposes only the information and actions
appropriate to its role and capability.

### 4. The 99-percent state is quiet

Minimalism is measured during ordinary play. Rare work—player management,
pairing, recovery, theme selection, correction, and diagnostics—moves into a
second layer. Necessary recovery and accessibility controls are not deleted;
they are placed where their urgency and frequency justify them.

### 5. Prefer words over riddles

Use `Next card`, `Next hand`, `Fold`, `Show cards`, and `Reconnect to table`.
Do not rely on ambiguous labels such as `END` or unexplained lock, pause, or
broken-ring symbols. Icons without labels are reserved for conventions that
are already clear in context, such as Close and the three-dot secondary menu;
they still require accessible names and large targets.

### 6. Consequential actions feel physical

Ordinary reversible actions use a tap. A dangerous or irreversible action uses
a deliberate gesture or confirmation proportional to its consequence. The
Tablet's `Next hand` action uses a short drag that may end a hand before all
community cards are revealed. It must be easy to complete deliberately without
becoming easy to trigger accidentally.

### 7. Recovery is an ordinary path

Phone app switching and browser suspension are expected behavior. Every live
role attempts automatic foreground recovery. If that cannot complete, the UI
shows the saved table and seat, a clear `Reconnect to table` action, and useful
next steps. A temporary disconnect must not masquerade as an expired invitation.

### 8. Privacy is structural, not decorative

A screen renders only its role-filtered projection. Theme switching changes
appearance, never authority. Public surfaces never receive private cards;
host-only controls never appear because a layout happens to have space.

### 9. Dark mode is the base condition

Player phones and the Tablet are designed dark-first for low-light comfort and
reduced visual glare. Cards remain warm ivory so ranks and suits retain familiar
paper-card legibility. Light accessibility overrides may be added later, but a
bright application canvas is not the default table experience.

## Accepted table themes

All three themes use identical geometry, cards, hierarchy, and interaction.
Only semantic color tokens change. The Trusted Host chooses the table theme;
that choice synchronizes to every Player and display so the group feels like it
is playing at one table.

| Token            | Dark Green | Black Gold | Deep Navy | Use                                      |
| ---------------- | ---------- | ---------- | --------- | ---------------------------------------- |
| `felt.deep`      | `#002b23`  | `#010202`  | `#020812` | Viewport edge and deepest gradient       |
| `felt.base`      | `#003f33`  | `#060806`  | `#071a30` | Primary table field                      |
| `felt.light`     | `#0b5948`  | `#171810`  | `#0e3155` | Restrained center halo                   |
| `panel.base`     | `#001f19`  | `#020302`  | `#020a15` | Drawers and modal panels                 |
| `panel.raised`   | `#073d32`  | `#11140f`  | `#0a2948` | Secondary cards and utility controls     |
| `action.primary` | `#0a5746`  | `#211f13`  | `#0e3b63` | Large primary action surface             |
| `accent.primary` | `#d4b86e`  | `#d0ad59`  | `#86a8c8` | Signature thread, focus, key affordances |
| `accent.bright`  | `#e2c77d`  | `#e4c978`  | `#abc6de` | Tactile control highlight                |
| `accent.dark`    | `#bd9c51`  | `#a9863d`  | `#5e7f9e` | Tactile control shadow                   |
| `text.muted`     | `#93aaa0`  | `#aaa38f`  | `#95aabd` | Secondary copy and metadata              |

Shared functional colors:

| Token                | Value        | Use                                  |
| -------------------- | ------------ | ------------------------------------ |
| `card.paper`         | `#f6efe0`    | Warm ivory card body                 |
| `card.ink`           | `#111713`    | Clubs and spades                     |
| `card.red`           | `#b9323b`    | Hearts and diamonds                  |
| `status.dealer`      | theme accent | Dealer token `D`                     |
| `status.small-blind` | `#8ab4ca`    | Small-blind token `SB`               |
| `status.big-blind`   | `#cb8059`    | Big-blind token `BB`                 |
| `status.disconnect`  | `#dc7566`    | Offline slash and recoverable errors |
| `status.good`        | `#78cfb1`    | Connected/healthy state              |

The approved prototype measured ivory primary text against its primary action
surface at 7.44:1 for Dark Green, 14.44:1 for Black Gold, and 10.05:1 for Deep
Navy. Production must re-measure every rendered text/token combination rather
than treating those three measurements as blanket accessibility proof.

## Typography

- **Cards and ceremonial headings:** `Iowan Old Style`, `Palatino Linotype`,
  `Book Antiqua`, Georgia, serif. This gives cards their old-school character.
- **Controls and body copy:** `Avenir Next`, Avenir, `SF Pro Display`,
  `Helvetica Neue`, Arial, sans-serif. This keeps actions plain and legible.
- Use sentence case for actions. Avoid all-caps except short, low-priority
  eyebrow labels and position tokens.
- Numeric game state uses tabular figures where alignment matters.
- Never trade rank, suit, action, or recovery legibility for decorative type.

## Playing cards

The built-in deck presentation is selected by the Trusted Host and synchronizes
to every Table-side Mode role. This is a small core appearance choice, not the
deferred Community Skins package system.

- **Classic** is the default: an original old-school vector treatment with
  court faces for J/Q/K, `10` rather than `T`, near-black clubs/spades, and
  restrained red hearts/diamonds.
- **Four Colour** keeps the same card geometry and modern digital ranks, but
  uses a distinct stable colour for every suit: heart red, diamond blue, club
  green, and spade near-black.

Classic cards use:

- warm ivory paper, not bright white;
- a restrained diagonal/radial paper gradient;
- subtle inner rule and bevel;
- a soft depth shadow that separates the card from dark felt;
- large conventional rank and suit marks;
- mirrored lower indices aligned with the upper indices;
- near-black clubs/spades and restrained red hearts/diamonds.

Cards grow as large as the role and viewport safely allow. Community cards are
the dominant object on Tablet, Public Table, and TV. Private hole cards are the
dominant object on Player phones.

A future Community Skin may replace the complete deck with compact vector assets. The
client must fetch and cache a complete validated deck pack before play; it must
not request individual cards after a deal, because per-card network requests
could reveal the hand or board through metadata. Airplane Mode always includes
a complete built-in fallback deck.

## Shape, depth, and decoration

- Cards use approximately 14px corner radii at Tablet scale, with proportional
  radii on smaller screens.
- Controls use generous rounded rectangles, but avoid generic white capsule
  outlines and decorative table ovals.
- Depth comes from restrained tonal gradients, inner highlights, and soft
  shadows—not glass effects or neon glow.
- The signature panel decoration is one continuous accent thread that passes
  through the full rounded fillet with uniform visual weight. Do not pair it
  with a competing full outline or let it taper at the curve.
- Felt texture is nearly invisible and must never reduce card legibility.

## Controls and interaction

- Minimum touch target: 48 × 48 CSS px; 52px is the approved Tablet utility
  target.
- Primary actions use the entire visible surface as the hit target.
- Focus indicators use the current theme accent and remain visible in every
  theme.
- The Tablet quick layer contains only `Next card`, the short `Next hand`
  slider, three dots, and Close. It closes after a successful action and stays
  open with guidance after failure.
- Rare controls use a centered secondary panel. Theme selection and player
  management never occupy the quick layer.
- Player quiet actions are `Fold` and `Show cards`. `Muck` is removed from the
  ordinary flow; folding covers the user's wish not to continue or reveal.

## Status vocabulary

Quiet public surfaces identify state at the physical seat edge without
persistent player tiles:

| State       | Visual language                             |
| ----------- | ------------------------------------------- |
| Holding     | Two slightly fanned face-down cards         |
| Folded      | The same pair dimmed and crossed            |
| Winner      | The pair with a restrained accent highlight |
| Offline     | Phone outline with a disconnect slash       |
| Sitting out | Empty-chair outline                         |
| Dealer      | Larger `D` token in theme accent            |
| Small blind | Larger `SB` token in cool blue/silver       |
| Big blind   | Larger `BB` token in warm copper            |

Letters remain on dealer/blind tokens so color is never the only carrier of
meaning. Tokens and state glyphs rotate toward their physical side on Tablet.
Names and management details appear only in the management layer.

## Role adaptation matrix

| Surface          | Primary object                            | Persistent information                                             | Secondary layer                                                 | Must not appear                                              |
| ---------------- | ----------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------ |
| Home / Create    | One clear `Create table` path             | Mode, essential host trust, readiness                              | Chip rules, private relay token, display/Airplane entry         | Feature catalogue or technical preflight wall                |
| Trusted Host     | Table health and the next host task       | `Host Controls / My Hand / Table View`, player count, route health | Invitations, displays, player management, recovery, diagnostics | Private hand unless `My Hand` is selected                    |
| Player / My Hand | Two private cards                         | Own name/seat, connection, minimal public board context            | Sit out, replacement/recovery help, accessibility               | Host controls, other private cards, Muck                     |
| Tablet           | Community cards                           | Quiet seat-edge state and D/SB/BB                                  | Four equal corner quick panels; centered management             | Header, `Board` label, table oval, persistent player tiles   |
| Public Table     | Community cards                           | Quiet public state and D/SB/BB                                     | Connection/recovery; Tablet switch only with Table-Control      | Dealer controls without authority; private cards             |
| TV               | Distance-readable community cards         | Essential phase and public state only                              | Remote-friendly pairing/recovery                                | Small controls, touch-dependent gestures, private cards      |
| Join             | Display name and one Join action          | Invitation/table identity and privacy statement                    | Replacement/help only after failure                             | Host token, relay internals, technical route language        |
| Recovery         | Saved table/seat and `Reconnect to table` | Calm connection progress and last known identity                   | Replace-device guidance after bounded retry                     | Immediate dead-table conclusion from one timeout             |
| Airplane Pairing | In-page QR scanner or answer QR           | `No internet` and current pairing step                             | Manual restart/cancel and camera help                           | Ordinary phone-camera instructions or URL assumptions        |
| Developer        | Evidence and diagnostics                  | Nothing in ordinary play                                           | Explicit Developer Mode only                                    | Hand IDs, revisions, logs, or stack traces on quiet surfaces |

### Same-device host navigation

A phone or iPad may hold Trusted Host authority and an ordinary Player
credential at the same time. One foreground document offers:

1. **Host Controls** — authority and operations;
2. **My Hand** — the credential-filtered Player renderer;
3. **Table View** — the card-blind public renderer once the table starts.

Switching views changes presentation, not authority. The Host surface provides
a direct `Join my own table` action before the Player credential exists.

## Motion and feedback

- Ordinary transitions should generally complete in 120–240ms.
- Use motion to explain state or origin, not to decorate idle play.
- Successful quick actions close their panel after host acknowledgement.
- A failed action remains visible and states what is safe to do next.
- Respect `prefers-reduced-motion`; every workflow must remain understandable
  with transitions removed.
- Haptics may supplement a successful deliberate action where browsers support
  it, but must never be required feedback.

## Accessibility baseline

- Body text targets WCAG AA contrast (4.5:1); large text and non-text controls
  are measured separately under their applicable criteria.
- All icon-only controls have accessible names.
- State never relies on color alone.
- Text scaling must not cover cards or remove the only recovery action.
- TV content remains legible at room distance; phone actions remain reachable
  with one hand; Tablet actions remain reachable from every physical side.
- Private headphone card reading may be offered as an explicit Player-only
  accessibility action. It is never spoken automatically through a public
  speaker.

## Rejected visual patterns

Do not reintroduce these without a material new reason and owner review:

- permanent `Board` headings or `n / 5 cards` counters;
- white table ovals, full decorative outlines, or generic dashboard chrome;
- persistent player cards on quiet public views;
- a preferred reading side on a shared Tablet;
- ambiguous `END`, lock, pause-bar, or broken-ring symbols;
- tiny targets, long drag distances, or unexplained icons;
- detached or hairline accent curves;
- bright white application canvases as the normal play condition;
- independent per-device table colors during a shared session.

## Evidence status and gates

### Fact

- Ruihe approved the Tablet revision-v6 UI/UX direction and the three-theme
  system on 2026-08-16.
- Ruihe approved the complete cross-mode direction and authorized production
  implementation on 2026-08-16.
- The approval prototype browser-rendered without overflow at 1366 × 1024 and
  demonstrated equal upper/lower control geometry.
- HTML Poker's PRDs define distinct Player, Tablet, TV, Public Table, and Host
  experiences over role-filtered projections.
- The production renderer now uses the shared theme, dimensional card,
  quiet-status, four-corner Tablet, compact Host, and phone Player patterns.
- Contract and Chromium/Mobile WebKit journeys verify theme persistence and
  synchronization, private/public projection boundaries, touch-target access,
  four equal Tablet corners, upper-facing controls, and action auto-dismiss.

### Inference still requiring field validation

- The production phone and TV density will remain comfortable across the full
  physical-device matrix and at real viewing distance.
- First-time groups will understand the quiet player-status glyphs without
  coaching.

### Unknown until tested

- Exact safe-area behavior, text scaling, glare, battery impact, and one-hand
  reach across supported iPhones, Android phones, and iPads.
- Whether first-time users immediately understand every quiet status glyph.
- Whether the proposed recovery timing is robust under actual iOS background
  suspension and the deployed relay paths.

Before a versioned release claim, complete the physical table/device matrix,
safe-area and large-text checks, glare/battery observation, and real iOS
background/recovery validation. Automated browser evidence is necessary but
does not close those field gates.
