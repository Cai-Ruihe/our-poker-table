<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/svg/horizontal-green-transparent.svg">
    <img src="assets/brand/svg/horizontal-light-transparent.svg" width="478" alt="Our Poker Table">
  </picture>
</p>

<p align="center">
  <strong>Deal cards. Keep poker yours.</strong><br>
  A private, table-side dealer for the game already in front of you.
</p>

<p align="center">
  <a href="https://ourpokertable.com/normal/"><strong>Open Normal Mode</strong></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#run-your-own-table">Run your own table</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="mailto:contact@ourpokertable.com">Contact</a>
</p>

<p align="center"><sub>PLAY CHIPS ONLY &nbsp;·&nbsp; NO ACCOUNTS &nbsp;·&nbsp; NO ANALYTICS &nbsp;·&nbsp; OPEN SOURCE</sub></p>

<p align="center">
  <img src="assets/product/phase-1/public-table-dark-green.png" alt="Our Poker Table public table in Dark Green" width="100%">
</p>

<p align="center"><sub>DARK GREEN &nbsp;·&nbsp; ONE TABLE &nbsp;·&nbsp; EVERYONE SEES ONLY WHAT THEY NEED</sub></p>

## The table stays physical. The deal becomes calm.

Our Poker Table is an open-source browser dealer for in-person Texas Hold'em
with physical, play-chip betting. One Trusted Host shuffles and deals. Every
player gets a private hand on their own phone, while a tablet or TV stays on the
public board. No accounts, no casino lobby, no digital cashier—just the small
bit of technology that lets the room play more easily.

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>Private by projection</strong><br><br>
      Hidden cards are filtered before they leave the Trusted Host. They are not merely hidden in the interface.
    </td>
    <td width="33%" valign="top">
      <strong>Made for the room</strong><br><br>
      A phone holds a hand. A bigger screen holds the board. The physical table keeps the chips and conversation.
    </td>
    <td width="33%" valign="top">
      <strong>Open on purpose</strong><br><br>
      Use the hosted field build or run your own static site and connection service. The game is never a platform account.
    </td>
  </tr>
</table>

## One hand. The right view for each seat.

<p align="center">
  <img src="assets/product/phase-1/cross-mode-application-board.png" alt="Our Poker Table across Trusted Host, player, tablet, TV, pairing, and recovery views" width="100%">
</p>

| At the table | What it does |
| --- | --- |
| **Trusted Host** | Creates the table, owns the shuffle and hand history, and keeps uncommon controls out of regular play. |
| **Player phone** | Receives only its own private cards and simple in-hand choices. |
| **Tablet / TV** | Shows the board, seats, and public table state at a glance—without private cards. |
| **Recovery views** | Make a reconnect, replacement, or hand correction explicit instead of leaving the room guessing. |

## Start a proper table in three moves.

1. **Open [Normal Mode](https://ourpokertable.com/normal/) on the browser you trust to host the game.** It checks the browser before any cards are dealt.
2. **Share the one-use invitation.** Each player opens it on their own phone; the host places everyone at the physical table.
3. **Put the board where the room can see it.** Join a tablet, TV, or public display, then deal while the chips stay on the table.

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>Normal Mode</h3>
      For the ordinary hosted game: QR or invitation links, direct browser connections where possible, then the deployer's card-blind Cloudflare relay and Mac fallback when needed.
      <br><br>
      <a href="https://ourpokertable.com/normal/"><strong>Open Normal Mode →</strong></a>
    </td>
    <td width="50%" valign="top">
      <h3>Airplane Mode</h3>
      For a preloaded, local-only game on private Wi-Fi. It is a standalone file and does not need the internet once you have it.
      <br><br>
      <a href="docs/operations/AIRPLANE-MODE.md"><strong>Read the Airplane guide →</strong></a>
    </td>
  </tr>
</table>

## Built to stay out of the way.

- **Play chips only.** No money, payments, cash-out, rake, gambling accounts, or public matchmaking.
- **A Trusted Host, honestly named.** The active host is the Phase 1 game authority and can inspect the active deck by design.
- **Card privacy is the floor.** Other players, public displays, diagnostics, and the Connection Service do not receive unrevealed cards.
- **No compulsory service.** Normal Mode has deployer-owned connectivity routes; Airplane Mode remains a standalone local fallback.

<p align="center">
  <img src="assets/product/phase-1/public-table-black-gold.png" alt="Our Poker Table public table in Black Gold" width="49%">
  <img src="assets/product/phase-1/public-table-deep-navy.png" alt="Our Poker Table public table in Deep Navy" width="49%">
</p>

<p align="center"><sub>BLACK GOLD &nbsp;·&nbsp; DEEP NAVY &nbsp;·&nbsp; ONE QUIET VISUAL SYSTEM</sub></p>

## Run your own table

The project is built to remain portable. The public site is a convenient field
build, not a mandatory poker platform. Operators can host the static Normal
build, bring their own connection service, or preload the Airplane artifact.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Requires Node.js 24 and pnpm 11. For a multi-device game, follow the [Normal
Mode guide](docs/operations/NORMAL-MODE.md) or the [self-hosting guide](docs/operations/NORMAL-MODE-SELF-HOSTING.md). For the standalone build:

```sh
pnpm build
```

- `dist/normal/` is the static Normal Mode build.
- `dist/airplane/poker-airplane.html` is the standalone Airplane file.

## Project status, without the smoke.

**Phase 1 is the current product:** a Trusted-Host digital dealer for 2–10
players with private phone hands, public screens, guarded hand controls,
reconnect/replacement flows, and Normal plus Airplane routes.

**Digital Chips is experimental:** the two-player tracer can prove a narrow
play-chip hand, but multiway hardening, side pots, re-entry, full device
verification, and release qualification remain open. It is not the ordinary
party path and is available only through `?experimental=digital-chips`.

**The honest release boundary:** automated browser and contract evidence exists,
but physical iOS/iPadOS, Android, TV, WAN-removal, hostile-network, and
representative mainland-China validation are still required before any complete
field-readiness claim. See the [Phase 1 local release-candidate record](docs/releases/PHASE-1-LOCAL-RC.md).

## Keep in touch

Questions, partnership ideas, and product feedback: [contact@ourpokertable.com](mailto:contact@ourpokertable.com).

For security concerns, use the repository's [security policy](SECURITY.md).

## For builders

- [Master PRD](docs/prd/MASTER-PRD.md) and [Phase 1 PRD](docs/prd/phases/P1-TRUSTED-HOST-DEALER.md)
- [Normal Mode operations](docs/operations/NORMAL-MODE.md) and [Airplane Mode operations](docs/operations/AIRPLANE-MODE.md)
- [Architecture](docs/architecture/PHASE-1-RUNTIME.md), [quality system](docs/quality/QA-SYSTEM.md), and [release checklist](docs/releasing/RELEASE-CHECKLIST.md)
- [Contributing](CONTRIBUTING.md), [Governance](GOVERNANCE.md), and [licensing](LICENSE)

Our Poker Table is Apache-2.0 licensed. Project-owned brand assets use the
same license; the licence does not itself grant trademark rights. See the
[brand rights note](docs/design/brand/RIGHTS-AND-LICENSING.md).

Bold Poker is an interaction reference only. Our Poker Table is not affiliated
with or endorsed by Bold Poker, and does not copy its code, branding, artwork,
or exact interface expression.
