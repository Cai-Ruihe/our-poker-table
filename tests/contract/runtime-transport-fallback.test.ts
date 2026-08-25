import { describe, expect, it } from "vitest";

import {
  acceptsProjectionRevision,
  sendWithSerialRouteFallback,
  type RoomMessage,
  type RoomRoute,
} from "../../apps/web/src/runtime";

describe("Normal Mode runtime serial relay fallback", () => {
  it("reuses one messageId when a receipt-delayed relay is retried", async () => {
    const message = {
      kind: "table-changed",
      revision: 4,
    } satisfies RoomMessage;
    const attempts: Array<{ messageId: string; route: RoomRoute }> = [];

    const result = await sendWithSerialRouteFallback(
      message,
      ["cloud-relay", "private-relay"],
      async (route, _message, messageId) => {
        attempts.push({ messageId, route });
        if (route === "cloud-relay") {
          throw new Error("receipt delayed after relay accepted the frame");
        }
      },
    );

    expect(result).toEqual({
      messageId: attempts[0]?.messageId,
      route: "private-relay",
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.messageId).toBe(attempts[0]?.messageId);
  });
});

describe("Normal Mode player projection ordering", () => {
  it("does not let a delayed older projection overwrite the newest table revision", () => {
    expect(acceptsProjectionRevision(undefined, 3)).toBe(true);
    expect(acceptsProjectionRevision(3, 3)).toBe(true);
    expect(acceptsProjectionRevision(3, 4)).toBe(true);
    expect(acceptsProjectionRevision(4, 3)).toBe(false);
  });
});
