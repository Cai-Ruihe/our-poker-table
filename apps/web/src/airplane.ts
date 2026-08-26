import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";

import type {
  CapabilityRole,
  Invitation,
  PeerBinding,
} from "@html-poker/identity-capabilities";

const airplanePrefix = "HTMLPOKER-AIRPLANE-1:";
const maximumPairingCodeLength = 16_384;
export type AirplanePresentationLanguage = "en" | "zh";

interface AirplaneOfferPayload {
  readonly binding: PeerBinding;
  readonly expiresAt: number;
  readonly formatVersion: 1;
  readonly invitation: Invitation;
  readonly kind: "offer";
  readonly presentationLanguage?: AirplanePresentationLanguage;
  readonly offerId: string;
  readonly sdp: string;
}

interface AirplaneAnswerPayload {
  readonly binding: PeerBinding;
  readonly clientPeerId: string;
  readonly formatVersion: 1;
  readonly kind: "answer";
  readonly offerId: string;
  readonly sdp: string;
}

type AirplanePairingPayload = AirplaneOfferPayload | AirplaneAnswerPayload;

export interface HostAirplanePairing {
  readonly expiresAt: number;
  readonly offerCode: string;
  readonly offerId: string;
  readonly role: CapabilityRole;
  acceptAnswer(answerCode: string): Promise<{
    readonly channel: RTCDataChannel;
    readonly clientPeerId: string;
  }>;
  close(): void;
}

export interface ClientAirplanePairing {
  readonly answerCode: string;
  readonly binding: PeerBinding;
  readonly channel: RTCDataChannel;
  readonly clientPeerId: string;
  readonly invitation: Invitation;
  readonly presentationLanguage?: AirplanePresentationLanguage;
  close(): void;
}

function randomId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis
    .btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = globalThis.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodePayload(payload: AirplanePairingPayload): string {
  const compressed = gzipSync(strToU8(JSON.stringify(payload)), { level: 9 });
  const code = `${airplanePrefix}${bytesToBase64Url(compressed)}`;
  if (code.length > maximumPairingCodeLength) {
    throw new Error("The local pairing payload is too large for a safe QR.");
  }
  return code;
}

function decodePayload(code: string): AirplanePairingPayload {
  if (
    !code.startsWith(airplanePrefix) ||
    code.length > maximumPairingCodeLength
  ) {
    throw new Error("This is not a supported Our Poker Table Airplane QR.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      strFromU8(
        gunzipSync(base64UrlToBytes(code.slice(airplanePrefix.length))),
      ),
    );
  } catch {
    throw new Error("The Airplane QR payload is damaged.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("The Airplane QR payload is invalid.");
  }
  const candidate = parsed as Partial<AirplanePairingPayload>;
  if (
    candidate.formatVersion !== 1 ||
    !candidate.binding ||
    !candidate.offerId ||
    !candidate.sdp ||
    !["offer", "answer"].includes(String(candidate.kind))
  ) {
    throw new Error("The Airplane QR payload schema is invalid.");
  }
  const presentationLanguage = (
    candidate as {
      readonly presentationLanguage?: unknown;
    }
  ).presentationLanguage;
  if (
    presentationLanguage !== undefined &&
    presentationLanguage !== "en" &&
    presentationLanguage !== "zh"
  ) {
    throw new Error("The Airplane QR presentation language is invalid.");
  }
  return candidate as AirplanePairingPayload;
}

function sameBinding(left: PeerBinding, right: PeerBinding): boolean {
  return (
    left.buildVersion === right.buildVersion &&
    left.hostKey === right.hostKey &&
    left.protocolVersion === right.protocolVersion &&
    left.tableId === right.tableId
  );
}

function waitForIceGathering(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Local WebRTC address gathering timed out. Check private Wi-Fi support.",
        ),
      );
    }, 7_500);
    const stateChanged = () => {
      if (connection.iceGatheringState !== "complete") return;
      cleanup();
      resolve();
    };
    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", stateChanged);
    };
    connection.addEventListener("icegatheringstatechange", stateChanged);
  });
}

function candidateSummary(sdp: string | undefined): string {
  if (!sdp) return "0 candidates";
  const candidates = sdp
    .split("\n")
    .filter((line) => line.trimStart().startsWith("a=candidate:"));
  const mdns = candidates.filter((line) => line.includes(".local ")).length;
  return `${candidates.length} candidates, ${mdns} mDNS`;
}

function waitForChannelOpen(
  connection: RTCPeerConnection,
  channel: RTCDataChannel,
): Promise<void> {
  if (channel.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `The direct WebRTC channel did not open. The Wi-Fi may isolate devices. ` +
            `(connection ${connection.connectionState}; ICE ${connection.iceConnectionState}; ` +
            `channel ${channel.readyState}; local ${candidateSummary(connection.localDescription?.sdp)}; ` +
            `remote ${candidateSummary(connection.remoteDescription?.sdp)}.)`,
        ),
      );
    }, 10_000);
    const opened = () => {
      cleanup();
      resolve();
    };
    const closed = () => {
      cleanup();
      reject(new Error("The direct WebRTC channel closed during pairing."));
    };
    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      channel.removeEventListener("open", opened);
      channel.removeEventListener("close", closed);
    };
    channel.addEventListener("open", opened, { once: true });
    channel.addEventListener("close", closed, { once: true });
  });
}

export async function createHostAirplanePairing(input: {
  readonly binding: PeerBinding;
  readonly invitation: Invitation;
  readonly presentationLanguage?: AirplanePresentationLanguage;
}): Promise<HostAirplanePairing> {
  const connection = new RTCPeerConnection({ iceServers: [] });
  const offerId = randomId("airplane-offer");
  const channel = connection.createDataChannel(
    `html-poker:${input.binding.tableId}:${offerId}`,
    { id: 0, negotiated: true, ordered: true },
  );
  const offer = await connection.createOffer();
  await connection.setLocalDescription(offer);
  await waitForIceGathering(connection);
  const sdp = connection.localDescription?.sdp;
  if (!sdp) {
    connection.close();
    throw new Error("The browser did not create a local WebRTC offer.");
  }
  const offerCode = encodePayload({
    binding: { ...input.binding },
    expiresAt: input.invitation.expiresAt,
    formatVersion: 1,
    invitation: { ...input.invitation },
    kind: "offer",
    offerId,
    ...(input.presentationLanguage
      ? { presentationLanguage: input.presentationLanguage }
      : {}),
    sdp,
  });
  let answered = false;
  return {
    async acceptAnswer(answerCode) {
      if (answered)
        throw new Error("This Airplane answer was already applied.");
      const answer = decodePayload(answerCode);
      if (
        answer.kind !== "answer" ||
        answer.offerId !== offerId ||
        !sameBinding(answer.binding, input.binding) ||
        !answer.clientPeerId
      ) {
        throw new Error("The Airplane answer does not match this offer.");
      }
      answered = true;
      await connection.setRemoteDescription({
        sdp: answer.sdp,
        type: "answer",
      });
      await waitForChannelOpen(connection, channel);
      return { channel, clientPeerId: answer.clientPeerId };
    },
    close() {
      channel.close();
      connection.close();
    },
    expiresAt: input.invitation.expiresAt,
    offerCode,
    offerId,
    role: input.invitation.role,
  };
}

export async function acceptHostAirplaneOffer(
  offerCode: string,
): Promise<ClientAirplanePairing> {
  const offer = decodePayload(offerCode);
  if (
    offer.kind !== "offer" ||
    !offer.invitation ||
    offer.invitation.token.length < 16 ||
    !["player", "public-table", "tv", "table-control"].includes(
      offer.invitation.role,
    ) ||
    offer.expiresAt !== offer.invitation.expiresAt
  ) {
    throw new Error("The Airplane offer schema is invalid.");
  }
  if (offer.expiresAt <= Date.now()) {
    throw new Error("This Airplane offer has expired.");
  }
  const connection = new RTCPeerConnection({ iceServers: [] });
  const channel = connection.createDataChannel(
    `html-poker:${offer.binding.tableId}:${offer.offerId}`,
    { id: 0, negotiated: true, ordered: true },
  );
  await connection.setRemoteDescription({ sdp: offer.sdp, type: "offer" });
  const answer = await connection.createAnswer();
  await connection.setLocalDescription(answer);
  await waitForIceGathering(connection);
  const sdp = connection.localDescription?.sdp;
  if (!sdp) {
    connection.close();
    throw new Error("The browser did not create a local WebRTC answer.");
  }
  const clientPeerId = randomId("airplane-client");
  const answerCode = encodePayload({
    binding: { ...offer.binding },
    clientPeerId,
    formatVersion: 1,
    kind: "answer",
    offerId: offer.offerId,
    sdp,
  });
  return {
    answerCode,
    binding: { ...offer.binding },
    channel,
    clientPeerId,
    close() {
      channel.close();
      connection.close();
    },
    invitation: { ...offer.invitation },
    ...(offer.presentationLanguage
      ? { presentationLanguage: offer.presentationLanguage }
      : {}),
  };
}

export function airplaneAnswerOfferId(answerCode: string): string {
  const answer = decodePayload(answerCode);
  if (answer.kind !== "answer") {
    throw new Error("An Airplane answer QR was expected.");
  }
  return answer.offerId;
}
