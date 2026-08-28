import { describe, expect, it } from "vitest";

import { localizeRuntimeError } from "../../packages/presentation/src/i18n";

describe("Table-side runtime error language", () => {
  it("renders the stale Trusted Host explanation as natural Chinese", () => {
    const message =
      "No route reached the Trusted Host. This table link may be stale after the host or Connection Service restarted. Ask the Trusted Host to refresh the relay ticket and share a new link, or create a new table.";
    expect(localizeRuntimeError("zh", message)).toBe(
      "无法连接到可信主机。主机或连接服务重启后，这个牌桌链接可能已失效。请让可信主机刷新中继凭证并分享新链接，或重新创建牌桌。",
    );
  });

  it("does not expose an untranslated implementation detail in Chinese", () => {
    expect(localizeRuntimeError("zh", "Internal retry code: 4f91")).toBe(
      "暂时无法完成此操作，请检查连接后重试。",
    );
  });

  it("keeps the visible full-screen rejection in natural Chinese", () => {
    expect(
      localizeRuntimeError(
        "zh",
        "Full screen was not accepted by this browser.",
      ),
    ).toBe("浏览器未允许进入全屏模式，请稍后重试。");
  });

  it("keeps an English runtime explanation unchanged", () => {
    expect(localizeRuntimeError("en", "The table did not respond.")).toBe(
      "The table did not respond.",
    );
  });
});
