export type CapabilityRole = "player" | "public-table" | "tv" | "table-control";

export interface PeerBinding {
  readonly buildVersion: string;
  readonly hostKey: string;
  readonly protocolVersion: number;
  readonly tableId: string;
}

export interface Invitation {
  readonly expiresAt: number;
  readonly role: CapabilityRole;
  readonly seatId?: string;
  readonly token: string;
}

export interface Credential {
  readonly capabilityId: string;
  readonly expiresAt: number;
  readonly role: CapabilityRole;
  readonly token: string;
}

export type SeatLifecycleState = "waiting" | "playing" | "sitting-out";

export interface RoomSeat {
  readonly connected: boolean;
  readonly displayName: string;
  readonly displayPosition: number;
  readonly futureSittingOut: boolean;
  readonly seatId: string;
  readonly state: SeatLifecycleState;
}

export interface RoomRoster {
  readonly capabilities: readonly {
    readonly capabilityId: string;
    readonly role: CapabilityRole;
    readonly revoked: boolean;
    readonly seatId?: string;
  }[];
  readonly handActive: boolean;
  readonly joinWindowOpen: boolean;
  readonly seats: readonly RoomSeat[];
}

export interface RoomIdentityRecoveryInvitation extends Invitation {
  readonly binding: PeerBinding;
  readonly redeemed: boolean;
  readonly revoked: boolean;
}

export interface RoomIdentityRecoveryCredential extends Credential {
  readonly binding: PeerBinding;
  readonly clientInstanceId: string;
  readonly revoked: boolean;
  readonly seatId?: string;
}

export interface RoomIdentityRecoveryState {
  readonly binding: PeerBinding;
  readonly credentials: readonly RoomIdentityRecoveryCredential[];
  readonly handActive: boolean;
  readonly invitations: readonly RoomIdentityRecoveryInvitation[];
  readonly joinWindowOpen: boolean;
  /** Optional so persisted v1 state from before deferred release remains valid. */
  readonly pendingReleaseSeatIds?: readonly string[];
  readonly privacyClass: "host-recovery-secret";
  readonly schemaVersion: 1;
  readonly seats: readonly RoomSeat[];
  readonly seatSequence: number;
}

export type IdentityRejectionCode =
  | "active-client-conflict"
  | "binding-mismatch"
  | "credential-expired"
  | "credential-revoked"
  | "credential-unknown"
  | "invitation-expired"
  | "invitation-revoked"
  | "invitation-replayed"
  | "invitation-unknown"
  | "join-window-closed"
  | "role-mismatch"
  | "seat-unknown"
  | "table-full";

export type IdentityMutationResult =
  | { readonly status: "accepted" }
  | { readonly code: IdentityRejectionCode; readonly status: "rejected" };

export type SeatReleaseResult =
  | {
      readonly releasedImmediately: boolean;
      readonly seatId: string;
      readonly status: "accepted";
    }
  | { readonly code: IdentityRejectionCode; readonly status: "rejected" };

export type AuthenticationResult =
  | {
      readonly capabilityId: string;
      readonly role: CapabilityRole;
      readonly seatId?: string;
      readonly status: "accepted";
    }
  | { readonly code: IdentityRejectionCode; readonly status: "rejected" };

export type RedemptionResult =
  | {
      readonly credential: Credential;
      readonly role: CapabilityRole;
      readonly seat?: RoomSeat;
      readonly status: "accepted";
    }
  | { readonly code: IdentityRejectionCode; readonly status: "rejected" };

export interface RoomIdentity {
  authenticate(input: {
    readonly binding: PeerBinding;
    readonly clientInstanceId: string;
    readonly credentialToken: string;
    readonly requiredRole?: CapabilityRole;
  }): AuthenticationResult;
  closeJoinWindow(): void;
  exportRecoveryState(): RoomIdentityRecoveryState;
  issueInvitation(input: {
    readonly role: CapabilityRole;
    readonly seatId?: string;
    readonly ttlMs: number;
  }): Invitation;
  onHandEnded(): void;
  onHandStarted(): void;
  openJoinWindow(): void;
  releaseSeat(input: { readonly credentialToken: string }): SeatReleaseResult;
  redeem(input: {
    readonly binding: PeerBinding;
    readonly clientInstanceId: string;
    readonly displayName?: string;
    readonly invitationToken: string;
  }): RedemptionResult;
  revoke(capabilityId: string): IdentityMutationResult;
  roster(): RoomRoster;
  setConnected(input: {
    readonly connected: boolean;
    readonly credentialToken: string;
  }): IdentityMutationResult;
  setDisplayPosition(input: {
    readonly displayPosition: number;
    readonly seatId: string;
  }): IdentityMutationResult;
  setFutureParticipation(input: {
    readonly credentialToken: string;
    readonly sittingOut: boolean;
  }): IdentityMutationResult;
}

export interface RoomIdentityOptions extends PeerBinding {
  readonly credentialTtlMs?: number;
  readonly now?: () => number;
  readonly recoveryState?: RoomIdentityRecoveryState;
  readonly secretFactory?: () => string;
}

interface InvitationRecord extends Invitation {
  readonly binding: PeerBinding;
  redeemed: boolean;
  revoked: boolean;
}

interface CredentialRecord extends Credential {
  readonly binding: PeerBinding;
  readonly clientInstanceId: string;
  revoked: boolean;
  readonly seatId?: string;
}

interface MutableRoomSeat {
  connected: boolean;
  displayName: string;
  displayPosition: number;
  futureSittingOut: boolean;
  seatId: string;
  state: SeatLifecycleState;
}

function defaultSecret(): string {
  return `${globalThis.crypto.randomUUID()}-${globalThis.crypto.randomUUID()}`;
}

function sameBinding(left: PeerBinding, right: PeerBinding): boolean {
  return (
    left.buildVersion === right.buildVersion &&
    left.hostKey === right.hostKey &&
    left.protocolVersion === right.protocolVersion &&
    left.tableId === right.tableId
  );
}

function cloneSeat(seat: MutableRoomSeat): RoomSeat {
  return { ...seat };
}

const capabilityRoles = new Set<CapabilityRole>([
  "player",
  "public-table",
  "tv",
  "table-control",
]);
const seatStates = new Set<SeatLifecycleState>([
  "waiting",
  "playing",
  "sitting-out",
]);

function assertRecoveryState(
  state: RoomIdentityRecoveryState,
  authorityBinding: PeerBinding,
): void {
  if (
    state.schemaVersion !== 1 ||
    state.privacyClass !== "host-recovery-secret"
  ) {
    throw new Error("The identity recovery state schema is unsupported.");
  }
  if (!sameBinding(state.binding, authorityBinding)) {
    throw new Error("The identity recovery state binding does not match.");
  }
  if (
    !Number.isInteger(state.seatSequence) ||
    state.seatSequence < state.seats.length ||
    state.seats.length > 10
  ) {
    throw new Error("The identity recovery state seat sequence is corrupt.");
  }
  const seatIds = new Set<string>();
  const positions = new Set<number>();
  for (const seat of state.seats) {
    if (
      typeof seat.seatId !== "string" ||
      !seat.seatId ||
      typeof seat.displayName !== "string" ||
      !seat.displayName ||
      !Number.isInteger(seat.displayPosition) ||
      seat.displayPosition < 0 ||
      seat.displayPosition >= 10 ||
      !seatStates.has(seat.state) ||
      typeof seat.connected !== "boolean" ||
      typeof seat.futureSittingOut !== "boolean" ||
      seatIds.has(seat.seatId) ||
      positions.has(seat.displayPosition)
    ) {
      throw new Error("The identity recovery state seat roster is corrupt.");
    }
    seatIds.add(seat.seatId);
    positions.add(seat.displayPosition);
  }
  const pendingRelease = state.pendingReleaseSeatIds ?? [];
  if (
    !Array.isArray(pendingRelease) ||
    new Set(pendingRelease).size !== pendingRelease.length ||
    pendingRelease.some((seatId) => !seatIds.has(seatId))
  ) {
    throw new Error(
      "The identity recovery state pending release set is corrupt.",
    );
  }
  const invitationTokens = new Set<string>();
  for (const invitation of state.invitations) {
    if (
      typeof invitation.token !== "string" ||
      !invitation.token ||
      !Number.isFinite(invitation.expiresAt) ||
      !capabilityRoles.has(invitation.role) ||
      !sameBinding(invitation.binding, authorityBinding) ||
      typeof invitation.redeemed !== "boolean" ||
      typeof invitation.revoked !== "boolean" ||
      invitationTokens.has(invitation.token) ||
      (invitation.seatId !== undefined &&
        (invitation.role !== "player" || !seatIds.has(invitation.seatId)))
    ) {
      throw new Error("The identity recovery state invitation set is corrupt.");
    }
    invitationTokens.add(invitation.token);
  }
  const credentialTokens = new Set<string>();
  const capabilityIds = new Set<string>();
  for (const credential of state.credentials) {
    if (
      typeof credential.token !== "string" ||
      !credential.token ||
      typeof credential.capabilityId !== "string" ||
      !credential.capabilityId ||
      typeof credential.clientInstanceId !== "string" ||
      !credential.clientInstanceId ||
      !Number.isFinite(credential.expiresAt) ||
      !capabilityRoles.has(credential.role) ||
      !sameBinding(credential.binding, authorityBinding) ||
      typeof credential.revoked !== "boolean" ||
      credentialTokens.has(credential.token) ||
      capabilityIds.has(credential.capabilityId) ||
      (credential.role === "player"
        ? !credential.seatId ||
          (!credential.revoked && !seatIds.has(credential.seatId))
        : credential.seatId !== undefined)
    ) {
      throw new Error("The identity recovery state credential set is corrupt.");
    }
    credentialTokens.add(credential.token);
    capabilityIds.add(credential.capabilityId);
  }
}

export function createRoomIdentity(options: RoomIdentityOptions): RoomIdentity {
  const now = options.now ?? Date.now;
  const secretFactory = options.secretFactory ?? defaultSecret;
  const credentialTtlMs = options.credentialTtlMs ?? 24 * 60 * 60 * 1_000;
  const authorityBinding: PeerBinding = {
    buildVersion: options.buildVersion,
    hostKey: options.hostKey,
    protocolVersion: options.protocolVersion,
    tableId: options.tableId,
  };
  const invitations = new Map<string, InvitationRecord>();
  const credentials = new Map<string, CredentialRecord>();
  const seats: MutableRoomSeat[] = [];
  const pendingReleaseSeatIds = new Set<string>();
  let joinWindowOpen = false;
  let handActive = false;
  let seatSequence = 0;

  if (options.recoveryState) {
    assertRecoveryState(options.recoveryState, authorityBinding);
    joinWindowOpen = options.recoveryState.joinWindowOpen;
    handActive = options.recoveryState.handActive;
    seatSequence = options.recoveryState.seatSequence;
    for (const seat of options.recoveryState.seats) seats.push({ ...seat });
    for (const seatId of options.recoveryState.pendingReleaseSeatIds ?? []) {
      pendingReleaseSeatIds.add(seatId);
    }
    for (const invitation of options.recoveryState.invitations) {
      invitations.set(invitation.token, {
        ...invitation,
        binding: { ...invitation.binding },
      });
    }
    for (const credential of options.recoveryState.credentials) {
      credentials.set(credential.token, {
        ...credential,
        binding: { ...credential.binding },
      });
    }
  }

  function findCredential(
    credentialToken: string,
  ): CredentialRecord | IdentityRejectionCode {
    const credential = credentials.get(credentialToken);
    if (!credential) return "credential-unknown";
    if (credential.revoked) return "credential-revoked";
    if (credential.expiresAt <= now()) return "credential-expired";
    return credential;
  }

  function createCredential(
    role: CapabilityRole,
    clientInstanceId: string,
    seatId?: string,
  ): CredentialRecord {
    const token = secretFactory();
    const record: CredentialRecord = {
      binding: authorityBinding,
      capabilityId: `capability-${secretFactory()}`,
      clientInstanceId,
      expiresAt: now() + credentialTtlMs,
      revoked: false,
      role,
      ...(seatId ? { seatId } : {}),
      token,
    };
    credentials.set(token, record);
    return record;
  }

  function publicCredential(record: CredentialRecord): Credential {
    return {
      capabilityId: record.capabilityId,
      expiresAt: record.expiresAt,
      role: record.role,
      token: record.token,
    };
  }

  function authenticate(
    input: Parameters<RoomIdentity["authenticate"]>[0],
  ): AuthenticationResult {
    const found = findCredential(input.credentialToken);
    if (typeof found === "string") {
      return { code: found, status: "rejected" };
    }
    if (!sameBinding(found.binding, input.binding)) {
      return { code: "binding-mismatch", status: "rejected" };
    }
    if (found.clientInstanceId !== input.clientInstanceId) {
      return { code: "active-client-conflict", status: "rejected" };
    }
    if (input.requiredRole && found.role !== input.requiredRole) {
      return { code: "role-mismatch", status: "rejected" };
    }
    return {
      capabilityId: found.capabilityId,
      role: found.role,
      ...(found.seatId ? { seatId: found.seatId } : {}),
      status: "accepted",
    };
  }

  function issueInvitation(
    input: Parameters<RoomIdentity["issueInvitation"]>[0],
  ): Invitation {
    if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) {
      throw new Error("Invitation TTL must be a positive finite duration.");
    }
    if (input.seatId && !seats.some((seat) => seat.seatId === input.seatId)) {
      throw new Error("A replacement invitation requires an existing seat.");
    }
    if (input.seatId && input.role !== "player") {
      throw new Error("Only a Player Seat Credential can be replaced.");
    }
    for (const invitation of invitations.values()) {
      if (invitation.role === input.role && !invitation.redeemed) {
        invitation.revoked = true;
      }
    }
    const record: InvitationRecord = {
      binding: authorityBinding,
      expiresAt: now() + input.ttlMs,
      redeemed: false,
      role: input.role,
      revoked: false,
      ...(input.seatId ? { seatId: input.seatId } : {}),
      token: secretFactory(),
    };
    invitations.set(record.token, record);
    return {
      expiresAt: record.expiresAt,
      role: record.role,
      ...(record.seatId ? { seatId: record.seatId } : {}),
      token: record.token,
    };
  }

  function firstVacantDisplayPosition(): number | undefined {
    const occupied = new Set(seats.map((seat) => seat.displayPosition));
    for (let position = 0; position < 10; position += 1) {
      if (!occupied.has(position)) return position;
    }
    return undefined;
  }

  function removeSeat(seatId: string): void {
    const index = seats.findIndex((seat) => seat.seatId === seatId);
    if (index < 0) return;
    seats.splice(index, 1);
    pendingReleaseSeatIds.delete(seatId);
    for (const credential of credentials.values()) {
      // Retain a revoked record instead of forgetting it outright. A departed
      // browser must receive a clear credential-revoked response, rather than
      // an ambiguous "unknown credential" result after host recovery.
      if (credential.seatId === seatId) credential.revoked = true;
    }
    for (const [token, invitation] of invitations) {
      if (invitation.seatId === seatId) invitations.delete(token);
    }
  }

  function redeem(
    input: Parameters<RoomIdentity["redeem"]>[0],
  ): RedemptionResult {
    const invitation = invitations.get(input.invitationToken);
    if (!invitation) {
      return { code: "invitation-unknown", status: "rejected" };
    }
    if (invitation.revoked) {
      return { code: "invitation-revoked", status: "rejected" };
    }
    if (invitation.redeemed) {
      return { code: "invitation-replayed", status: "rejected" };
    }
    if (invitation.expiresAt <= now()) {
      return { code: "invitation-expired", status: "rejected" };
    }
    if (
      !sameBinding(invitation.binding, input.binding) ||
      !sameBinding(authorityBinding, input.binding)
    ) {
      return { code: "binding-mismatch", status: "rejected" };
    }
    const replacingSeat = invitation.seatId
      ? seats.find((seat) => seat.seatId === invitation.seatId)
      : undefined;
    if (invitation.role === "player" && !replacingSeat && !joinWindowOpen) {
      return { code: "join-window-closed", status: "rejected" };
    }
    if (
      invitation.role === "player" &&
      !replacingSeat &&
      firstVacantDisplayPosition() === undefined
    ) {
      return { code: "table-full", status: "rejected" };
    }
    if (invitation.seatId && !replacingSeat) {
      return { code: "seat-unknown", status: "rejected" };
    }

    let seat: MutableRoomSeat | undefined;
    if (invitation.role === "player") {
      if (replacingSeat) {
        for (const credential of credentials.values()) {
          if (credential.seatId === replacingSeat.seatId)
            credential.revoked = true;
        }
        replacingSeat.connected = true;
        seat = replacingSeat;
      } else {
        const displayName = input.displayName?.trim();
        if (!displayName) {
          return { code: "seat-unknown", status: "rejected" };
        }
        seatSequence += 1;
        const displayPosition = firstVacantDisplayPosition();
        if (displayPosition === undefined) {
          return { code: "table-full", status: "rejected" };
        }
        seat = {
          connected: true,
          displayName,
          displayPosition,
          futureSittingOut: false,
          seatId: `seat-${seatSequence}`,
          state: "waiting",
        };
        seats.push(seat);
      }
    }

    invitation.redeemed = true;
    const credential = createCredential(
      invitation.role,
      input.clientInstanceId,
      seat?.seatId,
    );
    return {
      credential: publicCredential(credential),
      role: invitation.role,
      ...(seat ? { seat: cloneSeat(seat) } : {}),
      status: "accepted",
    };
  }

  function mutateSeatFromCredential(
    credentialToken: string,
    mutation: (seat: MutableRoomSeat) => void,
  ): IdentityMutationResult {
    const found = findCredential(credentialToken);
    if (typeof found === "string") {
      return { code: found, status: "rejected" };
    }
    if (found.role !== "player" || !found.seatId) {
      return { code: "role-mismatch", status: "rejected" };
    }
    const seat = seats.find((candidate) => candidate.seatId === found.seatId);
    if (!seat) return { code: "seat-unknown", status: "rejected" };
    mutation(seat);
    return { status: "accepted" };
  }

  return {
    authenticate,
    closeJoinWindow() {
      joinWindowOpen = false;
      for (const invitation of invitations.values()) {
        if (invitation.role === "player" && !invitation.redeemed) {
          invitation.revoked = true;
        }
      }
    },
    exportRecoveryState() {
      return {
        binding: { ...authorityBinding },
        credentials: [...credentials.values()].map((credential) => ({
          ...credential,
          binding: { ...credential.binding },
        })),
        handActive,
        invitations: [...invitations.values()].map((invitation) => ({
          ...invitation,
          binding: { ...invitation.binding },
        })),
        joinWindowOpen,
        pendingReleaseSeatIds: [...pendingReleaseSeatIds],
        privacyClass: "host-recovery-secret",
        schemaVersion: 1,
        seats: seats.map(cloneSeat),
        seatSequence,
      };
    },
    issueInvitation,
    onHandEnded() {
      handActive = false;
      for (const seat of seats) {
        if (
          seat.state === "playing" &&
          (!seat.connected || seat.futureSittingOut)
        ) {
          seat.state = "sitting-out";
        }
      }
      for (const seatId of [...pendingReleaseSeatIds]) removeSeat(seatId);
    },
    onHandStarted() {
      handActive = true;
      for (const seat of seats) {
        if (seat.connected && !seat.futureSittingOut) seat.state = "playing";
        else seat.state = "sitting-out";
      }
    },
    openJoinWindow() {
      for (const invitation of invitations.values()) {
        if (invitation.role === "player" && !invitation.redeemed) {
          invitation.revoked = true;
        }
      }
      joinWindowOpen = true;
    },
    releaseSeat(input) {
      const found = findCredential(input.credentialToken);
      if (typeof found === "string") {
        return { code: found, status: "rejected" };
      }
      if (found.role !== "player" || !found.seatId) {
        return { code: "role-mismatch", status: "rejected" };
      }
      if (!seats.some((seat) => seat.seatId === found.seatId)) {
        return { code: "seat-unknown", status: "rejected" };
      }
      if (handActive) {
        pendingReleaseSeatIds.add(found.seatId);
        return {
          releasedImmediately: false,
          seatId: found.seatId,
          status: "accepted",
        };
      }
      removeSeat(found.seatId);
      return {
        releasedImmediately: true,
        seatId: found.seatId,
        status: "accepted",
      };
    },
    redeem,
    revoke(capabilityId) {
      const credential = [...credentials.values()].find(
        (candidate) => candidate.capabilityId === capabilityId,
      );
      if (!credential)
        return { code: "credential-unknown", status: "rejected" };
      credential.revoked = true;
      return { status: "accepted" };
    },
    roster() {
      return {
        capabilities: [...credentials.values()].map((credential) => ({
          capabilityId: credential.capabilityId,
          role: credential.role,
          revoked: credential.revoked,
          ...(credential.seatId ? { seatId: credential.seatId } : {}),
        })),
        handActive,
        joinWindowOpen,
        seats: seats.map(cloneSeat),
      };
    },
    setConnected(input) {
      return mutateSeatFromCredential(input.credentialToken, (seat) => {
        seat.connected = input.connected;
      });
    },
    setDisplayPosition(input) {
      if (
        !Number.isInteger(input.displayPosition) ||
        input.displayPosition < 0 ||
        input.displayPosition >= 10
      ) {
        return { code: "seat-unknown", status: "rejected" };
      }
      const moving = seats.find((seat) => seat.seatId === input.seatId);
      if (!moving) return { code: "seat-unknown", status: "rejected" };
      const occupant = seats.find(
        (seat) =>
          seat.seatId !== moving.seatId &&
          seat.displayPosition === input.displayPosition,
      );
      if (occupant) occupant.displayPosition = moving.displayPosition;
      moving.displayPosition = input.displayPosition;
      return { status: "accepted" };
    },
    setFutureParticipation(input) {
      return mutateSeatFromCredential(input.credentialToken, (seat) => {
        seat.futureSittingOut = input.sittingOut;
      });
    },
  };
}
