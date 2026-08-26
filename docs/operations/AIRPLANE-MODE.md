# Airplane Mode operations

**Status:** Local operator guide. **Audience:** a group preparing an offline physical table. **Update when:** artifact format, pairing protocol, or device support matrix changes.

## Same-Wi-Fi party setup

Use this route when internet is available for the initial page load and the goal is one consistent build across iPhones:

1. On the laptop and every phone, open **https://ourpokertable.com/poker-airplane.html**. On iPhone, prefer a normal Safari tab over opening an HTML attachment from Files or a file-manager browser.
2. Confirm every start screen says **Build 0.1.5-phase1**. Do not reuse an older saved table or mix this URL with a copied HTML file.
3. Keep every device on the same non-isolating Wi-Fi. The laptop does not need an inbound port, public server, router forwarding, or the home's static public IP.
4. Create a new table on the laptop and complete the two-QR pairing flow for each player. Use **Enlarge QR** before a phone scans the laptop's dense WebRTC offer.
5. On a player phone, choose **Reveal my cards privately** to view the hand. This changes only that phone. **Show cards to table** is the separate public action.
6. Keep each game tab open. The app requests a screen wake lock while a table is active when the browser permits it. A temporarily hidden page now reconnects its presence when shown again if WebRTC survived; a manually closed tab or an iOS process discard can still destroy the direct channel.

If a player phone disconnects or its tab closes:

1. On the host, open **Players** and find that player's seat.
2. Choose **Replace device**, then **Pair Replacement for _name_**.
3. On the player's phone, reopen the same party URL, choose **Join an Airplane table**, and complete the two QR scans.
4. The one-use replacement keeps the same seat and active hole cards and revokes the old phone credential.

This replacement flow is the safe recovery path for a destroyed Airplane peer channel. Automatic reconnect after a fully closed tab is not claimed because serverless WebRTC has no surviving signaling route.

## Before travel

1. Build from the reviewed commit with `pnpm build`.
2. Copy the exact `dist/airplane/poker-airplane.html` file to every participating device before losing internet access.
3. Keep the files on the same build/protocol version. The pairing QR rejects incompatible versions before private delivery.
4. Test the file by opening it directly from the device's file system. A development server is not an Airplane test.
5. Create or verify a private Wi-Fi network that allows devices to talk directly to each other. Captive portals and client-isolating hotspots can block the WebRTC channel.

## Pairing flow

1. On the host file, create a table.
2. Select **Pair Player** (or a public role) to show an offer QR, then select **Enlarge QR** so the code uses most of the laptop display.
3. On the other device, open the same downloaded file, choose **Join an Airplane table**, then select **Scan host offer QR**. Allow camera access and hold the host QR inside the four-corner guide. A saved QR image remains available as a fallback.
4. The other device shows an answer QR. On the host—including a laptop—select **Scan Player answer QR** to open the live camera and scan it.
5. After the host confirms the direct channel, the player chooses a display name and joins. Repeat for each player or display.

The pairing exchange is intentionally two-way. It avoids a server, typed pairing code, file transfer, Bluetooth requirement, STUN, TURN, analytics, remote font fetch, and service-worker update path.

The Airplane QR contains local pairing data, not a website address. The phone's standalone Camera app therefore does not open it. Start from **Join an Airplane table** inside the downloaded HTML file and use that in-page scanner.

## What the artifact guarantees locally

**Fact:** The build script inlines the application JavaScript, stylesheet, Archivo font assets, Airplane configuration, and third-party notice bundle. Its Airplane CSP uses `connect-src 'none'`, and the browser journey opens the generated `file://` artifact while observing no requests beyond the file itself.

**Fact:** The Airplane adapter creates `RTCPeerConnection({ iceServers: [] })`; it binds QR offers/answers to table, host key, build/protocol, role, expiry, and one-use invitation data. Chromium exercises the two-player direct pairing journey from the generated file.

**Fact:** Browser journeys verify that both host and joining-device scan actions request a live camera, retain a saved-image fallback, and stop at the same local decoder boundary. Saved images use the browser's local `BarcodeDetector` when available; camera and fallback decoding use bundled `jsQR`. A deterministic Chromium camera stream presents real generated offer QR frames and produced the answer QR in 10 of 10 repeated inset-frame stress iterations. The host can expand the offer above 500 px in the desktop journey.

**Unknown:** Synthetic camera input and the automated two-player path do not prove that every iPhone, iPad, Android device, TV browser, file manager, physical camera, permission policy, or private hotspot will permit the same flow. In the current headless Mobile WebKit probe, a `file://` peer stayed in ICE gathering with no local candidate after eight seconds, so that project runs the artifact boot and camera-UI smoke but not a false passing direct-pairing test. Physical device evidence remains required.

## Failure handling

- **Camera blocked or missing:** allow camera access for the local file and try again. If the browser still refuses camera access, choose **Use a saved QR image** in the scanner.
- **QR unreadable:** on the host choose **Enlarge QR**, raise screen brightness, keep the whole white border visible, and move the camera until the QR sits inside the four-corner guide. Avoid re-compressing screenshots. Live video uses bundled `jsQR`; a saved QR image can use the local browser detector when available.
- **Wrong or old file:** update every device to the same generated artifact and create a fresh offer.
- **Phone locked or tab closed:** reopen the current build and ask the host to use **Players → Replace device** for that seat. Complete a fresh two-QR pairing; do not try to reuse the dead direct channel.
- **`revision-conflict` banner:** do not continue with an older build. Build `0.1.5-phase1` includes serialized overlapping recovery commits, including the `pagehide` race reproduced from the field report, plus the corrected sit-out/return transition.
- **Channel does not open:** treat client isolation or unsupported local WebRTC as the likely cause; use a different private Wi-Fi network or return to Table-side Mode when connectivity is available.
- **Host loss:** Phase 1 permits permanent host loss to end the game. Same-browser local recovery is the only supported authority recovery path; do not copy active custody state between devices.

Record actual device/browser/network results before claiming Airplane support publicly. The Phase 1 PRD requires WAN-removed, two-to-ten-seat, public-display, isolation, refresh, mixed-version, and zero-external-request evidence on the intended matrix.
