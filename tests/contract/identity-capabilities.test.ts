import { describe, expect, it } from "vitest";

import {
  createRoomIdentity,
  type PeerBinding,
  type RoomIdentity,
} from "@html-poker/identity-capabilities";

const binding: PeerBinding = {
  buildVersion: "0.1.0",
  hostKey: "host-key-a",
  protocolVersion: 1,
  tableId: "table-a",
};

function createIdentity(now: () => number = () => 1_000): RoomIdentity {
  let sequence = 0;
  return createRoomIdentity({
    ...binding,
    now,
    secretFactory: () => `secret-${++sequence}-${"x".repeat(32)}`,
  });
}

function redeemPlayer(
  identity: RoomIdentity,
  invitationToken: string,
  displayName: string,
  clientInstanceId: string,
) {
  return identity.redeem({
    binding,
    clientInstanceId,
    displayName,
    invitationToken,
  });
}

describe("room-scoped identity and capabilities", () => {
  it("joins 2–10 players without accounts and treats names as display-only", () => {
    const identity = createIdentity();
    identity.openJoinWindow();
    const accepted = Array.from({ length: 10 }, (_, index) => {
      const invitation = identity.issueInvitation({
        role: "player",
        ttlMs: 30_000,
      });
      return redeemPlayer(
        identity,
        invitation.token,
        index < 2 ? "Alex" : `Player ${index + 1}`,
        `client-${index + 1}`,
      );
    });

    expect(accepted.every((result) => result.status === "accepted")).toBe(true);
    expect(identity.roster().seats).toHaveLength(10);
    expect(
      identity.roster().seats.filter((seat) => seat.displayName === "Alex"),
    ).toHaveLength(2);

    const overflowInvitation = identity.issueInvitation({
      role: "player",
      ttlMs: 30_000,
    });
    expect(
      redeemPlayer(identity, overflowInvitation.token, "Eleventh", "client-11"),
    ).toEqual({ code: "table-full", status: "rejected" });
  });

  it("rejects expired, replayed, closed, and wrongly bound invitations", () => {
    let now = 1_000;
    const identity = createIdentity(() => now);
    identity.openJoinWindow();
    const replayed = identity.issueInvitation({
      role: "player",
      ttlMs: 100,
    });
    expect(
      redeemPlayer(identity, replayed.token, "Alice", "client-a"),
    ).toMatchObject({ status: "accepted" });
    expect(
      redeemPlayer(identity, replayed.token, "Mallory", "client-m"),
    ).toEqual({ code: "invitation-replayed", status: "rejected" });

    const expired = identity.issueInvitation({
      role: "player",
      ttlMs: 100,
    });
    now += 101;
    expect(redeemPlayer(identity, expired.token, "Bob", "client-b")).toEqual({
      code: "invitation-expired",
      status: "rejected",
    });

    now += 1;
    const wrongBinding = identity.issueInvitation({
      role: "player",
      ttlMs: 100,
    });
    expect(
      identity.redeem({
        binding: { ...binding, hostKey: "substituted-host-key" },
        clientInstanceId: "client-c",
        displayName: "Carol",
        invitationToken: wrongBinding.token,
      }),
    ).toEqual({ code: "binding-mismatch", status: "rejected" });

    identity.closeJoinWindow();
    const closed = identity.issueInvitation({
      role: "player",
      ttlMs: 100,
    });
    expect(redeemPlayer(identity, closed.token, "Dan", "client-d")).toEqual({
      code: "join-window-closed",
      status: "rejected",
    });
  });

  it("revokes superseded links and never revives a link across a reopened Join Window", () => {
    const identity = createIdentity();
    identity.openJoinWindow();
    const superseded = identity.issueInvitation({
      role: "player",
      ttlMs: 30_000,
    });
    const current = identity.issueInvitation({
      role: "player",
      ttlMs: 30_000,
    });

    expect(
      redeemPlayer(identity, superseded.token, "Alice", "client-a"),
    ).toEqual({ code: "invitation-revoked", status: "rejected" });
    expect(
      redeemPlayer(identity, current.token, "Alice", "client-a"),
    ).toMatchObject({ status: "accepted" });

    const beforeClose = identity.issueInvitation({
      role: "player",
      ttlMs: 30_000,
    });
    identity.closeJoinWindow();
    identity.openJoinWindow();
    expect(
      redeemPlayer(identity, beforeClose.token, "Bob", "client-b"),
    ).toEqual({ code: "invitation-revoked", status: "rejected" });
  });

  it("recovers the same client and rotates a replacement while revoking the old phone", () => {
    const identity = createIdentity();
    identity.openJoinWindow();
    const invitation = identity.issueInvitation({
      role: "player",
      ttlMs: 30_000,
    });
    const joined = redeemPlayer(
      identity,
      invitation.token,
      "Alice",
      "alice-phone-1",
    );
    if (joined.status !== "accepted" || !joined.seat)
      throw new Error("Expected a seat.");

    expect(
      identity.authenticate({
        binding,
        clientInstanceId: "alice-phone-1",
        credentialToken: joined.credential.token,
      }),
    ).toMatchObject({
      role: "player",
      seatId: joined.seat?.seatId,
      status: "accepted",
    });
    expect(
      identity.authenticate({
        binding,
        clientInstanceId: "copied-tab",
        credentialToken: joined.credential.token,
      }),
    ).toEqual({ code: "active-client-conflict", status: "rejected" });

    const replacement = identity.issueInvitation({
      role: "player",
      seatId: joined.seat.seatId,
      ttlMs: 30_000,
    });
    const replaced = identity.redeem({
      binding,
      clientInstanceId: "alice-phone-2",
      invitationToken: replacement.token,
    });
    expect(replaced).toMatchObject({
      role: "player",
      seat: { seatId: joined.seat?.seatId },
      status: "accepted",
    });
    if (replaced.status !== "accepted")
      throw new Error("Expected replacement.");
    expect(
      identity.authenticate({
        binding,
        clientInstanceId: "alice-phone-1",
        credentialToken: joined.credential.token,
      }),
    ).toEqual({ code: "credential-revoked", status: "rejected" });
    expect(
      identity.authenticate({
        binding,
        clientInstanceId: "alice-phone-2",
        credentialToken: replaced.credential.token,
      }),
    ).toMatchObject({ status: "accepted" });
  });

  it("keeps public, TV, and table-control authority non-upgradeable", () => {
    const identity = createIdentity();
    for (const role of ["public-table", "tv", "table-control"] as const) {
      const invitation = identity.issueInvitation({ role, ttlMs: 30_000 });
      const result = identity.redeem({
        binding,
        clientInstanceId: `${role}-client`,
        invitationToken: invitation.token,
      });
      expect(result).toMatchObject({ role, status: "accepted" });
      if (result.status !== "accepted") throw new Error("Expected role grant.");
      expect(
        identity.authenticate({
          binding,
          clientInstanceId: `${role}-client`,
          credentialToken: result.credential.token,
          requiredRole: role,
        }),
      ).toMatchObject({ role, status: "accepted" });
      if (role !== "table-control") {
        expect(
          identity.authenticate({
            binding,
            clientInstanceId: `${role}-client`,
            credentialToken: result.credential.token,
            requiredRole: "table-control",
          }),
        ).toEqual({ code: "role-mismatch", status: "rejected" });
      }
    }
  });

  it("queues mid-hand joins and sits disconnected or opted-out players out next hand", () => {
    const identity = createIdentity();
    identity.openJoinWindow();
    identity.onHandStarted();
    const invitation = identity.issueInvitation({
      role: "player",
      ttlMs: 30_000,
    });
    const joined = redeemPlayer(
      identity,
      invitation.token,
      "Alice",
      "alice-phone",
    );
    if (joined.status !== "accepted") throw new Error("Expected a seat.");
    expect(joined.seat).toMatchObject({ state: "waiting" });

    identity.onHandEnded();
    identity.onHandStarted();
    expect(identity.roster().seats[0]).toMatchObject({ state: "playing" });
    expect(
      identity.setFutureParticipation({
        credentialToken: joined.credential.token,
        sittingOut: true,
      }),
    ).toMatchObject({ status: "accepted" });
    identity.onHandEnded();
    identity.onHandStarted();
    expect(identity.roster().seats[0]).toMatchObject({ state: "sitting-out" });

    expect(
      identity.setFutureParticipation({
        credentialToken: joined.credential.token,
        sittingOut: false,
      }),
    ).toMatchObject({ status: "accepted" });
    identity.onHandEnded();
    identity.onHandStarted();
    identity.setConnected({
      credentialToken: joined.credential.token,
      connected: false,
    });
    identity.onHandEnded();
    expect(identity.roster().seats[0]).toMatchObject({ state: "sitting-out" });
  });

  it("keeps surviving physical seat numbers and reuses a permanently vacated seat for the next player", () => {
    const identity = createIdentity();
    identity.openJoinWindow();
    const alice = redeemPlayer(
      identity,
      identity.issueInvitation({ role: "player", ttlMs: 30_000 }).token,
      "Alice",
      "alice-phone",
    );
    const bob = redeemPlayer(
      identity,
      identity.issueInvitation({ role: "player", ttlMs: 30_000 }).token,
      "Bob",
      "bob-phone",
    );
    const carol = redeemPlayer(
      identity,
      identity.issueInvitation({ role: "player", ttlMs: 30_000 }).token,
      "Carol",
      "carol-phone",
    );
    const dana = redeemPlayer(
      identity,
      identity.issueInvitation({ role: "player", ttlMs: 30_000 }).token,
      "Dana",
      "dana-phone",
    );
    const evan = redeemPlayer(
      identity,
      identity.issueInvitation({ role: "player", ttlMs: 30_000 }).token,
      "Evan",
      "evan-phone",
    );
    if (
      alice.status !== "accepted" ||
      bob.status !== "accepted" ||
      carol.status !== "accepted" ||
      dana.status !== "accepted" ||
      evan.status !== "accepted" ||
      !carol.seat ||
      !dana.seat ||
      !evan.seat
    ) {
      throw new Error("Expected five player-seat fixtures.");
    }

    expect(
      identity.releaseSeat({ credentialToken: dana.credential.token }),
    ).toMatchObject({ status: "accepted" });
    expect(
      identity
        .roster()
        .seats.map((seat) => [seat.displayName, seat.displayPosition]),
    ).toEqual([
      ["Alice", 0],
      ["Bob", 1],
      ["Carol", 2],
      ["Evan", 4],
    ]);

    const newcomer = redeemPlayer(
      identity,
      identity.issueInvitation({ role: "player", ttlMs: 30_000 }).token,
      "Faye",
      "faye-phone",
    );
    expect(newcomer).toMatchObject({
      seat: { displayName: "Faye", displayPosition: 3 },
      status: "accepted",
    });

    identity.onHandStarted();
    expect(
      identity.releaseSeat({ credentialToken: carol.credential.token }),
    ).toMatchObject({ status: "accepted" });
    expect(
      identity
        .roster()
        .seats.some((seat) => seat.seatId === carol.seat?.seatId),
    ).toBe(true);
    identity.onHandEnded();
    expect(
      identity
        .roster()
        .seats.some((seat) => seat.seatId === carol.seat?.seatId),
    ).toBe(false);
  });

  it("restores seats, credentials, invitation replay state, and scoped roles", () => {
    const original = createIdentity();
    original.openJoinWindow();
    const playerInvitation = original.issueInvitation({
      role: "player",
      ttlMs: 30_000,
    });
    const player = redeemPlayer(
      original,
      playerInvitation.token,
      "Alice",
      "alice-phone",
    );
    if (player.status !== "accepted" || !player.seat) {
      throw new Error("Expected a restored player fixture.");
    }
    const tvInvitation = original.issueInvitation({
      role: "tv",
      ttlMs: 30_000,
    });
    const tv = original.redeem({
      binding,
      clientInstanceId: "living-room-tv",
      invitationToken: tvInvitation.token,
    });
    if (tv.status !== "accepted") {
      throw new Error("Expected a restored TV fixture.");
    }
    original.onHandStarted();

    const recovered = createRoomIdentity({
      ...binding,
      now: () => 1_000,
      recoveryState: original.exportRecoveryState(),
      secretFactory: () => "fresh-secret-that-is-long-enough",
    });

    expect(recovered.roster()).toEqual(original.roster());
    expect(
      recovered.authenticate({
        binding,
        clientInstanceId: "alice-phone",
        credentialToken: player.credential.token,
        requiredRole: "player",
      }),
    ).toMatchObject({ seatId: player.seat.seatId, status: "accepted" });
    expect(
      recovered.authenticate({
        binding,
        clientInstanceId: "living-room-tv",
        credentialToken: tv.credential.token,
        requiredRole: "tv",
      }),
    ).toMatchObject({ role: "tv", status: "accepted" });
    expect(
      redeemPlayer(
        recovered,
        playerInvitation.token,
        "Mallory",
        "mallory-phone",
      ),
    ).toEqual({ code: "invitation-replayed", status: "rejected" });
  });

  it("rejects recovery state bound to another Trusted Host", () => {
    const original = createIdentity();
    const recoveryState = original.exportRecoveryState();

    expect(() =>
      createRoomIdentity({
        ...binding,
        hostKey: "substituted-host-key",
        recoveryState,
      }),
    ).toThrow("recovery state binding");
  });
});
