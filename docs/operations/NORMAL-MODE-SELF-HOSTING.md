# Self-host Normal Mode

**Status:** Supported operator recipe for the Phase 1 field build; not a managed hosting offer. **Audience:** an open-source deployer who controls a computer or VPS, a static HTTPS site, and optionally a public domain. **Update when:** the container, deployment variables, relay contract, or diagnostics command changes.

## Outcome and ownership boundary

Each deployment has two independent parts:

1. The static Our Poker Table web app, normally published from the deployer's own fork.
2. The deployer's card-blind relay paths, exposed through HTTPS/WSS: a
   Cloudflare Workers/Durable Objects relay as primary and an optional Mac
   Connection Service as fallback.

The operator token exists only on the deployer's server and in the host player's password manager. It is never a repository variable, GitHub secret, static asset, invitation, or player credential. A fork with none of `NORMAL_CLOUD_RELAY_URL`, `NORMAL_MAC_RELAY_URL`, or legacy `NORMAL_CONNECTION_SERVICE_URL` publishes an unconfigured Normal build and does **not** fall back to the project owner's relay.

The relay services are not a poker engine. The active host browser remains the
Trusted Host. Each configured service mints an independent table-scoped ticket,
helps peers connect, relays encrypted envelopes when direct WebRTC is
unavailable, and temporarily holds encrypted display-pairing answers. It does
not receive card plaintext or card keys. Active peers keep one relay sticky;
reconnect failover is serial and never duplicates an envelope across both
paths.

## Prerequisites

- Git, Node.js 24, and pnpm 11 for repository commands.
- Docker with Compose for the supplied container recipe.
- An exact HTTPS app origin, such as `https://YOUR-NAME.github.io`.
- For a durable Internet deployment: a domain whose DNS points to the server, ports 80 and 443 open, and a TLS reverse proxy. The example below uses Caddy; another WebSocket-capable HTTPS proxy is acceptable.
- For the primary relay: a Cloudflare account with a Workers/Durable Objects
  deployment and a DNS hostname such as `relay.example.com`. The account and
  DNS zone belong to the deployer; no project-owner account is used.
- For the Mac fallback: an always-on Mac when fallback is needed, plus a
  stable named-tunnel hostname such as `mac-relay.example.com`. A Quick Tunnel
  is testing-only and cannot be treated as a durable fallback.
- For a temporary test only: `cloudflared` can create a random Quick Tunnel without router changes.

## 1. Clone and create your private token

```sh
git clone https://github.com/Cai-Ruihe/our-poker-table.git
cd our-poker-table
pnpm install --frozen-lockfile

relay_token_path="${XDG_CONFIG_HOME:-${HOME}/.config}/our-poker-table/normal-relay/operator-token"
pnpm relay:create-token -- "$relay_token_path"
```

The token command creates missing parent directories, writes a 256-bit random base64url token with mode `0600`, refuses to overwrite an existing token, and prints only the path. Store the same token in the host player's password manager under a name such as **Our Poker Table relay token**. Do not send it to players.

## 2. Start your Connection Service

Copy the non-secret environment template and edit the three values:

```sh
cp deploy/normal/.env.example deploy/normal/.env
```

`deploy/normal/.env` must contain:

```dotenv
NORMAL_APP_ORIGIN=https://YOUR-GITHUB-USERNAME.github.io
NORMAL_CLOUD_RELAY_URL=wss://relay.example.com
NORMAL_MAC_RELAY_URL=wss://mac-relay.example.com
RELAY_OPERATOR_TOKEN_FILE=/absolute/path/to/operator-token
POKER_CONNECTION_PORT=8787
```

The app origin is an origin only: scheme plus hostname and optional port, with no repository path. The relay URLs are WSS origins only and contain no path, credentials, query, or fragment. The token path must be absolute. Start the Mac fallback service:

```sh
docker compose \
  --env-file deploy/normal/.env \
  --file deploy/normal/compose.yaml \
  up --detach --build

docker compose \
  --env-file deploy/normal/.env \
  --file deploy/normal/compose.yaml \
  ps

curl --fail --silent --show-error http://127.0.0.1:8787/health
```

The last command must return `{"status":"ok"}`. The supplied container is built from the checked-out source, runs as the unprivileged `node` user, mounts the operator token as a file secret, drops Linux capabilities, uses a read-only root filesystem, and publishes cleartext HTTP only on loopback. Do not expose port 8787 directly to the Internet.

## 3. Add HTTPS/WSS

### Mac fallback: durable domain with Caddy

Point a DNS record such as `relay.example.com` to the server. Caddy's documented automatic-HTTPS requirements include reachable ports 80/443 and a public DNS name that resolves to the server. Put this in a Caddyfile:

```caddyfile
relay.example.com {
  reverse_proxy 127.0.0.1:8787
}
```

Validate and run it using the installation method for your operating system:

```sh
caddy validate --config /path/to/Caddyfile
caddy run --config /path/to/Caddyfile
```

Caddy's `reverse_proxy` supports the HTTP and WebSocket traffic used here, while automatic HTTPS obtains and renews the public certificate. The browser relay URL is `wss://relay.example.com`.

Primary references: [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https) and [`reverse_proxy`](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

### Temporary test with a Quick Tunnel

If the server is a laptop behind a router, a deployer may test without opening an inbound port:

```sh
cloudflared tunnel --url http://127.0.0.1:8787
```

Convert the printed `https://RANDOM.trycloudflare.com` address to `wss://RANDOM.trycloudflare.com` for app configuration. Cloudflare explicitly describes Quick Tunnels as testing/development only, with no SLA or uptime guarantee and a random hostname. A restart can require a new URL and a new static-site deployment. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

## 4. Run the relay doctor

First test the loopback service. Use the same app origin that the service allows:

```sh
NORMAL_APP_ORIGIN=https://YOUR-GITHUB-USERNAME.github.io \
NORMAL_CONNECTION_SERVICE_URL=http://127.0.0.1:8787 \
RELAY_CHECK_ALLOW_HTTP_LOOPBACK=1 \
RELAY_OPERATOR_TOKEN_FILE="$relay_token_path" \
pnpm relay:doctor
```

Then test the public TLS endpoint:

```sh
NORMAL_APP_ORIGIN=https://YOUR-GITHUB-USERNAME.github.io \
NORMAL_CONNECTION_SERVICE_URL=wss://relay.example.com \
RELAY_OPERATOR_TOKEN_FILE="$relay_token_path" \
pnpm relay:doctor
```

A ready result is JSON with `health`, `cors`, `invalidTokenRejection`, and `operatorTokenAcceptance` set to `ok`. The doctor checks DNS, `/health`, exact-origin CORS, rejection of an invalid operator token, and—when the private file is supplied—issuance of a valid table-scoped ticket. It refuses redirects and never prints the operator token or minted ticket.

## 5. Publish your own static app

1. Fork the repository. In the fork, enable **Settings → Pages → Source: GitHub Actions**.
2. Under **Settings → Secrets and variables → Actions → Variables**, create
   `NORMAL_CLOUD_RELAY_URL` with the Cloudflare Workers/Durable Objects `wss://`
   origin and, if using the Mac fallback, `NORMAL_MAC_RELAY_URL` with its named
   tunnel `wss://` origin. Existing deployments may retain
   `NORMAL_CONNECTION_SERVICE_URL`, which is treated as the Mac/private
   fallback when the new Mac variable is absent.
3. For ordinary `https://YOUR-NAME.github.io/...` Pages hosting, the workflow derives the app origin from the fork owner. If using a custom app domain, also set `NORMAL_APP_ORIGIN` to its exact HTTPS origin.
4. Do **not** add the operator token to GitHub. It is entered only in the Trusted Host browser.
5. Push to `main` or rerun the CI workflow. The deployment configures the
   static artifact only with the configured relay origins and blocks
   publication if any configured public relay fails its live checks.

GitHub repository variables are configuration owned by each repository; create them in the fork. GitHub also documents that Actions secrets are not passed to workflows triggered from forks. This project relies on neither inherited configuration nor an inherited secret for a fork's relay. See [GitHub Actions variables](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables) and [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

Read the deployed configuration back before inviting players:

```sh
curl --fail --silent --show-error \
  https://YOUR-GITHUB-USERNAME.github.io/YOUR-FORK/normal/poker-config.js
```

It should contain the configured `wss://` endpoints and no token. Open that Normal page, paste the operator token into **Connection Service host token**, and create a fresh table. Player links carry only the short-lived, endpoint-specific table-scoped tickets and invitation material.

## Troubleshooting guide

| Symptom | Check | Corrective action |
| --- | --- | --- |
| **Load failed** or **Connection Service is unreachable** | Run `pnpm relay:doctor`; inspect DNS and `GET /health`. | Restore the service/proxy/tunnel. Do not keep distributing a link while the doctor fails. |
| Doctor says the origin is wrong | Compare `NORMAL_APP_ORIGIN`, `POKER_CONNECTION_ALLOWED_ORIGIN`, and the browser address. | Use the exact HTTPS origin: scheme, hostname, and optional port; omit every path. Restart the service. |
| Valid host token returns `401 access-denied` | Confirm the host password entry and `RELAY_OPERATOR_TOKEN_FILE` refer to the same token. | Correct the mismatch. To rotate, create a token at a new path, update the deployment file, and restart the service. |
| Doctor refuses a redirect | Test the exact relay hostname and inspect the reverse-proxy route. | Proxy `/health`, `/v1/table-sessions`, `/v1/display-pairings/*`, and WebSocket upgrades directly without redirecting to another origin. |
| Browser reports mixed content or cannot open WSS | Inspect the public certificate and configured URL. | Use a valid public certificate and a `wss://` URL; never configure public `ws://`. |
| Deployed page still names an old relay | Read back `normal/poker-config.js` and inspect the latest Actions run. | Update the fork's repository variable and complete a new successful Pages deployment. |
| Players see **No route reached the Trusted Host** | Bring the host Safari/browser tab to the foreground and use **Reconnect to table**. Check both relay health endpoints and whether the Mac service restarted. | The client retries configured paths serially. If the Mac service restarted, the host must refresh relay tickets and share newly generated invitations. Old links remain stale. |
| Quick Tunnel hostname changed | Compare the tunnel output with deployed `poker-config.js`. | Update `NORMAL_MAC_RELAY_URL` (or legacy `NORMAL_CONNECTION_SERVICE_URL`), redeploy, run the doctor, and create/share fresh invitations. |
| Compose says a required variable is missing | Run the Compose command with `--env-file deploy/normal/.env`. | Fill every placeholder with an exact origin and absolute token path. Never paste the token value into this file. |
| Port 8787 is already in use | Inspect `docker compose ... ps` and local listeners. | Set a different `POKER_CONNECTION_PORT` in `.env`, then point the local TLS proxy/tunnel to that loopback port. |

Useful non-secret evidence commands:

```sh
docker compose \
  --env-file deploy/normal/.env \
  --file deploy/normal/compose.yaml \
  ps

docker compose \
  --env-file deploy/normal/.env \
  --file deploy/normal/compose.yaml \
  logs --tail=100 connection_service
```

Do not paste the operator token, invitation fragment, QR image, or full private logs into a public issue. The public [bug report template](../../.github/ISSUE_TEMPLATE/bug_report.yml) and [security policy](../../SECURITY.md) define safe reporting routes.

## Limits and recovery

- Mac fallback tickets, peer registrations, and display mailboxes are in memory.
  A Mac Connection Service restart invalidates its old invitations and requires
  the host to refresh relay tickets. Durable Objects persist the state needed
  for the Cloudflare path across hibernation/restarts, subject to ticket expiry
  and explicit revocation.
- The browser host still cannot run continuously in the iOS background. Foreground the host to reconnect dependent screens.
- The relay can observe network metadata such as IP addresses, timing, sizes, and routing identifiers even though messages are encrypted.
- This recipe does not supply TURN, multi-region failover, monitoring, backups,
  DDoS protection, or a regional/China availability claim. Cloudflare's
  service limits and the Mac's power/network state remain operational gates.
- Stop the deployment with `docker compose --env-file deploy/normal/.env --file deploy/normal/compose.yaml down`. The private token file remains on the deployer's machine and is not removed by that command.
