# Table-side Mode operations

**Status:** Local guide plus owner-authorized temporary field deployment; not an official hosted-service runbook. **Audience:** the owner or a deployer running the static site and Connection Service. **Update when:** relay protocol, ticket handling, configuration, or supported matrix changes.

## Current owner field deployment

The CI-gated Table-side web artifact is published at:

**https://ourpokertable.com/table-side/**

Cloudflare Workers/Durable Objects is the preferred relay for the current
Table-side architecture. The Mac Connection Service runs in the
`html-poker-table-side-service` container as a deployer-controlled fallback. An
outbound `html-poker-table-side-tunnel` container supplies trusted HTTPS/WSS without
opening a router or laptop port. Keep the laptop and OrbStack awake while the
Mac fallback is needed; Cloudflare remains available when the laptop sleeps.

The operator token is stored outside the repository at `$HOME/Library/Application Support/HTML Poker/table-side-service/operator-token` with owner-only permissions. Paste it into the host's **Connection Service host token** field; never send it to player devices or add it to GitHub.

The Mac fallback may use a Cloudflare Quick Tunnel for temporary testing only.
Cloudflare documents Quick Tunnels as testing/development infrastructure with
no uptime guarantee, and its random hostname changes if the tunnel is
recreated. For a durable fallback, use a named tunnel hostname such as
`mac-relay.ourpokertable.com`. If a temporary hostname changes, update
`TABLE_SIDE_MAC_RELAY_URL` (or the single-relay `TABLE_SIDE_CONNECTION_SERVICE_URL`) and
rerun the CI-gated Pages deployment. Do not silently restart a tunnel and
continue using a stale site configuration.

## Cloudflare primary relay deployment

The Worker source lives in `services/cloudflare-connection-service/`. It uses
one SQLite-backed Durable Object to persist table tickets and one-shot display
pairing envelopes across Worker hibernation. Before a first deployment, set
`RELAY_ALLOWED_ORIGIN` in its `wrangler.toml` to the exact HTTPS origin that
serves Table-side Mode. The checked-in value is the current custom-domain
origin, `https://ourpokertable.com`; change it only if the public Table-side
host changes.

From a machine authenticated to the intended Cloudflare account:

```sh
pnpm test:cloudflare-relay
pnpm dlx --yes wrangler@4.41.0 secret put RELAY_OPERATOR_TOKEN --config services/cloudflare-connection-service/wrangler.toml
pnpm dlx --yes wrangler@4.41.0 deploy --config services/cloudflare-connection-service/wrangler.toml
```

The secret must be exactly the Connection Service host token held by the table
owner; it must not be added to GitHub, `wrangler.toml`, the Pages artifact, or
an invitation. Copy the deployed Worker `https://` origin as a `wss://` URL
into `TABLE_SIDE_CLOUD_RELAY_URL`. Read the configured `table-side/poker-config.js`
back after a successful Pages deployment and run `pnpm qa:live-relay` against
both configured routes before inviting players.

Each ticket is additionally bound to exactly one relay peer ID. Display-pairing
mailbox writes require a separate short-lived capability that is held only by
the host route, not in an invitation. Both relay implementations bound pending
pairings and writes per capability, so a guessed display request ID cannot fill
or overwrite the mailbox.

Operational checks:

```sh
docker inspect --format '{{.State.Health.Status}}' html-poker-table-side-service
docker ps --filter name=html-poker-table-side
TABLE_SIDE_APP_ORIGIN=https://cai-ruihe.github.io \
  TABLE_SIDE_CLOUD_RELAY_URL=wss://relay.ourpokertable.com \
  TABLE_SIDE_MAC_RELAY_URL=wss://mac-relay.ourpokertable.com \
  pnpm qa:live-relay
```

Before updating GitHub or publishing Pages, repeat the gate with `RELAY_OPERATOR_TOKEN_FILE` pointing to the owner-only token file. The command reports only pass/fail fields and never prints the operator token or minted table ticket. CI repeats the public checks after configuring the Table-side artifact and blocks Pages when the relay is dead or misconfigured.

## What Table-side Mode needs

For same-browser development, leave the runtime configuration empty. For
multi-device use, publish `dist/table-side/` on your own HTTPS origin and configure
the Cloudflare relay and, when desired, the Mac fallback. The static site is
not the poker engine: the active host remains authoritative, and the services
only help peers find/relay sealed messages.

Open-source deployers should use the clone-to-running-service [Table-side Mode self-hosting guide](TABLE-SIDE-MODE-SELF-HOSTING.md). It includes the hardened Compose recipe, private token generator, TLS alternatives, fork variables, live doctor, read-back check, and symptom-based troubleshooting. A fork without a relay variable remains unconfigured; it never inherits or falls back to the project owner's service.

The current Connection Service is an in-memory Node process. It requires these environment variables:

| Variable                             |                  Required | Meaning                                                                                                                                      |
| ------------------------------------ | ------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `POKER_CONNECTION_ACCESS_TOKEN_FILE` | One token source required | Preferred file containing the long-lived operator secret for the Mac fallback. The supplied Compose recipe mounts it as a file secret.       |
| `POKER_CONNECTION_ACCESS_TOKEN`      | One token source required | Inline compatibility alternative. Do not set it together with the file option; keep it off the static site and out of source control.        |
| `POKER_CONNECTION_HOST`              |                        No | Bind address; defaults to `127.0.0.1`.                                                                                                       |
| `POKER_CONNECTION_PORT`              |                        No | TCP port; defaults to `8787`.                                                                                                                |
| `POKER_CONNECTION_ALLOWED_ORIGIN`    |  No for local development | CORS/Origin policy value. Set the exact HTTPS app origin in a deployment; the `*` default is only suitable for controlled local development. |

Run the built service after setting the variables:

```sh
pnpm --filter @html-poker/connection-service start
```

The repository-root `services/connection-service/Dockerfile` now performs its own locked multi-stage build. The supplied `deploy/table-side/compose.yaml` mounts the operator token as a file secret, binds cleartext port 8787 only to loopback, drops Linux capabilities, uses a read-only runtime filesystem, runs as the unprivileged `node` user, and includes a health check. Use the self-hosting guide rather than assembling an image directory by hand.

Terminate TLS at a deployer-controlled reverse proxy and configure the browser with `wss://` in production. Use ordinary ingress rate limiting and network restrictions around the service; those controls are deployment infrastructure, not code supplied by this repository.

The baseline Table-side artifact permits secure `https:` and `wss:` connection endpoints so that a deployer can use its own service. `pnpm release:configure-table-side` rejects non-WSS endpoints, writes URL-only runtime configuration for the optional Cloudflare and Mac origins, and narrows the built page's `connect-src` policy to each exact HTTPS/WSS origin. A deployer-controlled HTTP header may narrow the policy further.

## Static configuration

The static build ships `poker-config.js`. Set an endpoint URL only:

```js
globalThis.__HTML_POKER_CONFIG__ = {
  cloudRelay: { url: "wss://relay.example.invalid" },
  privateRelay: { url: "wss://mac-relay.example.invalid" },
};
```

Do not put an operator token, table ticket, invitation secret, or personal
endpoint credential in this file. The host asks for the operator token locally
when creating/renewing a relay table. Each configured service mints an
independent random ticket bound to one table/host/protocol/endpoint; player
links contain those scoped tickets in their fragment, never the operator token.

## Table flow

1. Open the static site in the host browser and pass the capability preflight.
2. If a relay URL is configured, enter the private operator token locally and create the table. The UI refuses to create a configured relay table without it.
3. If the host is also playing, enter **My display name** and choose **Join my own table on this device**. The same page gains **Host Controls** and **My Hand**; after dealing it also gains **Table View** for a shared iPad/tablet screen.
4. Share the one-use player QR/link for every other seat. Do not scan or open that ordinary invitation on the Trusted Host device: doing so can replace or background the active authority page and drop its route. Treat the full link as sensitive: its fragment is not sent to the server, but it can remain in browser history, screenshots, clipboard history, or extensions.
5. Let the host deal after at least two player seats have joined. Table-side Mode
   prefers direct WebRTC, then the Cloudflare relay, then the Mac fallback when
   the prior path is unavailable. A peer keeps its active relay sticky; after a
   disconnect/timeout it retries paths serially, never duplicating an action
   across relays.
6. Pair a TV/Public Table by opening **Pair this display** on the display, choosing the requested public role, then scanning its QR from the host. The display obtains nothing until that host scan completes.
7. Use the off-table **Connection Service** card to renew a relay ticket before a long interruption or after a recovered host reports expiry. The operator token is not persisted. Ticket expiry stops a new relay registration; it does not forcibly close an already-open in-memory WebSocket.

### Table-side Player and display cues

- Player display names are limited to 24 characters so Table and TV labels stay
  legible. Table View truncates a longer label visually; the full entered name
  remains available to assistive technology.
- The player hand keeps the player's **name**, **Seat**, applicable **D Dealer
  / SB Small Blind / BB Big Blind** position, and a named seat-state glyph (for
  example **Playing**, **Folded**, or **Sitting out**) visible. The glyph and
  its text remain horizontally and vertically aligned and uncropped. Private
  cards begin promptly below the compact status. Below the community-card rail,
  a divider and intentional breathing room separate the centered **See your
  table position** and **Reconnect to table** utility row. The position button opens the private
  physical-seat map; the player's own seat is highlighted and every map label
  is screen-upright. Reconnect is grey and disabled until recovery is actually
  needed.
- On a phone, the private-card region has no visible **Your cards** or
  connection-transport heading, while retaining the accessible **Your cards**
  region name. During a shown-hand comparison, only the winning player or tied
  winners' private cards that belong to their best five stay bright. Every other
  exposed private card is faded, and each winner's bright private and community
  cards total exactly five.
- **Show cards to table** is a guarded slider because the result is permanent
  for the current hand. It stays beside **Fold**, is exactly 13.2rem wide for
  comfortable one-line label clearance, and uses the active table accent instead
  of danger red. Slide it fully to reveal. A short tap does nothing; no second
  confirmation window is shown after a completed slide.
- The compact Leave icon is in the top-right and opens a centered step-away
  pop-out. **Sit out next hand** is a switch and explains that it “skips the
  incoming hands while keeping your seat till you back.” **Leave table
  permanently** uses a red endpoint slider before its separate destructive
  confirmation. The red slider uses the same custom handle, drag, and arrow
  treatment as Show, is 30% shorter than the prior Leave rail and centered in
  the pop-out; its action is named only inside the red rail. The pop-out close
  circle/X is reduced.
- In **Table View**, open any corner control, then **More table controls** →
  **This device** → **Show player names** to toggle table labels. TV always
  shows player names.

## End a table permanently

From **Host Controls**, open **Players**. The red **Dissolve table** button is
always available in the drawer header. Choose it only when the session should
end for every connected player and display: the confirmation explains that it
closes joining, revokes invitations and credentials, removes the recoverable
host authority state, and returns the host to Home. This cannot be undone.

The **Table controls** center retains the same explicitly confirmed action as
an alternate entry point.

Use the combined host page rather than separate host and player tabs. iOS may
suspend JavaScript and networking while Safari is backgrounded, so dependent
screens cannot deal while the host is suspended. When the host returns, it
re-registers configured relay routes and refreshes its embedded Player seat;
Player, Tablet, TV, and Public Table clients also refresh their authenticated
projection on `pageshow`, visible `visibilitychange`, or `online`. If automatic
recovery fails, choose **Reconnect to table**. This is foreground recovery, not
a claim that a web page keeps running in the iOS background.

## Recover after a Connection Service restart

The Mac fallback keeps table tickets and routes only in memory, so an invitation
copied before a Mac service restart becomes stale. Durable Objects are expected
to preserve their persisted table metadata across worker hibernation/restart,
but ticket expiry and revocation still apply. On the host page:

1. Open **Host Controls**.
2. In **Connection Service**, paste the operator token and choose **Refresh relay ticket**. The host refreshes each configured relay ticket independently.
3. Copy or show the newly generated player invitation. Players must use that new link; retrying the old QR cannot restore its dropped route.

If the host browser itself no longer recovers the table, create a new table. Never put the operator token in a player link.

## Facts, inferences, and limits

**Fact:** Chromium tests demonstrate direct WebRTC after signaling, relay fallback when `RTCPeerConnection` is unavailable, scoped relay-ticket rejection, reverse TV pairing, stale-link diagnosis after a service restart, and host recovery by refreshing the ticket and sharing the regenerated invitation.

**Fact:** Chromium and Mobile WebKit journeys demonstrate that one active host document can redeem an ordinary Player invitation, switch among Host Controls, My Hand, and Table View, keep private cards out of Table View, and recover the same host/player roles after reload.

**Fact:** A Chromium isolated-device journey disconnects a Tablet's relay,
changes authoritative table state while it is offline, returns it online, and
verifies that foreground recovery catches up to the current projection without
minting a new capability.

**Fact:** The current Mac Connection Service deliberately keeps tickets, peer
registrations, and display mailboxes in process memory. Restarting it drops
them; it is not a durable session database.

**Fact:** The Cloudflare Workers/Durable Objects path is the configured primary
relay when `TABLE_SIDE_CLOUD_RELAY_URL` is present. The Mac path is a separate
fallback and may be unavailable while the Mac is asleep.

**Inference:** A deployer-owned service with TLS, an exact origin policy, and ingress controls is a more reviewable boundary than a hard-coded shared public relay. It does not make the host trustworthy or erase network metadata.

**Unknown / release gate:** Actual iPhone/iPad suspension duration and process
discard, already-connected clients surviving a service restart, NAT traversal
beyond local candidates, TURN deployment, relay failure under load, and
regional/China reachability have not been validated by the local automated
suite. Do not advertise them as supported.
