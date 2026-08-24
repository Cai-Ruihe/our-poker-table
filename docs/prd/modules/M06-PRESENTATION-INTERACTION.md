---
id: PRD-M06
kind: module
status: current
last_reconciled: 2026-08-24
decision_ids:
  - BRAND-IDENTITY-V1
  - PHASE1-TABLE-SIZE
  - NET-DISPLAY-REVERSE-QR
  - MODE-SEPARATION
  - MODE-TABLE-CONTROL
  - MODE-HOST-DEVICE-SWITCH
  - SEAT-AUTO-AND-DRAG
  - DEALER-RELOCATION
  - FOLD-UNDO
  - FOLD-SIT-OUT
  - RECOVERY-FOREGROUND-AUTO
  - SHOW-IRREVERSIBLE
  - HAND-END-EXPLICIT
  - UI-MINIMAL-RUNNING
  - UI-AESTHETIC
  - UI-BUTTON-ARRANGEMENT
  - UI-THEME-SYNC
  - UI-CARD-RENDERING
  - UI-QUIET-STATUS
  - UI-QUIET-STATUS-FACING
  - UI-SHOWDOWN-STABILITY
  - UI-FULLSCREEN-EDGE
  - UI-SYSTEM-APPEARANCE
  - UI-IOS-ICON-CACHE
  - UI-DARK-FIRST
  - REMOTE-PUBLIC-TABLE-P2
  - TEST-TV-BROWSERS
router: ../manifest.yaml
---

# M06 — Presentation and Interaction

## Context capsule

This module renders role-filtered projections as distinct Player, Tablet, TV, Public Table, and Developer experiences. Its interface receives a projection plus allowed intents and emits user intent—not state mutation. The ordinary game must remain classic, elegant, and low-attention; rare administration lives off the main surface.

## Problem Statement

Phones, touch tablets, and distant TVs have different information density and input needs. Combining them into one responsive screen risks tiny TV controls, cluttered phones, accidental dealer actions, and leaked private cards. Poker also needs deliberate physical gestures that do not rush table conversation.

## Solution and Interface

Each mode has its own renderer over a shared semantic design system. Renderers consume only their allowed projection and emit typed intents through a Seat or Table-Control capability. Mode switching changes presentation, never authority.

### Owns

- Player, Tablet, TV, Public Table, and Developer layouts.
- Peek/fold/undo/show/local flip-down interactions and feedback.
- Board reveal, guarded End Hand, seat positioning, dealer relocation UI, and controller roster/revocation UI.
- Classic/elegant default theme, responsive typography, accessibility, and safe skin token consumption.

### Does not own

- Hidden-card filtering ([M02](M02-CARD-CUSTODY-PRIVACY.md)).
- Capability issuance ([M03](M03-IDENTITY-SEATS-CAPABILITIES.md)).
- Command legality ([M01](M01-GAME-CORE.md)).
- Skin package validation ([M11](M11-COMMUNITY-SKINS.md)).

## User Stories

1. As a player, I want a deliberate private reveal that covers itself whenever the page is hidden.
2. As a player, I want a simple fold gesture and a visible five-second undo when still safe.
3. As a player, I want full Show to be deliberate and irreversible, while local flip-down tidies my phone.
4. As a group, we want shown cards to remain on the Public Table until next hand.
5. As a tablet dealer, I want board and dealer controls available without a cluttered permanent toolbar.
6. As a TV viewer, I want distance-readable public information and optional non-touch navigation.
7. As a host, I want auto seat layout plus drag-to-match physical seating during play.
8. As a dealer, I want a separate administration route for logical dealer relocation.
9. As a group, we want End Hand to wait for an explicit guarded action even after all-fold.
10. As an accessibility user, I want semantic labels, high contrast, large ranks, reduced motion, and private headphone card reading where supported.
11. As a device owner, I want role-appropriate Table, TV, and Host switching plus a Normal Mode pairing QR.

## Implementation Decisions

- A Public Table can visually switch to Tablet Mode only when the device already holds/redeems Table-Control.
- A Trusted Host device keeps one active document and offers Host Controls, My Hand only after an ordinary Player credential is present, and Table View only after the table starts. Each view renders its own projection; opening a background host/player tab is not the primary interaction.
- Host, Player, Tablet, TV, and Public Table runtimes attempt authenticated projection/relay recovery when the browser returns on `pageshow`, visible `visibilitychange`, or `online`. iOS may suspend JavaScript while backgrounded; dependent screens wait, then catch up from the host projection after foreground return. A visible `Reconnect to table` action remains available when automatic recovery fails.
- An unpaired Normal Mode TV/Public display may render its ephemeral reverse-pairing QR and plain-language status; it receives no table projection until an authorized scanner completes pairing.
- Player private reveal and irreversible public Show remain separate actions. Hiding cards locally or backgrounding the page never reverses a public Show.
- The Tablet quiet surface gives all four physical sides equal, orientation-correct corner entry points. Its quick panel contains a large Next card action beside a short horizontal Next hand slider and closes after an acknowledged action.
- Theme, player, recovery, diagnostics, and device controls use a centered layer. Normal tablet controls start This device/Appearance, then Displays/Players.
- Dark Green, Black Gold, and Deep Navy share identical geometry and synchronize to every role-filtered projection. Device-local accessibility overrides remain local.
- Cards use the built-in warm-ivory old-school renderer with dimensional shading. Future skins may replace assets only as complete validated packs; Airplane Mode always retains the built-in fallback.
- Quiet Tablet, TV, and Public Table surfaces omit the application header, Board label/counter, table oval, permanent player tiles, and dealer toolbar. They retain low-key seat state plus distinct D, SB, and BB tokens.
- A quiet status glyph follows the physical seat it describes; it does not counter-rotate to the screen and cannot become an unexplained perpendicular-card indicator.
- A revealed showdown hand is an emphasis state, not a layout mode: the community board keeps the quiet-mode box, side hands remain on their own physical edge, and the explanatory line sits directly below the board.
- Tablet/TV panels remain edge-flush. Any Safari native-exit protection is permitted only while real iPad page fullscreen is active and only at the field-observed system-control corner; it must not add a permanent clearance gap.
- Browser/OS color preference cannot recolor the selected table palette or warm cards. The synchronized host-selected theme is the product appearance authority.
- The product-facing name is **Our Poker Table**. Brand asset version 1.0 uses the approved four-rotation corner-and-dot symbol, Brand Green on light surfaces, and UI Gold on Brand Green; repository and package identifiers remain unchanged until a separately authorized migration.
- Fold is provisional until its safe boundary. Show has no secrecy undo.
- Normal Player has one compact seat/role/state row, no connection or **Your cards** heading, and a disabled-until-needed Reconnect. Private cards follow it without a blank band. **See your table position** and **Reconnect to table** share a centered utility row below the community-card rail, with equal upper/lower divider gaps, never the topbar; the former opens the private map and the latter enables only for recovery.
- A completed Normal Player Show slide reveals; a short tap or duplicate confirmation does not. Its 13.2rem rail gives the one-line action label side clearance.
- Normal Player Leave is a top-right pop-out with the approved Sit out copy/switch, divider, and red endpoint slider before permanent-leave confirmation. It shares Show's custom handle, drag, and arrow; is 84% of drawer width; is centered; and carries its action only inside the rail. It has a smaller close circle/X. The state-card outline is vertically centered against its text and the Leave glyph horizontally centered. Airplane retains its separate implementation.
- Visual seat movement never changes logical action/dealer/blind order.
- The default style uses original assets and interaction principles inspired by Bold Poker, not copied layouts/artwork.
- Host-selected appearance cannot disable device-local accessibility overrides.
- Names, logs, skin labels, and messages render as text, never executable markup.

## Testing Decisions

Use rendered user journeys and browser/device tests for recovery, private-card isolation, Show and Leave safeguards, phone geometry, Tablet/TV input, ten seats, long names, accessibility, and offline fallback.

## Out of Scope

One universal layout, chat/social feed, casino animation overload, skin code execution, UI-granted authority, and final Phase 2 accounting controls before its PRD gate.

## Further Notes

Minimalism is evaluated on the 99-percent in-hand surface, not by deleting necessary recovery, correction, security, or accessibility actions from their appropriate secondary surfaces.
