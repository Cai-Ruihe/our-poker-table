import { describe, expect, it } from "vitest";

import {
  bindingMatches,
  peerKey,
  validDisplayPairingEnvelope,
  validEnvelope,
  validRegistration,
} from "./relay-contract.js";

describe("Cloudflare relay contract", () => {
  it("accepts the existing registration and opaque envelope shapes", () => {
    const registration = {
      accessToken: "ticket-not-a-secret-in-this-test",
      hostKey: "host-key",
      peerId: "peer-a",
      protocolVersion: 1,
      tableId: "table-a",
    } as const;
    expect(validRegistration(registration)).toBe(true);
    expect(
      validEnvelope({
        ciphertext: "sealed",
        hostKey: registration.hostKey,
        messageId: "message-1",
        protocolVersion: 1,
        recipientPeerId: "peer-b",
        senderPeerId: registration.peerId,
        sequence: 1,
        tableId: registration.tableId,
      }),
    ).toBe(true);
  });

  it("keeps peer identity and table binding isolated", () => {
    const binding = { hostKey: "host", protocolVersion: 1, tableId: "table" };
    expect(bindingMatches(binding, { ...binding })).toBe(true);
    expect(bindingMatches(binding, { ...binding, tableId: "other" })).toBe(
      false,
    );
    expect(peerKey({ ...binding, peerId: "a" })).not.toBe(
      peerKey({ ...binding, peerId: "b" }),
    );
  });

  it("requires short-lived display pairing envelopes", () => {
    const now = 10_000;
    expect(
      validDisplayPairingEnvelope(
        { ciphertext: "opaque", expiresAt: now + 1_000, iv: "iv" },
        now,
      ),
    ).toBe(true);
    expect(
      validDisplayPairingEnvelope(
        { ciphertext: "opaque", expiresAt: now, iv: "iv" },
        now,
      ),
    ).toBe(false);
  });
});
