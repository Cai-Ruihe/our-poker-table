import { describe, expect, test } from "vitest";

import { TableClientRuntime } from "../../apps/web/src/runtime";
import {
  BUILD_VERSION,
  createReleaseChannel,
  invitationReleaseIssue,
  phaseCryptoContext,
  phaseScopedName,
  RELEASE_CHANNEL,
} from "../../apps/web/src/release-channel";

describe("independent phase release channels", () => {
  const phase1 = createReleaseChannel("phase1");
  const phase2 = createReleaseChannel("phase2");

  test("the default build keeps the Phase 1 version and unprefixed namespaces", () => {
    expect(RELEASE_CHANNEL).toEqual(phase1);
    expect(BUILD_VERSION).toBe("0.1.6");
    expect(phaseScopedName("html-poker-host:table-1", phase1)).toBe(
      "html-poker-host:table-1",
    );
    expect(phaseCryptoContext("join:table-1:request-1", phase1)).toBe(
      "join:table-1:request-1",
    );
  });

  test("Phase 2 has its preview version and separate storage and crypto names", () => {
    expect(phase2.buildVersion).toBe("0.2.0-preview.1");
    expect(phaseScopedName("html-poker-host:table-1", phase2)).toBe(
      "phase2:html-poker-host:table-1",
    );
    expect(phaseScopedName("html-poker-client:table-1:player", phase2)).toBe(
      "phase2:html-poker-client:table-1:player",
    );
    expect(phaseCryptoContext("join:table-1:request-1", phase2)).toBe(
      "phase2:join:table-1:request-1",
    );
  });

  test("incompatible invitations fail before a client runtime opens", () => {
    const binding = {
      buildVersion: phase2.buildVersion,
      hostKey: "host",
      protocolVersion: 2,
      tableId: "table",
    };
    expect(invitationReleaseIssue(binding, [], phase1)).toBe("build");
    expect(() =>
      TableClientRuntime.fromInvitation({
        binding,
        invitationToken: "opaque-token",
        role: "player",
      }),
    ).toThrow(/different version/);
  });

  test("a valid build invitation on the other phase entry path is rejected", () => {
    const binding = {
      buildVersion: phase2.buildVersion,
      hostKey: "host",
      protocolVersion: 2,
      tableId: "table",
    };
    expect(
      invitationReleaseIssue(
        binding,
        ["/multiplayer/", "/table-side/"],
        phase2,
      ),
    ).toBe("path");
    expect(invitationReleaseIssue(binding, ["/multiplayer/"], phase2)).toBe(
      undefined,
    );
  });
});
