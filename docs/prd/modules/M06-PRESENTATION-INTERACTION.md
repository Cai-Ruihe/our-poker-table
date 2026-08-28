---
id: PRD-M06
kind: module
status: current
last_reconciled: 2026-08-28
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
  - UI-TABLET-EDGE-GEOMETRY
  - UI-LOCALIZATION
  - UI-SYSTEM-APPEARANCE
  - UI-IOS-ICON-CACHE
  - UI-DARK-FIRST
  - REMOTE-PUBLIC-TABLE-P2
  - TEST-TV-BROWSERS
router: ../manifest.yaml
---

# M06 — Presentation and Interaction

## Context capsule

This module renders role-filtered Player, Tablet, TV, Public Table, and Developer projections. It emits intent, never state mutation. Ordinary play stays classic, elegant, and low-attention; rare administration lives off-surface.

## Problem Statement

Phones, tablets, and TVs need different density. One responsive screen risks tiny controls, clutter, accidental dealer actions, and leaked cards. Poker needs deliberate gestures.

## Solution and Interface

Each mode has a renderer over a shared semantic design system. Renderers consume only their allowed projection and emit typed intents through a Seat or Table-Control capability. Mode switching changes presentation, never authority.

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

1. As a player, I want a deliberate private reveal that covers itself when hidden.
2. As a player, I want fold and a five-second undo while safe.
3. As a player, I want deliberate irreversible Show and local flip-down.
4. As a group, we want shown cards public until next hand.
5. As a tablet dealer, I want board/dealer controls without permanent clutter.
6. As a TV viewer, I want distance-readable public information and optional navigation.
7. As a host, I want auto and drag-to-physical seat layout.
8. As a dealer, I want separate logical dealer relocation.
9. As a group, we want guarded End Hand even after all-fold.
10. As an accessibility user, I want semantic labels, contrast, large ranks, reduced motion, and supported private audio reading.
11. As a device owner, I want role-appropriate Table/TV/Host switching and a Table-side pairing QR.

## Implementation Decisions

- A Public Table can visually switch to Tablet Mode only when the device already holds/redeems Table-Control.
- A Trusted Host device keeps one active document and offers Host Controls, My Hand only after an ordinary Player credential is present, and Table View only after the table starts. Each view renders its own projection; opening a background host/player tab is not the primary interaction.
- Host, Player, Tablet, TV, and Public Table runtimes attempt authenticated projection/relay recovery when the browser returns on `pageshow`, visible `visibilitychange`, or `online`. iOS may suspend JavaScript while backgrounded; dependent screens wait, then catch up from the host projection after foreground return. A visible `Reconnect to table` action remains available when automatic recovery fails.
- An unpaired Table-side Mode TV/Public display may render its ephemeral reverse-pairing QR and plain-language status; it receives no table projection until an authorized scanner completes pairing.
- Player private reveal and irreversible public Show remain separate actions. Hiding cards locally or backgrounding the page never reverses a public Show.
- The Tablet quiet surface gives all four physical sides equal, orientation-correct corner entry points. Its quick panel contains a large Next card action beside a short horizontal Next hand slider and closes after an acknowledged action.
- Theme, player, recovery, diagnostics, and device controls use a centered layer. Tablet controls start This device/Appearance, then Displays/Players.
- Dark Green, Black Gold, and Deep Navy share identical geometry and synchronize to every role-filtered projection. Device-local accessibility overrides remain local.
- Cards use the built-in warm-ivory old-school renderer with dimensional shading. Future skins may replace assets only as complete validated packs; Airplane Mode always retains the built-in fallback.
- Quiet Tablet, TV, and Public Table surfaces omit the application header, Board label/counter, table oval, permanent player tiles, and dealer toolbar. They retain low-key seat state plus distinct D, SB, and BB tokens.
- A quiet status glyph follows the physical seat it describes; it does not counter-rotate to the screen and cannot become an unexplained perpendicular-card indicator.
- A revealed showdown hand is an emphasis state, not a layout mode: the community board keeps the quiet-mode box, side hands remain on their own physical edge, and the explanatory line sits directly below the board.
- Tablet/TV panels remain edge-flush. Any Safari native-exit protection is permitted only while real iPad page fullscreen is active and only at the field-observed system-control corner; it must not add a permanent clearance gap.
- Tablet launchers align to visual-viewport safe edges in fullscreen and browser chrome. Their four L-and-dot marks share one geometric center; bottom-seat markers align to usable bottom, and shown hands clear the board at iPad sizes.
- UI copy supports natural English and Simplified Chinese. The create-table screen makes EN/中文 prominent; Host language defaults new invitees while devices retain local overrides. Quiet surfaces keep the choice in a secondary menu.
- Browser/OS color preference cannot recolor the selected table palette or warm cards. The synchronized host-selected theme is the product appearance authority.
- **Our Poker Table** uses the approved four-rotation corner-and-dot mark, Brand Green on light surfaces, and UI Gold on Brand Green; repository/package names need separate migration authority.
- Fold is provisional until its safe boundary. Show has no secrecy undo.
- Table-side Player has one compact seat/role/state row, no connection or **Your cards** heading, and a disabled-until-needed Reconnect. Private cards follow it without a blank band. **See your table position** and **Reconnect to table** share a centered utility row below the community-card rail, with equal upper/lower divider gaps, never the topbar; the former opens the private map and the latter enables only for recovery.
- Once a player initiates a required reconnect, its control immediately says **Reconnecting…**, is disabled against repeat input, and keeps that acknowledgement through a brief projection refresh. This does not change the three-miss Host-liveness policy.
- A folded seat keeps the familiar two-card glyph and adds a high-contrast red diagonal; it is not represented solely by faint grey styling.
- A completed Table-side Player Show slide reveals; a short tap or duplicate confirmation does not. Its 13.2rem rail gives the one-line action label side clearance.
- Table-side Player Leave is a top-right pop-out with the approved Sit out copy/switch, divider, and red endpoint slider before permanent-leave confirmation. It shares Show's custom handle, drag, and arrow; is 84% of drawer width; is centered; and carries its action only inside the rail. It has a smaller close circle/X. The state-card outline is vertically centered against its text and the Leave glyph horizontally centered. Airplane retains its separate implementation.
- Visual seat movement never changes logical action/dealer/blind order.
- The default style uses original assets and interaction principles inspired by Bold Poker, not copied layouts/artwork.
- Host-selected appearance cannot disable device-local accessibility overrides.
- Names, logs, skin labels, and messages render as text, never executable markup.

## Testing Decisions

Use rendered journeys and browser/device tests for recovery, card isolation, Show/Leave safeguards, phone geometry, Tablet/TV input, ten seats, names, accessibility, and offline fallback. At iPad viewports, verify viewport-aligned launchers, glyph centers, bottom seats, and hand/board separation. Verify English/Chinese on Host creation, invited Player, Tablet/TV menus, user-facing runtime failures, and Airplane without changing offline transport.

## Out of Scope

One universal layout, chat/social feed, casino animation overload, skin code execution, UI-granted authority, and final Phase 2 accounting controls before its PRD gate.

## Further Notes

Minimalism is evaluated on the 99-percent in-hand surface, not by deleting necessary recovery, correction, security, or accessibility actions from their appropriate secondary surfaces.
