import { describe, expect, it, vi } from "vitest";

import {
  ConnectivityRecoveryBackoffError,
  ConnectivityRecoveryCoordinator,
  recordAuthenticatedLivenessMiss,
  resetAuthenticatedLiveness,
} from "../../apps/web/src/connection-recovery";

describe("revision 4 connectivity recovery", () => {
  it("keeps host pairing authority out of invitations, role projections, and client recovery", async () => {
    const { HostTableRuntime, TableClientRuntime } =
      await import("../../apps/web/src/runtime");
    const route = {
      url: "wss://relay.example",
      accessToken: "peer-ticket",
      expiresAt: 123456,
      peerId: "peer",
      pairingWriteCapability: "host-only-canary",
    };
    const routes = { cloudRelay: route, privateRelay: route };
    const host = {
      relayRoutesByInvitationToken: new Map([["invite", routes]]),
      relayRoutesByPeerId: new Map([["peer", routes]]),
      rulesProfile: { id: "digital-nlhe-home-v1" },
      identity: {
        roster: () => ({ seats: [{ seatId: "seat", displayName: "Alice" }] }),
      },
    };
    const invited = Reflect.apply(
      HostTableRuntime.prototype.relayRoutesForInvitation,
      host,
      [{ token: "invite" }],
    );
    expect(JSON.stringify(invited)).not.toContain("host-only-canary");
    expect(invited.cloudRelay.accessToken).toBe("peer-ticket");
    for (const role of ["player", "public-table", "tv"]) {
      const projected = Reflect.apply(
        Reflect.get(HostTableRuntime.prototype, "capabilityProjection"),
        host,
        [role, "seat", "peer"],
      );
      expect(projected).toEqual(expect.objectContaining({ status: "waiting" }));
      expect(JSON.stringify(projected)).not.toContain("pairingWriteCapability");
      expect(projected).toEqual(
        expect.objectContaining({
          relayRoutes: expect.objectContaining({
            cloudRelay: expect.objectContaining({ peerId: "peer" }),
          }),
        }),
      );
    }
    const commit = vi.fn(async () => ({ status: "committed" }));
    const client = {
      endpoint: { updateRelayRoutes: vi.fn() },
      credential: { capabilityId: "seat" },
      binding: {},
      recoveryCommitTail: Promise.resolve(),
      recoveryRevision: 0,
      recoveryStore: { commit },
      role: "player",
      slotId: "slot",
    };
    Reflect.apply(
      Reflect.get(TableClientRuntime.prototype, "updateRelayRoutes"),
      client,
      [routes],
    );
    await Reflect.apply(
      Reflect.get(TableClientRuntime.prototype, "persistRecovery"),
      client,
      [],
    );
    expect(commit).toHaveBeenCalledOnce();
    expect(JSON.stringify(commit.mock.calls)).not.toContain("host-only-canary");
    expect(
      JSON.stringify(client.endpoint.updateRelayRoutes.mock.calls),
    ).not.toContain("pairingWriteCapability");
    expect(route.pairingWriteCapability).toBe("host-only-canary");
  });

  it("reports a manual reconnect sharing automatic backoff without counting a new probe", async () => {
    const { TableClientRuntime } = await import("../../apps/web/src/runtime");
    const backoff = new ConnectivityRecoveryBackoffError(
      new Error("relay unavailable"),
    );
    const captureError = vi.fn();
    const client = {
      credential: {},
      endpoint: {
        resume: vi.fn(async () => {
          throw backoff;
        }),
      },
      routeRecoveryMisses: 1,
      captureError,
      refresh: vi.fn(),
    };
    const resume = (trigger: "automatic" | "manual") =>
      Reflect.apply(TableClientRuntime.prototype.resumeConnectivity, client, [
        trigger,
      ]);
    await expect(resume("automatic")).resolves.toBeUndefined();
    expect(captureError).not.toHaveBeenCalled();
    await expect(resume("manual")).rejects.toBe(backoff);
    expect(captureError).toHaveBeenCalledOnce();
    expect(client.routeRecoveryMisses).toBe(1);
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it("keeps a healthy relay connection in place", async () => {
    let socketCloseCount = 0;
    const recover = vi.fn(async () => {
      socketCloseCount += 1;
    });
    const coordinator = new ConnectivityRecoveryCoordinator({
      checkHealthy: async () => true,
      isHealthy: () => true,
      recover,
    });

    await coordinator.run("automatic");

    expect(recover).not.toHaveBeenCalled();
    expect(socketCloseCount).toBe(0);
  });

  it("rebuilds a half-open relay once after its receipt probe fails", async () => {
    let healthy = true;
    let socketCloseCount = 0;
    const checkHealthy = vi.fn(async () => {
      if (checkHealthy.mock.calls.length === 1) {
        healthy = false;
        socketCloseCount += 1;
        return false;
      }
      return healthy;
    });
    const recover = vi.fn(async () => {
      healthy = true;
    });
    const coordinator = new ConnectivityRecoveryCoordinator({
      checkHealthy,
      isHealthy: () => healthy,
      recover,
    });

    await expect(coordinator.run("automatic")).resolves.toBeUndefined();
    await expect(coordinator.run("automatic")).resolves.toBeUndefined();

    expect(checkHealthy).toHaveBeenCalledTimes(2);
    expect(socketCloseCount).toBe(1);
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent recovery triggers into one flight", async () => {
    let healthy = false;
    let release: (() => void) | undefined;
    const recover = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            healthy = true;
            resolve();
          };
        }),
    );
    const coordinator = new ConnectivityRecoveryCoordinator({
      isHealthy: () => healthy,
      recover,
    });

    const first = coordinator.run("automatic");
    const second = coordinator.run("manual");
    expect(second).toBe(first);
    await Promise.resolve();
    expect(recover).toHaveBeenCalledTimes(1);

    release?.();
    await expect(first).resolves.toBeUndefined();
  });

  it("bounds failed automatic retries and permits recovery after the backoff", async () => {
    let currentTime = 0;
    let healthy = false;
    let attempts = 0;
    const recover = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("relay unavailable");
      }
      healthy = true;
    });
    const coordinator = new ConnectivityRecoveryCoordinator({
      isHealthy: () => healthy,
      now: () => currentTime,
      random: () => 0.5,
      recover,
    });

    await expect(coordinator.run("automatic")).rejects.toThrow(
      "relay unavailable",
    );
    await expect(coordinator.run("automatic")).rejects.toThrow(
      "relay unavailable",
    );
    expect(recover).toHaveBeenCalledTimes(1);

    currentTime = 1_000;
    await expect(coordinator.run("automatic")).resolves.toBeUndefined();
    expect(recover).toHaveBeenCalledTimes(2);
  });

  it("skips automatic recovery while offline and enters cooldown after bounded failures", async () => {
    let online = false;
    let healthy = false;
    let currentTime = 0;
    let attempts = 0;
    const recover = vi.fn(async () => {
      attempts += 1;
      if (attempts === 3) {
        healthy = true;
        return;
      }
      throw new Error(`relay failure ${attempts}`);
    });
    const coordinator = new ConnectivityRecoveryCoordinator({
      isHealthy: () => healthy,
      isOnline: () => online,
      maxAutomaticAttempts: 2,
      now: () => currentTime,
      random: () => 0.5,
      recover,
    });

    await expect(coordinator.run("automatic")).resolves.toBeUndefined();
    expect(recover).not.toHaveBeenCalled();

    online = true;
    await expect(coordinator.run("automatic")).rejects.toThrow(
      "relay failure 1",
    );
    currentTime = 1_000;
    await expect(coordinator.run("automatic")).rejects.toThrow(
      "relay failure 2",
    );
    currentTime = 2_999;
    await expect(coordinator.run("automatic")).rejects.toThrow(
      "relay failure 2",
    );
    expect(recover).toHaveBeenCalledTimes(2);

    currentTime = 33_000;
    await expect(coordinator.run("automatic")).resolves.toBeUndefined();
    expect(recover).toHaveBeenCalledTimes(3);
  });

  it("keeps transient authenticated liveness misses quiet and clears the warning on a valid frame", () => {
    const first = recordAuthenticatedLivenessMiss(resetAuthenticatedLiveness());
    const second = recordAuthenticatedLivenessMiss(first);
    const third = recordAuthenticatedLivenessMiss(second);

    expect(first).toEqual({ consecutiveMisses: 1, unavailable: false });
    expect(second).toEqual({ consecutiveMisses: 2, unavailable: false });
    expect(third).toEqual({ consecutiveMisses: 3, unavailable: true });
    expect(resetAuthenticatedLiveness()).toEqual({
      consecutiveMisses: 0,
      unavailable: false,
    });
  });
});
