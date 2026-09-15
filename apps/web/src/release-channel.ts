declare const __HTML_POKER_PHASE2_BUILD__: boolean;

export type ReleasePhase = "phase1" | "phase2";

export interface ReleaseChannel {
  readonly buildVersion: string;
  readonly phase: ReleasePhase;
}

export interface InvitationBuildBinding {
  readonly buildVersion: string;
  readonly protocolVersion: number;
}

export type InvitationReleaseIssue = "build" | "path";

export const PROTOCOL_VERSION = 2;
export const PHASE1_BUILD_VERSION = "0.1.6";
export const PHASE2_BUILD_VERSION = "0.2.0";

export function createReleaseChannel(phase: ReleasePhase): ReleaseChannel {
  return {
    buildVersion:
      phase === "phase2" ? PHASE2_BUILD_VERSION : PHASE1_BUILD_VERSION,
    phase,
  };
}

export const RELEASE_CHANNEL = createReleaseChannel(
  typeof __HTML_POKER_PHASE2_BUILD__ !== "undefined" &&
    __HTML_POKER_PHASE2_BUILD__
    ? "phase2"
    : "phase1",
);

export const BUILD_VERSION = RELEASE_CHANNEL.buildVersion;
export const IS_PHASE2_BUILD = RELEASE_CHANNEL.phase === "phase2";

export function phaseScopedName(
  name: string,
  channel: ReleaseChannel = RELEASE_CHANNEL,
): string {
  return channel.phase === "phase2" ? `phase2:${name}` : name;
}

export function phaseCryptoContext(
  context: string,
  channel: ReleaseChannel = RELEASE_CHANNEL,
): string {
  return channel.phase === "phase2" ? `phase2:${context}` : context;
}

export function phaseForEntryPath(pathname: string): ReleasePhase | undefined {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.includes("table-side")) return "phase1";
  if (segments.includes("multiplayer")) return "phase2";
  return undefined;
}

export function invitationReleaseIssue(
  binding: InvitationBuildBinding,
  pathnames: readonly string[] = [],
  channel: ReleaseChannel = RELEASE_CHANNEL,
): InvitationReleaseIssue | undefined {
  if (
    binding.buildVersion !== channel.buildVersion ||
    binding.protocolVersion !== PROTOCOL_VERSION
  ) {
    return "build";
  }

  if (
    pathnames.some((pathname) => {
      const pathPhase = phaseForEntryPath(pathname);
      return pathPhase !== undefined && pathPhase !== channel.phase;
    })
  ) {
    return "path";
  }
  return undefined;
}
