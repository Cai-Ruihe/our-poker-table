export type ConnectivityRecoveryTrigger = "automatic" | "manual";

/**
 * Retry delays for lifecycle recovery. The coordinator never waits inside a
 * call: an automatic trigger that arrives during the backoff window returns
 * the last failure, so a polling caller cannot create a tight retry loop.
 */
export const CONNECTIVITY_RECOVERY_BACKOFF_MS = [
  1_000, 2_000, 5_000, 10_000, 30_000,
] as const;

export interface ConnectivityRecoveryOptions {
  readonly checkHealthy?: () => Promise<boolean>;
  readonly isHealthy: () => boolean;
  readonly isOnline?: () => boolean;
  readonly maxAutomaticAttempts?: number;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly recover: () => Promise<void>;
}

export interface AuthenticatedLivenessState {
  readonly consecutiveMisses: number;
  readonly unavailable: boolean;
}

/** Keep the Phase 1 quiet-first-two, actionable-on-third policy local. */
export function recordAuthenticatedLivenessMiss(
  state: AuthenticatedLivenessState,
): AuthenticatedLivenessState {
  const consecutiveMisses = Math.min(state.consecutiveMisses + 1, 3);
  return {
    consecutiveMisses,
    unavailable: state.unavailable || consecutiveMisses >= 3,
  };
}

export function resetAuthenticatedLiveness(): AuthenticatedLivenessState {
  return { consecutiveMisses: 0, unavailable: false };
}

function asError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("Connectivity recovery failed.");
}

export class ConnectivityRecoveryBackoffError extends Error {
  readonly failure: Error;

  constructor(failure: Error) {
    super(failure.message);
    this.name = "ConnectivityRecoveryBackoffError";
    this.failure = failure;
  }
}

/**
 * Coalesces foreground, online, and manual recovery triggers for one route.
 * The recovery function owns the actual transport operation; this class only
 * supplies the single-flight and bounded retry policy around it.
 */
export class ConnectivityRecoveryCoordinator {
  private readonly isHealthy: () => boolean;
  private readonly isOnline: () => boolean;
  private readonly maxAutomaticAttempts: number;
  private readonly now: () => number;
  private readonly checkHealthy: (() => Promise<boolean>) | undefined;
  private readonly random: () => number;
  private readonly recover: () => Promise<void>;
  private consecutiveFailures = 0;
  private cooldown = false;
  private inFlight: Promise<void> | undefined;
  private lastError: Error | undefined;
  private nextAttemptAt = 0;

  constructor(options: ConnectivityRecoveryOptions) {
    this.isHealthy = options.isHealthy;
    this.isOnline =
      options.isOnline ??
      (() => typeof navigator === "undefined" || navigator.onLine !== false);
    this.maxAutomaticAttempts = Math.max(
      1,
      Math.floor(options.maxAutomaticAttempts ?? 5),
    );
    this.now = options.now ?? Date.now;
    this.checkHealthy = options.checkHealthy;
    this.random = options.random ?? Math.random;
    this.recover = options.recover;
  }

  run(trigger: ConnectivityRecoveryTrigger = "manual"): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!this.isOnline()) {
      if (trigger === "automatic") return Promise.resolve();
      return Promise.reject(new Error("The device is offline."));
    }

    const operation = Promise.resolve()
      .then(async () => {
        if (this.isHealthy()) {
          const healthy = this.checkHealthy ? await this.checkHealthy() : true;
          if (healthy) {
            this.markHealthy();
            return;
          }
        }
        if (this.cooldown && trigger === "automatic") {
          if (this.now() < this.nextAttemptAt) {
            throw new ConnectivityRecoveryBackoffError(
              this.lastError ??
                new Error("Connectivity recovery is cooling down."),
            );
          }
          this.cooldown = false;
          this.consecutiveFailures = 0;
          this.lastError = undefined;
          this.nextAttemptAt = 0;
        }
        if (this.cooldown && trigger === "manual") {
          this.cooldown = false;
          this.consecutiveFailures = 0;
          this.nextAttemptAt = 0;
        }
        if (trigger === "automatic" && this.now() < this.nextAttemptAt) {
          throw new ConnectivityRecoveryBackoffError(
            this.lastError ??
              new Error("Connectivity recovery is backing off."),
          );
        }
        await this.recover();
      })
      .then(() => {
        if (!this.isHealthy()) {
          throw new Error("Connectivity recovery did not restore the route.");
        }
        this.markHealthy();
      })
      .catch((error: unknown) => {
        if (error instanceof ConnectivityRecoveryBackoffError) throw error;
        const failure = asError(error);
        const retryDelay =
          CONNECTIVITY_RECOVERY_BACKOFF_MS.at(
            Math.min(
              this.consecutiveFailures,
              CONNECTIVITY_RECOVERY_BACKOFF_MS.length - 1,
            ),
          ) ?? 30_000;
        const jitter = 0.75 + Math.min(Math.max(this.random(), 0), 1) * 0.5;
        this.consecutiveFailures += 1;
        this.lastError = failure;
        if (this.consecutiveFailures >= this.maxAutomaticAttempts) {
          this.cooldown = true;
        }
        const delay = this.cooldown ? 30_000 : retryDelay;
        this.nextAttemptAt = this.now() + Math.min(30_000, delay * jitter);
        throw failure;
      })
      .finally(() => {
        if (this.inFlight === operation) this.inFlight = undefined;
      });
    this.inFlight = operation;
    return operation;
  }

  markHealthy(): void {
    this.consecutiveFailures = 0;
    this.cooldown = false;
    this.lastError = undefined;
    this.nextAttemptAt = 0;
  }
}
