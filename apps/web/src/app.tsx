import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";

import type { CapabilityRole } from "@html-poker/identity-capabilities";
import type { CardStyle, TableTheme } from "@html-poker/game-core";
import {
  LanguageProvider,
  LanguageSwitch,
  TableSurface,
  languageFromUrl,
  readStoredLanguage,
  tableSeatPosition,
  useLanguage,
} from "@html-poker/presentation";

import brandHorizontalLight from "../../../assets/brand/svg/horizontal-light-transparent.svg?inline";
import brandSymbolGold from "../../../assets/brand/svg/symbol-gold.svg?inline";
import brandSymbolGreen from "../../../assets/brand/svg/symbol-green.svg?inline";

import {
  BUILD_VERSION,
  createTableSideDisplayPairingRequest,
  HostTableRuntime,
  TableClientRuntime,
  invitationUrl,
  isAirplaneMode,
  tableSideDisplayPairingIsConfigured,
  tableSideRelayRequiresOperatorToken,
  parseClientRecovery,
  parseHostRecovery,
  parseHostPlayerRecovery,
  parseInvitation,
  replaceWithHostRecoveryUrl,
  type ClientRuntimeSnapshot,
  type AirplaneOfferDetails,
  type HostRuntimeSnapshot,
  type HostRuntimeCreateOptions,
  type TableSideDisplayPairingRequest,
  type PlayerAction,
} from "./runtime";

interface CapabilityCheck {
  readonly available: boolean;
  readonly label: string;
}

interface ScreenWakeLockSentinel {
  readonly released: boolean;
  release(): Promise<void>;
}

const PRODUCT_NAME = "Our Poker Table";
// Table-side Mode table surfaces place names around a finite physical table. Keep
// the input bounded here (rather than in the shared identity protocol) so the
// Airplane artifact retains its existing behaviour.
const TABLE_SIDE_DISPLAY_NAME_MAX_LENGTH = 24;

function localizedInvitationUrl(
  location: Location,
  runtime: HostTableRuntime,
  invitation: Parameters<typeof invitationUrl>[2],
  language: "en" | "zh",
): string {
  const url = new URL(invitationUrl(location, runtime, invitation));
  url.searchParams.set("lang", language);
  return url.toString();
}

interface ScreenWakeLockManager {
  request(type: "screen"): Promise<ScreenWakeLockSentinel>;
}

function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let sentinel: ScreenWakeLockSentinel | undefined;
    const manager = (
      globalThis.navigator as Navigator & {
        readonly wakeLock?: ScreenWakeLockManager;
      }
    ).wakeLock;
    if (!manager) return;

    async function request() {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        sentinel = await manager.request("screen");
      } catch {
        // Best effort: browser or power policy may refuse the request.
      }
    }

    function restoreWhenVisible() {
      if (
        document.visibilityState === "visible" &&
        sentinel?.released !== false
      ) {
        void request();
      }
    }

    void request();
    document.addEventListener("visibilitychange", restoreWhenVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", restoreWhenVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}

function capabilityChecks(): readonly CapabilityCheck[] {
  return [
    {
      available:
        typeof globalThis.crypto?.randomUUID === "function" &&
        typeof globalThis.crypto?.subtle === "object",
      label: "Secure card and message cryptography",
    },
    {
      available: "indexedDB" in globalThis,
      label: "Durable table recovery",
    },
    {
      available: "BroadcastChannel" in globalThis,
      label: "Nearby browser channel",
    },
    {
      available: "structuredClone" in globalThis,
      label: "Isolated state projections",
    },
    {
      available: "locks" in globalThis.navigator || "indexedDB" in globalThis,
      label: "Exclusive Trusted Host recovery",
    },
  ];
}

function BrandBar({ aside }: { readonly aside?: ReactNode }) {
  const { t } = useLanguage();
  const brandLockup = (
    <div aria-label={PRODUCT_NAME} className="brand-lockup" role="img">
      <img
        alt=""
        aria-hidden="true"
        className="brand-lockup__wordmark"
        src={brandHorizontalLight}
      />
      <div className="brand-lockup__compact" aria-hidden="true">
        <img alt="" src={brandSymbolGreen} />
        <strong>{PRODUCT_NAME}</strong>
      </div>
    </div>
  );

  return (
    <header className="brand-bar">
      {isAirplaneMode() ? (
        brandLockup
      ) : (
        <a
          aria-label={t("Open Our Poker Table introduction")}
          className="brand-lockup-link"
          href="../intro/"
        >
          {brandLockup}
        </a>
      )}
      {aside}
    </header>
  );
}

function Home({
  onCreate,
  onJoinAirplane,
  onJoinSession,
  onPairDisplay,
}: {
  readonly onCreate: (options: HostRuntimeCreateOptions) => Promise<void>;
  readonly onJoinAirplane?: () => void;
  readonly onJoinSession: (url: string) => void;
  readonly onPairDisplay?: () => void;
}) {
  const { language, t } = useLanguage();
  const digitalChipsEnabled =
    new URLSearchParams(globalThis.location.search).get("experimental") ===
    "digital-chips";
  const checks = useMemo(capabilityChecks, []);
  const ready = checks.every((check) => check.available);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [operatorToken, setOperatorToken] = useState("");
  const [joinError, setJoinError] = useState<string>();
  const [joinScannerOpen, setJoinScannerOpen] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const [chipMode, setChipMode] = useState<"digital" | "physical">("physical");
  const [startingStack, setStartingStack] = useState(100);
  const [smallBlind, setSmallBlind] = useState(1);
  const [bigBlind, setBigBlind] = useState(2);
  const relayRequiresOperatorToken = tableSideRelayRequiresOperatorToken();
  const digitalRulesValid =
    Number.isSafeInteger(startingStack) &&
    Number.isSafeInteger(smallBlind) &&
    Number.isSafeInteger(bigBlind) &&
    smallBlind > 0 &&
    bigBlind > smallBlind &&
    startingStack > bigBlind;

  async function create() {
    setBusy(true);
    setError(undefined);
    try {
      await onCreate({
        ...(operatorToken.trim()
          ? { operatorToken: operatorToken.trim() }
          : {}),
        rulesProfile:
          chipMode === "physical"
            ? { id: "deal-only-v1" }
            : {
                bigBlind,
                housePolicyId: "p2-house-1",
                id: "nlhe-home-v1",
                smallBlind,
                startingStack,
              },
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The table could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  function openInvitation(rawValue: string): void {
    setJoinError(undefined);
    try {
      const url = new URL(rawValue.trim(), globalThis.location.href);
      if (!parseInvitation(url.hash)) {
        throw new Error(
          "This is not a complete Our Poker Table invitation URL. Ask the host for the current player link.",
        );
      }
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Invitation links must use HTTP or HTTPS.");
      }
      onJoinSession(url.toString());
    } catch (caught) {
      setJoinError(
        caught instanceof Error
          ? caught.message
          : "The invitation URL could not be opened.",
      );
    }
  }

  return (
    <main className="home-shell">
      <BrandBar
        aside={<span className="build-label">Build {BUILD_VERSION}</span>}
      />
      <div className="home-language-control">
        <LanguageSwitch />
      </div>
      <div className="home-layout">
        <section className="home-intro" aria-labelledby="home-title">
          <p className="section-label">
            {t("For the table already in front of you")}
          </p>
          <h1 id="home-title">
            {language === "zh"
              ? "发牌交给我，牌局由你掌握"
              : t("Deal cards. Keep poker yours.")}
          </h1>
          <p className="home-intro__copy">
            {t(
              "Phones hold private cards. A tablet or TV shows the board. Chips and conversation stay on the physical table.",
            )}
          </p>
          <div className="deck-statement" aria-hidden="true">
            <span>52</span>
            <div>
              <strong>{t("cards")}</strong>
              <small>{t("one trusted host browser")}</small>
            </div>
          </div>
        </section>

        <section className="start-panel" aria-labelledby="start-title">
          <div>
            <p className="section-label">{t("Trusted Host")}</p>
            <h2 id="start-title">{t("Create a table")}</h2>
            <p>
              {t(
                "This browser will shuffle, deal, and keep the authoritative hand history. It can read the active deck by design.",
              )}
            </p>
          </div>
          <ul
            className="preflight-list"
            aria-label={t("Browser capability check")}
          >
            {checks.map((check) => (
              <li key={check.label} data-ready={check.available}>
                <span aria-hidden="true">{check.available ? "✓" : "×"}</span>
                {t(check.label)}
              </li>
            ))}
          </ul>
          {!ready ? (
            <p className="inline-warning" role="alert">
              {t(
                "This browser cannot safely host a table. Open the HTTPS local preview in a current browser.",
              )}
            </p>
          ) : null}
          {digitalChipsEnabled ? (
            <fieldset className="chip-mode-picker">
              <legend>{t("Experimental chip mode")}</legend>
              <label>
                <input
                  checked={chipMode === "physical"}
                  data-qa-control="home-chip-mode-physical"
                  name="chip-mode"
                  onChange={() => setChipMode("physical")}
                  type="radio"
                />
                <span>
                  <strong>{t("Physical chips")}</strong>
                  <small>
                    {t("Deal-only mode. Players move chips on the table.")}
                  </small>
                </span>
              </label>
              <label>
                <input
                  checked={chipMode === "digital"}
                  data-qa-control="home-chip-mode-digital"
                  name="chip-mode"
                  onChange={() => setChipMode("digital")}
                  type="radio"
                />
                <span>
                  <strong>{t("Digital chips · development tracer")}</strong>
                  <small>
                    {t("Two players and one hand only; not party-ready.")}
                  </small>
                </span>
              </label>
            </fieldset>
          ) : null}
          {digitalChipsEnabled && chipMode === "digital" ? (
            <div
              className="digital-chip-settings"
              aria-label={t("Digital chip settings")}
            >
              <label>
                <span>{t("Starting stack")}</span>
                <input
                  inputMode="numeric"
                  min={1}
                  onChange={(event) =>
                    setStartingStack(event.currentTarget.valueAsNumber)
                  }
                  step="1"
                  type="number"
                  value={startingStack}
                />
              </label>
              <label>
                <span>{t("Small blind")}</span>
                <input
                  inputMode="numeric"
                  min={1}
                  onChange={(event) =>
                    setSmallBlind(event.currentTarget.valueAsNumber)
                  }
                  step="1"
                  type="number"
                  value={smallBlind}
                />
              </label>
              <label>
                <span>{t("Big blind")}</span>
                <input
                  inputMode="numeric"
                  min={2}
                  onChange={(event) =>
                    setBigBlind(event.currentTarget.valueAsNumber)
                  }
                  step="1"
                  type="number"
                  value={bigBlind}
                />
              </label>
              {!digitalRulesValid ? (
                <p className="inline-warning" role="alert">
                  {t(
                    "Use whole chips with 0 < small blind < big blind < starting stack.",
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p className="inline-warning" role="alert">
              {error}
            </p>
          ) : null}
          {relayRequiresOperatorToken ? (
            <label className="relay-token-field">
              <span>{t("Connection Service host token")}</span>
              <input
                autoComplete="off"
                onChange={(event) => setOperatorToken(event.target.value)}
                type="password"
                value={operatorToken}
              />
              <small>
                {t(
                  "Used once to mint a table-limited relay ticket. It is not sent in player links.",
                )}
              </small>
            </label>
          ) : null}
          <button
            className="button button--primary button--wide"
            data-qa-control="home-create-table"
            disabled={
              !ready ||
              busy ||
              (chipMode === "digital" && !digitalRulesValid) ||
              (relayRequiresOperatorToken && !operatorToken.trim())
            }
            onClick={() => void create()}
            type="button"
          >
            {busy ? t("Preparing table…") : t("Create table")}
          </button>
          <p className="privacy-line">
            {t("No account · no analytics · play chips only")}
          </p>
          {onJoinAirplane ? (
            <button
              className="button button--quiet button--wide airplane-join-button"
              data-qa-control="home-join-airplane"
              onClick={onJoinAirplane}
              type="button"
            >
              {t("Join an Airplane table")}
            </button>
          ) : null}
          {onPairDisplay ? (
            <button
              className="button button--quiet button--wide airplane-join-button"
              data-qa-control="home-pair-display"
              onClick={onPairDisplay}
              type="button"
            >
              {t("Pair this display")}
            </button>
          ) : null}
          <section
            className="join-session-card"
            aria-labelledby="join-session-title"
          >
            <div>
              <p className="section-label">{t("Joining friends")}</p>
              <h3 id="join-session-title">{t("Join another session")}</h3>
              <p>
                {t(
                  "Paste the current invitation URL or scan its QR in this page.",
                )}
              </p>
            </div>
            <label>
              <span>{t("Invitation URL")}</span>
              <input
                autoCapitalize="none"
                autoComplete="off"
                inputMode="url"
                onChange={(event) => setJoinUrl(event.currentTarget.value)}
                placeholder="https://…#join=…"
                value={joinUrl}
              />
            </label>
            {joinError ? (
              <p className="inline-warning" role="alert">
                {joinError}
              </p>
            ) : null}
            <div className="button-row">
              <button
                className="button button--primary"
                data-qa-control="home-open-invitation"
                disabled={!joinUrl.trim()}
                onClick={() => openInvitation(joinUrl)}
                type="button"
              >
                {t("Open invitation")}
              </button>
              <button
                className="button button--quiet"
                data-qa-control="home-scan-invitation"
                onClick={() => setJoinScannerOpen(true)}
                type="button"
              >
                {t("Scan invitation QR")}
              </button>
            </div>
          </section>
        </section>
      </div>
      {joinScannerOpen ? (
        <QrCameraScanner
          label={t("Scan player invitation QR")}
          onClose={() => setJoinScannerOpen(false)}
          onCode={(code) => {
            setJoinScannerOpen(false);
            setJoinUrl(code);
            openInvitation(code);
          }}
        />
      ) : null}
    </main>
  );
}

function QrImage({
  label = "Player invitation QR code",
  value,
}: {
  readonly label?: string;
  readonly value: string;
}) {
  const { t } = useLanguage();
  const [source, setSource] = useState<string>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setSource(undefined);
    setError(false);
    const isDensePairingCode =
      value.startsWith("HTMLPOKER-AIRPLANE-1:") ||
      value.startsWith("HTMLPOKER-TABLE-SIDE-DISPLAY-1:");
    void QRCode.toDataURL(value, {
      color: { dark: "#19211f", light: "#ffffff" },
      errorCorrectionLevel: "L",
      margin: isDensePairingCode ? 4 : 2,
      width: isDensePairingCode ? 1_024 : 512,
    }).then(
      (dataUrl) => {
        if (active) setSource(dataUrl);
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [value]);
  if (error) {
    return (
      <span className="qr-error">{t("Pairing QR could not be rendered.")}</span>
    );
  }
  return source ? <img alt={label} src={source} /> : null;
}

function decodeQrPixels(image: HTMLImageElement): string | undefined {
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (naturalWidth < 1 || naturalHeight < 1) return undefined;

  const scale = Math.min(1, 1_600 / Math.max(naturalWidth, naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(pixels.data, canvas.width, canvas.height, {
    inversionAttempts: "attemptBoth",
  })?.data;
}

async function scanQrImage(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = document.createElement("img");
    await new Promise<void>((resolve, reject) => {
      const timeout = globalThis.setTimeout(
        () => reject(new Error("The QR image did not load.")),
        5_000,
      );
      image.addEventListener(
        "load",
        () => {
          globalThis.clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      image.addEventListener(
        "error",
        () => {
          globalThis.clearTimeout(timeout);
          reject(new Error("The selected QR image is unreadable."));
        },
        { once: true },
      );
      image.src = objectUrl;
    });
    const nativeDetector = (
      globalThis as typeof globalThis & {
        BarcodeDetector?: new (options: { formats: string[] }) => {
          detect(
            source: ImageBitmapSource,
          ): Promise<ReadonlyArray<{ readonly rawValue: string }>>;
        };
      }
    ).BarcodeDetector;
    if (nativeDetector) {
      try {
        const detected = await new nativeDetector({
          formats: ["qr_code"],
        }).detect(image);
        if (detected[0]?.rawValue) return detected[0].rawValue;
      } catch {
        // The bundled decoder below is the cross-browser fallback.
      }
    }
    const pixelResult = decodeQrPixels(image);
    if (pixelResult) return pixelResult;
    throw new Error(
      "No usable QR data was found. Fill the code guide and try again in good light.",
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function cameraFailureMessage(caught: unknown): string {
  if (!globalThis.navigator.mediaDevices?.getUserMedia) {
    return "This browser cannot open a camera from this file. Use a saved QR image instead.";
  }
  if (caught instanceof DOMException) {
    if (caught.name === "NotAllowedError") {
      return "Camera access was blocked. Allow camera access, then open the scanner again.";
    }
    if (caught.name === "NotFoundError") {
      return "No camera was found on this device. Use a saved QR image instead.";
    }
    if (caught.name === "NotReadableError") {
      return "The camera is already in use by another app. Close that app, then try again.";
    }
  }
  return "The camera could not start. Use a saved QR image instead.";
}

function QrCameraScanner({
  label,
  onClose,
  onCode,
}: {
  readonly label: string;
  readonly onClose: () => void;
  readonly onCode: (code: string) => void;
}) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop(): void } | null>(null);
  const handledRef = useRef(false);
  const onCodeRef = useRef(onCode);
  const [cameraError, setCameraError] = useState<string>();
  const [imageError, setImageError] = useState<string>();

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const fallbackCanvas = document.createElement("canvas");
    const fallbackContext = fallbackCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    let active = true;
    let fallbackScanTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

    const cleanup = () => {
      active = false;
      if (fallbackScanTimer !== undefined) {
        globalThis.clearTimeout(fallbackScanTimer);
      }
      controlsRef.current?.stop();
      controlsRef.current = null;
    };

    const acceptResult = (code: string, stop?: () => void) => {
      if (!active || handledRef.current) return;
      handledRef.current = true;
      if (fallbackScanTimer !== undefined) {
        globalThis.clearTimeout(fallbackScanTimer);
      }
      if (stop) stop();
      else controlsRef.current?.stop();
      onCodeRef.current(code);
    };

    const scanFallbackFrame = () => {
      if (!active || handledRef.current) return;
      if (
        fallbackContext &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        try {
          const scale = Math.min(
            1,
            960 / Math.max(video.videoWidth, video.videoHeight),
          );
          const frameWidth = Math.max(1, Math.round(video.videoWidth * scale));
          const frameHeight = Math.max(
            1,
            Math.round(video.videoHeight * scale),
          );
          if (
            fallbackCanvas.width !== frameWidth ||
            fallbackCanvas.height !== frameHeight
          ) {
            fallbackCanvas.width = frameWidth;
            fallbackCanvas.height = frameHeight;
          }
          fallbackContext.drawImage(
            video,
            0,
            0,
            fallbackCanvas.width,
            fallbackCanvas.height,
          );
          const frame = fallbackContext.getImageData(
            0,
            0,
            fallbackCanvas.width,
            fallbackCanvas.height,
          );
          const decoded = jsQR(
            frame.data,
            fallbackCanvas.width,
            fallbackCanvas.height,
            { inversionAttempts: "dontInvert" },
          );
          if (decoded?.data) {
            acceptResult(decoded.data);
            return;
          }
        } catch {
          // Keep trying subsequent camera frames.
        }
      }
      fallbackScanTimer = globalThis.setTimeout(scanFallbackFrame, 360);
    };

    const getUserMedia = globalThis.navigator.mediaDevices?.getUserMedia;
    if (!getUserMedia) {
      setCameraError(cameraFailureMessage(undefined));
      return cleanup;
    }

    void getUserMedia
      .call(globalThis.navigator.mediaDevices, {
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          height: { ideal: 1_080 },
          width: { ideal: 1_920 },
        },
      })
      .then((stream) => {
        const stop = () => {
          stream.getTracks().forEach((track) => track.stop());
          if (video.srcObject === stream) video.srcObject = null;
        };
        if (!active) {
          stop();
          return;
        }
        controlsRef.current = { stop };
        video.srcObject = stream;
        void video.play().catch(() => undefined);
        fallbackScanTimer = globalThis.setTimeout(scanFallbackFrame, 360);
      })
      .catch((caught: unknown) => {
        if (active) setCameraError(cameraFailureMessage(caught));
      });

    return cleanup;
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    globalThis.addEventListener("keydown", closeOnEscape);
    return () => globalThis.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function readSavedImage(file: File) {
    setImageError(undefined);
    try {
      onCode(await scanQrImage(file));
    } catch (caught) {
      setImageError(
        caught instanceof Error
          ? caught.message
          : "The selected image does not contain a readable QR code.",
      );
    }
  }

  return (
    <div
      aria-labelledby="qr-camera-title"
      aria-modal="true"
      className="qr-camera-backdrop"
      role="dialog"
    >
      <section className="qr-camera-sheet">
        <header className="qr-camera-header">
          <div>
            <p className="section-label">{t("Live camera")}</p>
            <h2 id="qr-camera-title">{label}</h2>
          </div>
          <button
            aria-label={t("Close camera")}
            autoFocus
            className="qr-camera-close"
            data-qa-control="qr-camera-close"
            onClick={onClose}
            type="button"
          >
            {t("Close")}
          </button>
        </header>
        <div className="qr-camera-viewfinder">
          <video autoPlay muted playsInline ref={videoRef} />
          <span className="qr-camera-corners" aria-hidden="true" />
          <p aria-live="polite">
            {cameraError ?? t("Hold the QR inside the four corners.")}
          </p>
        </div>
        {imageError ? (
          <p className="inline-warning" role="alert">
            {imageError}
          </p>
        ) : null}
        <div className="qr-camera-actions">
          <label className="button button--quiet qr-file-button">
            <span>{t("Use a saved QR image")}</span>
            <input
              accept="image/*"
              data-qa-control="qr-camera-file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readSavedImage(file);
                event.target.value = "";
              }}
              type="file"
            />
          </label>
          <small>{t("Nothing from the camera leaves this device.")}</small>
        </div>
      </section>
    </div>
  );
}

function AirplaneHostPairingCard({
  compact = false,
  label,
  role,
  runtime,
}: {
  readonly compact?: boolean;
  readonly label: string;
  readonly role: CapabilityRole;
  readonly runtime: HostTableRuntime;
}) {
  const { language, t } = useLanguage();
  const [offer, setOffer] = useState<AirplaneOfferDetails>();
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string>();
  const [qrExpanded, setQrExpanded] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    if (!qrExpanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQrExpanded(false);
    };
    globalThis.addEventListener("keydown", closeOnEscape);
    return () => globalThis.removeEventListener("keydown", closeOnEscape);
  }, [qrExpanded]);

  async function prepare() {
    setBusy(true);
    setConnected(false);
    setError(undefined);
    setQrExpanded(false);
    try {
      setOffer(await runtime.createAirplaneOffer(role, language));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("The local pairing offer could not be created."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function accept(code: string) {
    setBusy(true);
    setError(undefined);
    try {
      await runtime.acceptAirplaneAnswer(code);
      setConnected(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("The local pairing answer was rejected."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`airplane-pairing-card${compact ? " airplane-pairing-card--compact" : ""}`}
    >
      <div className="airplane-pairing-card__qr">
        {offer ? (
          <>
            <QrImage
              label={`${label} Airplane offer QR code`}
              value={offer.code}
            />
            <button
              className="button button--quiet qr-expand-button"
              data-qa-control="airplane-offer-enlarge"
              data-qa-variant={role}
              onClick={() => setQrExpanded(true)}
              type="button"
            >
              {t("Enlarge QR")}
            </button>
          </>
        ) : (
          <span className="airplane-pairing-placeholder" aria-hidden="true">
            ↔
          </span>
        )}
      </div>
      <div className="airplane-pairing-card__content">
        <p className="section-label">
          {t("Airplane")} · {t(label)}
        </p>
        <h2>{offer ? t("Scan this offer") : t("Prepare local pairing")}</h2>
        <p>
          {offer
            ? t(
                "On the other device, open this same poker page and choose Join an Airplane table. Use its in-page camera—not the phone's standalone Camera app—then scan the answer here.",
              )
            : t(
                "Creates a one-use, no-internet WebRTC offer. Both devices must use private Wi-Fi without client isolation.",
              )}
        </p>
        {error ? (
          <p className="inline-warning" role="alert">
            {error}
          </p>
        ) : null}
        {connected ? (
          <p className="pairing-ready" role="status">
            {t("Direct channel paired. The other device can now join.")}
          </p>
        ) : null}
        <div className="button-row">
          <button
            className="button button--primary"
            data-qa-control="airplane-offer-prepare"
            data-qa-variant={role}
            disabled={busy}
            onClick={() => void prepare()}
            type="button"
          >
            {busy
              ? t("Preparing…")
              : offer
                ? t("New offer")
                : t(`Pair ${label}`)}
          </button>
          {offer ? (
            <button
              className="button button--quiet"
              data-qa-control="airplane-answer-scan"
              data-qa-variant={role}
              disabled={busy}
              onClick={() => setScannerOpen(true)}
              type="button"
            >
              {`${t("Scan")} ${t(label)} ${t("answer QR")}`}
            </button>
          ) : null}
        </div>
      </div>
      {scannerOpen ? (
        <QrCameraScanner
          label={`${t("Scan")} ${t(label)} ${t("answer QR")}`}
          onClose={() => setScannerOpen(false)}
          onCode={(code) => {
            setScannerOpen(false);
            void accept(code);
          }}
        />
      ) : null}
      {qrExpanded && offer ? (
        <div
          aria-labelledby="enlarged-airplane-qr-title"
          aria-modal="true"
          className="qr-display-backdrop"
          role="dialog"
        >
          <section className="qr-display-sheet">
            <header className="qr-camera-header">
              <div>
                <p className="section-label">
                  {t("Airplane")} · {t(label)}
                </p>
                <h2 id="enlarged-airplane-qr-title">
                  {t("Enlarged")} {t(label)} {t("pairing QR")}
                </h2>
              </div>
              <button
                aria-label={t("Close enlarged QR")}
                autoFocus
                className="qr-camera-close"
                data-qa-control="airplane-offer-enlarge-close"
                onClick={() => setQrExpanded(false)}
                type="button"
              >
                {t("Close")}
              </button>
            </header>
            <div className="qr-display-instruction">
              <strong>{t("Do not use the phone's Camera app.")}</strong>
              <p>
                {t(
                  "On the phone, open this poker app, choose Join an Airplane table, then use Scan host offer QR.",
                )}
              </p>
            </div>
            <div className="qr-display-code">
              <QrImage
                label={`Enlarged ${label} Airplane offer QR code`}
                value={offer.code}
              />
              <p>
                {t("Hold the phone steady and let this code fill the guide.")}
              </p>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function InvitePanel({
  compact = false,
  runtime,
  snapshot,
}: {
  readonly compact?: boolean;
  readonly runtime: HostTableRuntime;
  readonly snapshot: HostRuntimeSnapshot;
}) {
  const { language, t } = useLanguage();
  const invitation = snapshot.invitations.player;
  const replacementSeat = invitation?.seatId
    ? snapshot.roster.seats.find((seat) => seat.seatId === invitation.seatId)
    : undefined;
  const [copied, setCopied] = useState(false);
  const digitalJoinLocked =
    runtime.rulesProfile.id === "nlhe-home-v1" && snapshot.stage === "table";
  const tableSideMode = !isAirplaneMode();

  if (!snapshot.roster.joinWindowOpen && !replacementSeat) {
    return (
      <section
        className={`invite-panel${compact ? " invite-panel--compact" : ""}`}
      >
        <div className="invite-panel__content">
          <p className="section-label">
            {tableSideMode ? t("New players") : t("Join window")}
          </p>
          <h2>
            {tableSideMode
              ? t("New players locked")
              : t("New seats are paused")}
          </h2>
          <p>
            {digitalJoinLocked
              ? t(
                  "This one-hand Digital Chips tracer does not admit late seats. Existing seat recovery and device replacement still work.",
                )
              : tableSideMode
                ? t(
                    "Allow new players to reveal a one-use QR and link. Existing seat recovery and device replacement still work.",
                  )
                : t(
                    "Existing seat recovery and device replacement still work.",
                  )}
          </p>
          {!digitalJoinLocked ? (
            <button
              aria-label={tableSideMode ? t("Allow new players") : undefined}
              aria-pressed={tableSideMode ? false : undefined}
              className={
                tableSideMode ? "join-window-toggle" : "button button--quiet"
              }
              data-qa-control="host-open-join-window"
              onClick={() => void runtime.setJoinWindow(true)}
              type="button"
            >
              {tableSideMode ? (
                <>
                  <span
                    aria-hidden="true"
                    className="join-window-toggle__track"
                  >
                    <i />
                  </span>
                  <span>{t("New players")}</span>
                  <strong>{t("Locked")}</strong>
                </>
              ) : (
                t("Open join window")
              )}
            </button>
          ) : null}
        </div>
      </section>
    );
  }
  if (isAirplaneMode()) {
    return (
      <AirplaneHostPairingCard
        compact={compact}
        label={
          replacementSeat
            ? `Replacement for ${replacementSeat.displayName}`
            : "Player"
        }
        role="player"
        runtime={runtime}
      />
    );
  }
  if (!invitation) {
    return (
      <section
        className={`invite-panel${compact ? " invite-panel--compact" : ""}`}
      >
        <div className="invite-panel__content">
          <p className="section-label">{t("Player invitation")}</p>
          <h2>{t("All ten seats are allocated")}</h2>
          <p>
            {t("Use player replacement from the roster if a phone changes.")}
          </p>
        </div>
      </section>
    );
  }
  const invitationLink = localizedInvitationUrl(
    globalThis.location,
    runtime,
    invitation,
    language,
  );

  async function copy() {
    await globalThis.navigator.clipboard.writeText(invitationLink);
    setCopied(true);
    globalThis.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <section
      className={`invite-panel${compact ? " invite-panel--compact" : ""}`}
    >
      <div className="invite-panel__qr">
        <QrImage value={invitationLink} />
      </div>
      <div className="invite-panel__content">
        <p className="section-label">
          {replacementSeat
            ? t("Device replacement")
            : tableSideMode
              ? t("New players")
              : t("Other devices only")}
        </p>
        <h2>
          {replacementSeat
            ? language === "en"
              ? `${t("Replace")} ${replacementSeat.displayName}'s ${t("device")}`
              : `${t("Replace")} ${replacementSeat.displayName} 的${t("device")}`
            : tableSideMode
              ? t("Add a player")
              : t("Other devices join here")}
        </h2>
        <p>
          {replacementSeat
            ? t(
                "This one-use link keeps the seat and revokes its previous device when redeemed.",
              )
            : tableSideMode
              ? t(
                  "Show this one-use QR or copy its link to the new player's device. They choose a display name after opening it; no account or host approval prompt follows.",
                )
              : t(
                  "Each QR works once. A player chooses their display name after opening it; no account or host approval prompt follows.",
                )}
        </p>
        {!replacementSeat ? (
          <p className="invite-device-note">
            <strong>{t("Using this phone or iPad as the host?")}</strong>{" "}
            {t(
              "Choose Join my own table on this device above. Do not scan or open this invitation on the Trusted Host device.",
            )}
          </p>
        ) : null}
        <label className="invite-link">
          <span>
            {replacementSeat
              ? t("Player replacement link")
              : t("Player invitation link")}
          </span>
          <input readOnly value={invitationLink} />
        </label>
        <div className="button-row">
          <button
            className="button button--primary"
            data-qa-control="player-invitation-copy"
            onClick={() => void copy()}
            type="button"
          >
            {copied ? t("Copied") : t("Copy link")}
          </button>
          <button
            className="button button--quiet"
            data-qa-control="player-invitation-refresh"
            onClick={() => void runtime.issueInvitation("player")}
            type="button"
          >
            {replacementSeat ? t("Return to new seats") : t("New invitation")}
          </button>
        </div>
      </div>
    </section>
  );
}

const roleInvitationDetails = [
  {
    button: "Create Public Table link",
    label: "Public Table",
    role: "public-table",
  },
  { button: "Create TV link", label: "TV", role: "tv" },
  {
    button: "Create Tablet Control link",
    label: "Tablet Control",
    role: "table-control",
  },
] as const;

function SameDeviceRoleButton({
  onUseThisDevice,
  role,
}: {
  readonly onUseThisDevice: (role: "tv" | "table-control") => void;
  readonly role: "tv" | "table-control";
}) {
  const { t } = useLanguage();
  const label =
    role === "tv"
      ? t("Use this device as TV")
      : t("Use this device as Tablet Control");
  return (
    <button
      className="button button--quiet"
      data-qa-control="role-invitation-use-this-device"
      data-qa-variant={role}
      onClick={() => onUseThisDevice(role)}
      type="button"
    >
      {label}
    </button>
  );
}

function RoleInvitationCard({
  button,
  label,
  onUseThisDevice,
  role,
  runtime,
  snapshot,
}: {
  readonly button: string;
  readonly label: string;
  readonly onUseThisDevice?: (role: "tv" | "table-control") => void;
  readonly role: Exclude<CapabilityRole, "player">;
  readonly runtime: HostTableRuntime;
  readonly snapshot: HostRuntimeSnapshot;
}) {
  const { language, t } = useLanguage();
  const invitation = snapshot.invitations[role];
  const [copied, setCopied] = useState(false);
  if (!invitation) {
    return (
      <article className="role-invite-card">
        <div>
          <strong>{t(label)}</strong>
          <small>
            {t(
              role === "table-control"
                ? "Dealer controls, never private cards"
                : "Public board and shown cards only",
            )}
          </small>
        </div>
        <div className="button-row">
          <button
            className="button button--quiet"
            data-qa-control="role-invitation-create"
            data-qa-variant={role}
            onClick={() => void runtime.issueInvitation(role)}
            type="button"
          >
            {t(button)}
          </button>
          {onUseThisDevice && (role === "tv" || role === "table-control") ? (
            <SameDeviceRoleButton
              onUseThisDevice={onUseThisDevice}
              role={role}
            />
          ) : null}
        </div>
      </article>
    );
  }
  const link = localizedInvitationUrl(
    globalThis.location,
    runtime,
    invitation,
    language,
  );
  return (
    <article className="role-invite-card role-invite-card--ready">
      <QrImage label={`${t(label)} ${t("invitation QR code")}`} value={link} />
      <div>
        <strong>{t(label)}</strong>
        <label>
          <span>
            {t(label)} {t("invitation link")}
          </span>
          <input readOnly value={link} />
        </label>
        <div className="button-row">
          <button
            className="button button--primary"
            data-qa-control="role-invitation-copy"
            data-qa-variant={role}
            onClick={() => {
              void globalThis.navigator.clipboard.writeText(link).then(() => {
                setCopied(true);
                globalThis.setTimeout(() => setCopied(false), 1_500);
              });
            }}
            type="button"
          >
            {copied ? t("Copied") : t("Copy link")}
          </button>
          <button
            className="button button--quiet"
            data-qa-control="role-invitation-replace"
            data-qa-variant={role}
            onClick={() => void runtime.issueInvitation(role)}
            type="button"
          >
            {t("Replace link")}
          </button>
          {onUseThisDevice && (role === "tv" || role === "table-control") ? (
            <SameDeviceRoleButton
              onUseThisDevice={onUseThisDevice}
              role={role}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

function TableSideDisplayPairingCard({
  runtime,
}: {
  readonly runtime: HostTableRuntime;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [pairedRole, setPairedRole] = useState<"public-table" | "tv">();

  async function pair(file: File) {
    setBusy(true);
    setError(undefined);
    setPairedRole(undefined);
    try {
      setPairedRole(
        await runtime.pairTableSideDisplay(await scanQrImage(file)),
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message.trim() : "";
      setError(message || t("The display pairing QR could not be accepted."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="table-side-display-pairing"
      aria-labelledby="table-side-pair-title"
    >
      <header>
        <p className="section-label">{t("Awkward-input display")}</p>
        <h3 id="table-side-pair-title">
          {t("Scan-pair a TV or public table")}
        </h3>
      </header>
      <p>
        {t(
          "The display chooses TV or Public Table first. Its one-use request QR grants nothing until you scan it here.",
        )}
      </p>
      {error ? (
        <p className="inline-warning" role="alert">
          {error}
        </p>
      ) : null}
      {pairedRole ? (
        <p className="pairing-ready" role="status">
          {t(pairedRole === "tv" ? "TV" : "Public Table")} {t("paired")}
        </p>
      ) : null}
      <label className="button button--quiet qr-file-button">
        <span>{busy ? t("Reading QR…") : t("Scan display pairing QR")}</span>
        <input
          accept="image/*"
          capture="environment"
          data-qa-control="table-side-display-pair-file"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void pair(file);
            event.target.value = "";
          }}
          type="file"
        />
      </label>
    </section>
  );
}

function RelaySessionCard({
  runtime,
  snapshot,
}: {
  readonly runtime: HostTableRuntime;
  readonly snapshot: HostRuntimeSnapshot;
}) {
  const { t } = useLanguage();
  const [operatorToken, setOperatorToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [refreshed, setRefreshed] = useState(false);
  const relaySession = snapshot.relaySession;

  if (!relaySession || isAirplaneMode()) return null;
  const minutesRemaining = Math.ceil(
    (relaySession.expiresAt - Date.now()) / 60_000,
  );
  const sessionStatus =
    minutesRemaining <= 0
      ? t("Relay ticket expired")
      : `${t("Relay ticket expires in")} ${minutesRemaining} ${t(minutesRemaining === 1 ? "minute" : "minutes")}`;

  async function refresh() {
    setBusy(true);
    setError(undefined);
    setRefreshed(false);
    try {
      await runtime.refreshRelaySession(operatorToken);
      setOperatorToken("");
      setRefreshed(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("The relay ticket could not be refreshed."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="relay-session-card"
      aria-labelledby="relay-session-title"
    >
      <header>
        <p className="section-label">{t("Connection Service")}</p>
        <h3 id="relay-session-title">
          {relaySession.route === "private-relay"
            ? t("Private relay")
            : t("Cloud relay")}
        </h3>
      </header>
      <p>
        {sessionStatus}.{" "}
        {t(
          "Refresh it before reconnecting a remote player after a long break.",
        )}
      </p>
      {error ? (
        <p className="inline-warning" role="alert">
          {error}
        </p>
      ) : null}
      {refreshed ? (
        <p className="pairing-ready" role="status">
          {t("Relay ticket refreshed")}
        </p>
      ) : null}
      <label className="relay-token-field">
        <span>{t("Connection Service host token")}</span>
        <input
          autoComplete="off"
          onChange={(event) => setOperatorToken(event.target.value)}
          type="password"
          value={operatorToken}
        />
        <small>
          {t(
            "Used only to renew this table ticket. It is not saved in table recovery or exposed in player links.",
          )}
        </small>
      </label>
      <button
        className="button button--quiet"
        data-qa-control="relay-ticket-refresh"
        disabled={busy || !operatorToken.trim()}
        onClick={() => void refresh()}
        type="button"
      >
        {busy ? t("Refreshing…") : t("Refresh relay ticket")}
      </button>
    </section>
  );
}

function RoleInvitations({
  onUseThisDevice,
  runtime,
  snapshot,
}: {
  readonly onUseThisDevice?: (role: "tv" | "table-control") => void;
  readonly runtime: HostTableRuntime;
  readonly snapshot: HostRuntimeSnapshot;
}) {
  const { t } = useLanguage();
  return (
    <section className="role-invitations" aria-labelledby="surfaces-title">
      <header>
        <p className="section-label">{t("Room surfaces")}</p>
        <h3 id="surfaces-title">{t("Displays and dealer tablet")}</h3>
      </header>
      {!isAirplaneMode() && tableSideDisplayPairingIsConfigured() ? (
        <TableSideDisplayPairingCard runtime={runtime} />
      ) : null}
      {roleInvitationDetails.map((details) =>
        isAirplaneMode() ? (
          <AirplaneHostPairingCard
            compact
            key={details.role}
            label={details.label}
            role={details.role}
            runtime={runtime}
          />
        ) : (
          <RoleInvitationCard
            {...details}
            key={details.role}
            {...(onUseThisDevice ? { onUseThisDevice } : {})}
            runtime={runtime}
            snapshot={snapshot}
          />
        ),
      )}
    </section>
  );
}

function SeatRoster({
  onMove,
  onRelocateDealer,
  onReplace,
  runtime,
  snapshot,
}: {
  readonly onMove?: (seatId: string, position: number) => void;
  readonly onRelocateDealer?: (seatId: string) => void;
  readonly onReplace?: (seatId: string) => void;
  readonly runtime?: HostTableRuntime;
  readonly snapshot: HostRuntimeSnapshot;
}) {
  const { t } = useLanguage();
  const orderedSeats = [...snapshot.roster.seats].sort(
    (left, right) => left.displayPosition - right.displayPosition,
  );
  const [selectedSeatId, setSelectedSeatId] = useState<string | undefined>(
    orderedSeats[0]?.seatId,
  );
  const selectedSeat =
    orderedSeats.find((seat) => seat.seatId === selectedSeatId) ??
    orderedSeats[0];
  const selectedSeatIndex = selectedSeat
    ? orderedSeats.findIndex((seat) => seat.seatId === selectedSeat.seatId)
    : -1;
  const digitalJoinLocked =
    runtime?.rulesProfile.id === "nlhe-home-v1" && snapshot.stage === "table";

  return (
    <section className="roster" aria-labelledby="roster-title">
      <header>
        <div>
          <p className="section-label">{t("Seats")}</p>
          <h2 id="roster-title">
            {snapshot.roster.seats.length} {t("of 10 joined")}
          </h2>
        </div>
        <div className="join-window-tools">
          {runtime && !digitalJoinLocked ? (
            <button
              aria-label={
                isAirplaneMode()
                  ? undefined
                  : snapshot.roster.joinWindowOpen
                    ? t("Stop new players")
                    : t("Allow new players")
              }
              aria-pressed={
                isAirplaneMode() ? undefined : snapshot.roster.joinWindowOpen
              }
              className={
                isAirplaneMode() ? "text-button" : "join-window-toggle"
              }
              data-qa-control="roster-join-window-toggle"
              onClick={() =>
                void runtime.setJoinWindow(!snapshot.roster.joinWindowOpen)
              }
              type="button"
            >
              {isAirplaneMode() ? (
                snapshot.roster.joinWindowOpen ? (
                  t("Close join window")
                ) : (
                  t("Open join window")
                )
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="join-window-toggle__track"
                  >
                    <i />
                  </span>
                  <span>{t("New players")}</span>
                  <strong>
                    {snapshot.roster.joinWindowOpen ? t("Open") : t("Locked")}
                  </strong>
                </>
              )}
            </button>
          ) : null}
        </div>
      </header>
      {snapshot.roster.seats.length === 0 ? (
        <div className="empty-roster">
          <span aria-hidden="true">↳</span>
          <p>
            {t("The first player appears here as soon as the QR is redeemed.")}
          </p>
        </div>
      ) : (
        <>
          <div className="roster-map-copy">
            <strong>{t("Table positions")}</strong>
            <span>{t("Tap a player where they sit to manage that seat.")}</span>
          </div>
          <ol
            className="roster-table-map"
            data-seat-count={orderedSeats.length}
          >
            {orderedSeats.map((seat, index) => {
              const edgePosition = tableSeatPosition(
                index,
                orderedSeats.length,
              );
              const status = seat.connected
                ? seat.state.replace("-", " ")
                : `${seat.state.replace("-", " ")} · offline`;
              return (
                <li
                  className={`roster-table-map__seat roster-table-map__seat--${edgePosition}`}
                  data-roster-seat-id={seat.seatId}
                  data-table-edge-position={edgePosition}
                  key={seat.seatId}
                >
                  <button
                    aria-label={`Seat ${index + 1}, ${seat.displayName}, ${tableEdgeLabel(edgePosition)}, ${status}`}
                    aria-pressed={selectedSeat?.seatId === seat.seatId}
                    className="roster-map-seat-button"
                    data-qa-control="roster-map-seat"
                    data-qa-variant={seat.seatId}
                    onClick={() => setSelectedSeatId(seat.seatId)}
                    type="button"
                  >
                    <span>{index + 1}</span>
                    <span className="roster-seat-copy">
                      <strong>{seat.displayName}</strong>
                      <small>{status}</small>
                    </span>
                  </button>
                </li>
              );
            })}
            <li aria-hidden="true" className="roster-table-map__centre">
              <i className="roster-table-map__community-cards">
                {Array.from({ length: 5 }, (_, index) => (
                  <span key={index} />
                ))}
              </i>
              <span>{t("Community cards")}</span>
            </li>
          </ol>
          {selectedSeat ? (
            <section
              aria-label={`Manage ${selectedSeat.displayName}`}
              className="roster-seat-detail"
            >
              <div>
                <span>
                  {t("Seat")} {selectedSeatIndex + 1}
                </span>
                <strong>{selectedSeat.displayName}</strong>
                <small>
                  {tableEdgeLabel(
                    tableSeatPosition(selectedSeatIndex, orderedSeats.length),
                  )}
                </small>
              </div>
              {onMove || onReplace || onRelocateDealer ? (
                <div className="roster-seat-actions">
                  {onMove ? (
                    <>
                      <button
                        aria-label={`Move ${selectedSeat.displayName} up`}
                        data-qa-control="roster-seat-move-up"
                        data-qa-variant={selectedSeat.seatId}
                        disabled={selectedSeatIndex === 0}
                        onClick={() =>
                          onMove(selectedSeat.seatId, selectedSeatIndex - 1)
                        }
                        type="button"
                      >
                        {t("Move anticlockwise")}
                      </button>
                      <button
                        aria-label={`Move ${selectedSeat.displayName} down`}
                        data-qa-control="roster-seat-move-down"
                        data-qa-variant={selectedSeat.seatId}
                        disabled={selectedSeatIndex === orderedSeats.length - 1}
                        onClick={() =>
                          onMove(selectedSeat.seatId, selectedSeatIndex + 1)
                        }
                        type="button"
                      >
                        {t("Move clockwise")}
                      </button>
                    </>
                  ) : null}
                  {onRelocateDealer &&
                  snapshot.projection?.phase === "complete" &&
                  snapshot.projection.dealerSeatId !== selectedSeat.seatId ? (
                    <button
                      data-qa-control="roster-make-dealer"
                      data-qa-variant={selectedSeat.seatId}
                      onClick={() => onRelocateDealer(selectedSeat.seatId)}
                      type="button"
                    >
                      {t("Make dealer")}
                    </button>
                  ) : null}
                  {onReplace ? (
                    <button
                      data-qa-control="roster-replace-device"
                      data-qa-variant={selectedSeat.seatId}
                      onClick={() => onReplace(selectedSeat.seatId)}
                      type="button"
                    >
                      {t("Replace device")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}

function tableEdgeLabel(position: number): string {
  return (
    [
      "upper left",
      "upper centre",
      "upper right",
      "right upper",
      "right lower",
      "lower right",
      "lower centre",
      "lower left",
      "left lower",
      "left upper",
    ][position] ?? "table edge"
  );
}

function CapabilityAdministration({
  onRevoke,
  snapshot,
}: {
  readonly onRevoke: (capabilityId: string) => void;
  readonly snapshot: HostRuntimeSnapshot;
}) {
  const { t } = useLanguage();
  const activeSurfaces = snapshot.roster.capabilities.filter(
    (capability) => capability.role !== "player" && !capability.revoked,
  );
  return (
    <section className="admin-section" aria-labelledby="capabilities-title">
      <header>
        <p className="section-label">{t("Active capabilities")}</p>
        <h3 id="capabilities-title">{t("Displays and controls")}</h3>
      </header>
      {activeSurfaces.length === 0 ? (
        <p className="admin-section__empty">
          {t("No display or tablet is paired.")}
        </p>
      ) : (
        <ul className="capability-list">
          {activeSurfaces.map((capability) => (
            <li key={capability.capabilityId}>
              <span>{capability.role.replaceAll("-", " ")}</span>
              <button
                className="text-button text-button--danger"
                data-qa-control="capability-revoke"
                data-qa-variant={capability.role}
                onClick={() => onRevoke(capability.capabilityId)}
                type="button"
              >
                {t("Revoke")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecoveryAdministration({
  allowVoid,
  onCorrect,
  onVoid,
  snapshot,
}: {
  readonly allowVoid: boolean;
  readonly onCorrect: (eventId: string, reason: string) => void;
  readonly onVoid: (reason: string) => void;
  readonly snapshot: HostRuntimeSnapshot;
}) {
  const { t } = useLanguage();
  const [correctionEventId, setCorrectionEventId] = useState(
    snapshot.history.at(-1)?.eventId ?? "",
  );
  const [correctionReason, setCorrectionReason] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const handActive = Boolean(
    allowVoid &&
    snapshot.projection &&
    snapshot.projection.phase !== "complete",
  );

  return (
    <section className="admin-section" aria-labelledby="recovery-title">
      <header>
        <p className="section-label">{t("Append-only repair")}</p>
        <h3 id="recovery-title">{t("Void and correction")}</h3>
      </header>
      {!allowVoid && snapshot.projection?.phase !== "complete" ? (
        <p className="admin-section__empty">
          {t(
            "Digital Chips void/rollback policy is not part of this tracer; the authority fails that command closed.",
          )}
        </p>
      ) : null}
      {handActive ? (
        <form
          className="admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            onVoid(voidReason);
            setVoidReason("");
          }}
        >
          <label>
            <span>{t("Reason to void the active hand")}</span>
            <input
              maxLength={240}
              onChange={(event) => setVoidReason(event.target.value)}
              value={voidReason}
            />
          </label>
          <button
            className="button button--danger button--small"
            data-qa-control="history-void-hand"
            disabled={!voidReason.trim()}
            type="submit"
          >
            {t("Void active hand")}
          </button>
        </form>
      ) : null}
      {snapshot.history.length > 0 ? (
        <form
          className="admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCorrect(correctionEventId, correctionReason);
            setCorrectionReason("");
          }}
        >
          <label>
            <span>{t("Event to annotate")}</span>
            <select
              data-qa-control="history-correction-event"
              onChange={(event) => setCorrectionEventId(event.target.value)}
              value={correctionEventId}
            >
              {[...snapshot.history].reverse().map((entry) => (
                <option key={entry.eventId} value={entry.eventId}>
                  r{entry.revision} · {entry.type}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("Correction note")}</span>
            <input
              maxLength={240}
              onChange={(event) => setCorrectionReason(event.target.value)}
              value={correctionReason}
            />
          </label>
          <button
            className="button button--quiet button--small"
            data-qa-control="history-append-correction"
            disabled={!correctionEventId || !correctionReason.trim()}
            type="submit"
          >
            {t("Append correction")}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function useHostSnapshot(runtime: HostTableRuntime): HostRuntimeSnapshot {
  const [snapshot, setSnapshot] = useState(() => runtime.snapshot());
  useEffect(
    () => runtime.subscribe(() => setSnapshot(runtime.snapshot())),
    [runtime],
  );
  return snapshot;
}

type HostDeviceView = "host" | "player" | "table" | "tv";

function HostDeviceViewSwitcher({
  activeView,
  hasPlayer,
  onChange,
  tableReady,
}: {
  readonly activeView: HostDeviceView;
  readonly hasPlayer: boolean;
  readonly onChange: (view: HostDeviceView) => void;
  readonly tableReady: boolean;
}) {
  const { t } = useLanguage();
  return (
    <nav className="host-device-switcher" aria-label={t("This device view")}>
      <button
        aria-pressed={activeView === "host"}
        data-qa-control="device-view-host"
        onClick={() => onChange("host")}
        type="button"
      >
        {t("Host Controls")}
      </button>
      {hasPlayer ? (
        <button
          aria-pressed={activeView === "player"}
          data-qa-control="device-view-player"
          onClick={() => onChange("player")}
          type="button"
        >
          {t("My Hand")}
        </button>
      ) : null}
      <button
        aria-pressed={activeView === "table"}
        data-qa-control="device-view-tablet"
        disabled={!tableReady}
        onClick={() => onChange("table")}
        type="button"
      >
        {t("Table View")}
      </button>
    </nav>
  );
}

function JoinOwnDeviceCard({
  onJoin,
}: {
  readonly onJoin: (displayName: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await onJoin(displayName);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "This device could not take a player seat.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="join-own-device" aria-labelledby="join-own-title">
      <p className="section-label">{t("Host also playing")}</p>
      <h2 id="join-own-title">{t("Play on this device")}</h2>
      <p>
        {t(
          "Keep the Trusted Host running on this page. The controls above switch privately between Host Controls and My Hand; do not scan your own player QR.",
        )}
      </p>
      <form onSubmit={(event) => void join(event)}>
        <label>
          <span>{t("My display name")}</span>
          <input
            autoComplete="nickname"
            maxLength={
              isAirplaneMode() ? 40 : TABLE_SIDE_DISPLAY_NAME_MAX_LENGTH
            }
            onChange={(event) => setDisplayName(event.target.value)}
            value={displayName}
          />
          {!isAirplaneMode() ? (
            <small>
              {t("Up to 24 characters keeps the table display readable.")}
            </small>
          ) : null}
        </label>
        {error ? (
          <p className="inline-warning" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="button button--primary button--wide"
          data-qa-control="host-join-own-device"
          disabled={!displayName.trim() || busy}
          type="submit"
        >
          {busy ? t("Taking seat…") : t("Join my own table on this device")}
        </button>
      </form>
    </section>
  );
}

function HostLobby({
  activeView,
  onDissolve,
  onJoinOwnDevice,
  onViewChange,
  playerRuntime,
  recoveryError,
  runtime,
}: {
  readonly activeView: HostDeviceView;
  readonly onDissolve: () => Promise<void>;
  readonly onJoinOwnDevice: (displayName: string) => Promise<void>;
  readonly onViewChange: (view: HostDeviceView) => void;
  readonly playerRuntime?: TableClientRuntime;
  readonly recoveryError?: string;
  readonly runtime: HostTableRuntime;
}) {
  const { t } = useLanguage();
  const snapshot = useHostSnapshot(runtime);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function start() {
    setBusy(true);
    setError(undefined);
    try {
      await runtime.startTable();
      globalThis.requestAnimationFrame(() => {
        globalThis.scrollTo({ behavior: "auto", left: 0, top: 0 });
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The first hand could not start.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (activeView === "player" && playerRuntime) {
    return (
      <div className="host-device-view">
        <HostDeviceViewSwitcher
          activeView={activeView}
          hasPlayer
          onChange={onViewChange}
          tableReady={snapshot.stage === "table"}
        />
        <PlayerExperience manageLifecycle={false} runtime={playerRuntime} />
      </div>
    );
  }
  if (snapshot.stage === "table" && snapshot.projection) {
    return (
      <HostTable
        activeView={
          activeView === "table" || activeView === "tv" ? activeView : "host"
        }
        hasPlayer={Boolean(playerRuntime)}
        onDissolve={onDissolve}
        onViewChange={onViewChange}
        runtime={runtime}
      />
    );
  }
  return (
    <main className="lobby-shell">
      <BrandBar
        aside={
          <>
            <LanguageSwitch compact />
            <div className="room-id">
              <span>{t("Table")}</span>
              <code>{runtime.tableId.slice(-8)}</code>
            </div>
          </>
        }
      />
      <HostDeviceViewSwitcher
        activeView="host"
        hasPlayer={Boolean(playerRuntime)}
        onChange={onViewChange}
        tableReady={false}
      />
      <header className="lobby-heading">
        <p className="section-label">{t("Join window")}</p>
        <h1>{t("Waiting for players")}</h1>
        <p>
          {runtime.rulesProfile.id === "nlhe-home-v1"
            ? `Digital Chips · ${runtime.rulesProfile.startingStack} starting stack · blinds ${runtime.rulesProfile.smallBlind}/${runtime.rulesProfile.bigBlind}. `
            : `${t("Physical Chips · deal-only mode.")} `}
          {t("Deal when at least two player seats have joined.")}
        </p>
      </header>
      <div className="lobby-grid">
        <div className="lobby-primary">
          {!playerRuntime && snapshot.invitations.player ? (
            <JoinOwnDeviceCard onJoin={onJoinOwnDevice} />
          ) : null}
          <InvitePanel runtime={runtime} snapshot={snapshot} />
        </div>
        <SeatRoster runtime={runtime} snapshot={snapshot} />
      </div>
      <RoleInvitations runtime={runtime} snapshot={snapshot} />
      <RelaySessionCard runtime={runtime} snapshot={snapshot} />
      {error || snapshot.error || recoveryError ? (
        <p className="inline-warning" role="alert">
          {error ?? snapshot.error ?? recoveryError}
        </p>
      ) : null}
      <footer className="lobby-footer">
        <p>
          {t(
            "New players who join after dealing wait for the next hand. Keep this browser open as the Trusted Host.",
          )}
        </p>
        <button
          className="button button--primary"
          data-qa-control="host-deal-first-hand"
          disabled={snapshot.roster.seats.length < 2 || busy}
          onClick={() => void start()}
          type="button"
        >
          {busy ? t("Committing first hand…") : t("Deal first hand")}
        </button>
      </footer>
    </main>
  );
}

function downloadText(filename: string, value: string) {
  const url = URL.createObjectURL(
    new Blob([value], { type: "application/json;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

const dealerInputGuardMs = 600;

function useDealerActionGuard() {
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const releaseTimer = useRef<
    ReturnType<typeof globalThis.setTimeout> | undefined
  >(undefined);

  useEffect(
    () => () => {
      if (releaseTimer.current !== undefined) {
        globalThis.clearTimeout(releaseTimer.current);
      }
    },
    [],
  );

  async function run(
    action: () => Promise<void>,
    onError: (error: unknown) => void,
  ): Promise<boolean> {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    const startedAt = globalThis.performance.now();
    let accepted = true;
    try {
      await action();
    } catch (error) {
      accepted = false;
      onError(error);
    }
    const elapsed = globalThis.performance.now() - startedAt;
    await new Promise<void>((resolve) => {
      releaseTimer.current = globalThis.setTimeout(
        () => {
          locked.current = false;
          setBusy(false);
          resolve();
        },
        Math.max(0, dealerInputGuardMs - elapsed),
      );
    });
    return accepted;
  }

  return { busy, run } as const;
}
function HostTable({
  activeView,
  hasPlayer,
  onDissolve,
  onViewChange,
  runtime,
}: {
  readonly activeView: "host" | "table" | "tv";
  readonly hasPlayer: boolean;
  readonly onDissolve: () => Promise<void>;
  readonly onViewChange: (view: HostDeviceView) => void;
  readonly runtime: HostTableRuntime;
}) {
  const { t } = useLanguage();
  const snapshot = useHostSnapshot(runtime);
  const [busy, setBusy] = useState(false);
  const actionGuard = useDealerActionGuard();
  const [error, setError] = useState<string>();
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminFocus, setAdminFocus] = useState<"displays" | "players">(
    "players",
  );
  const adminDrawerRef = useRef<HTMLElement>(null);
  const [developerMode, setDeveloperMode] = useState(false);
  useScreenWakeLock(true);
  const projection = snapshot.projection;

  useLayoutEffect(() => {
    if (isAirplaneMode() || !adminOpen || adminFocus !== "players") {
      return;
    }
    adminDrawerRef.current?.scrollTo({ top: 0 });
  }, [
    adminFocus,
    adminOpen,
    snapshot.invitations.player?.token,
    snapshot.roster.joinWindowOpen,
  ]);

  if (!projection) return null;

  function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    void action()
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : t("The table did not advance."),
        );
      })
      .finally(() => setBusy(false));
  }

  function performDealerAction(action: () => Promise<void>): Promise<boolean> {
    return actionGuard.run(
      () => {
        setError(undefined);
        return action();
      },
      (caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : t("The table did not advance."),
        );
      },
    );
  }

  return (
    <div className="host-table-shell" data-theme={projection.tableTheme}>
      {activeView === "host" ? (
        <HostDeviceViewSwitcher
          activeView={activeView}
          hasPlayer={hasPlayer}
          onChange={onViewChange}
          tableReady
        />
      ) : null}
      <TableSurface
        airplaneMode={isAirplaneMode()}
        brandSymbolSrc={brandSymbolGold}
        busy={busy || actionGuard.busy}
        connectionLabel={snapshot.connectionLabel}
        developerMode={developerMode}
        {...((error ?? snapshot.error)
          ? { errorMessage: error ?? snapshot.error }
          : {})}
        hostPlayerAdministrationOpen={adminOpen}
        hostPlayerCount={snapshot.roster.seats.length}
        mode={
          activeView === "table"
            ? "tablet"
            : activeView === "tv"
              ? "tv"
              : "host"
        }
        {...(activeView === "table" || activeView === "tv"
          ? {
              onHostControls: () => onViewChange("host"),
            }
          : {})}
        {...(hasPlayer ? { onMyHand: () => onViewChange("player") } : {})}
        onDownloadLog={() =>
          downloadText(
            `html-poker-${runtime.tableId}-diagnostics.json`,
            runtime.exportDiagnostics(),
          )
        }
        onDissolveTable={onDissolve}
        onEndHand={() => performDealerAction(() => runtime.endHand())}
        onManageDisplays={() => {
          setAdminFocus("displays");
          setAdminOpen(true);
          onViewChange("host");
        }}
        onManagePlayers={() => {
          setAdminFocus("players");
          if (activeView !== "host") {
            setAdminOpen(true);
            onViewChange("host");
          } else {
            setAdminOpen(adminFocus === "players" ? !adminOpen : true);
          }
        }}
        onConfirmSettlement={() =>
          performDealerAction(() => runtime.confirmSettlement())
        }
        onPrepareSettlement={() =>
          performDealerAction(() => runtime.prepareSettlement())
        }
        onRevealStreet={(street) =>
          performDealerAction(() => runtime.revealStreet(street))
        }
        {...(activeView === "table" || activeView === "tv"
          ? { onReconnect: () => runtime.resumeConnectivity() }
          : {})}
        onStartNextHand={() =>
          performDealerAction(() => runtime.startNextHand())
        }
        onCardStyleChange={(cardStyle: CardStyle) =>
          performDealerAction(() => runtime.setCardStyle(cardStyle))
        }
        onTableView={() => onViewChange("table")}
        onTableThemeChange={(tableTheme) =>
          performDealerAction(() => runtime.setTableTheme(tableTheme))
        }
        onToggleDeveloperMode={() => setDeveloperMode(!developerMode)}
        projection={projection}
        productName={PRODUCT_NAME}
      />
      {adminOpen && activeView === "host" ? (
        <aside
          aria-label={t("Player administration")}
          className="admin-drawer"
          data-admin-focus={adminFocus}
          data-runtime={isAirplaneMode() ? "airplane" : "table-side"}
          ref={adminDrawerRef}
        >
          <header>
            <div>
              <p className="section-label">{t("Off-table controls")}</p>
              <h2>{t("Players")}</h2>
            </div>
            <div className="admin-drawer__header-actions">
              {!isAirplaneMode() && adminFocus === "players" ? (
                <button
                  className="admin-drawer__dissolve"
                  data-qa-control="host-dissolve-table-drawer"
                  disabled={busy || actionGuard.busy}
                  onClick={() => void onDissolve()}
                  type="button"
                >
                  {t("Dissolve table")}
                </button>
              ) : null}
              <button
                aria-label={t("Close player administration")}
                data-qa-control="administration-close"
                onClick={() => setAdminOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
          </header>
          <InvitePanel compact runtime={runtime} snapshot={snapshot} />
          <RoleInvitations
            onUseThisDevice={(role) => {
              setAdminOpen(false);
              onViewChange(role === "tv" ? "tv" : "table");
            }}
            runtime={runtime}
            snapshot={snapshot}
          />
          <RelaySessionCard runtime={runtime} snapshot={snapshot} />
          <TableThemePicker
            busy={busy || actionGuard.busy}
            onChange={(tableTheme) =>
              void performDealerAction(() => runtime.setTableTheme(tableTheme))
            }
            value={projection.tableTheme}
          />
          <SeatRoster
            onMove={(seatId, position) =>
              perform(() => runtime.setDisplayPosition(seatId, position))
            }
            onRelocateDealer={(seatId) =>
              perform(() => runtime.relocateDealer(seatId))
            }
            onReplace={(seatId) =>
              perform(() => runtime.issuePlayerReplacement(seatId))
            }
            runtime={runtime}
            snapshot={snapshot}
          />
          <CapabilityAdministration
            onRevoke={(capabilityId) =>
              perform(() => runtime.revokeCapability(capabilityId))
            }
            snapshot={snapshot}
          />
          <RecoveryAdministration
            allowVoid={!projection.accounting}
            onCorrect={(eventId, reason) =>
              perform(() => runtime.recordCorrection(eventId, reason))
            }
            onVoid={(reason) => perform(() => runtime.voidHand(reason))}
            snapshot={snapshot}
          />
        </aside>
      ) : null}
    </div>
  );
}

function TableThemePicker({
  busy,
  onChange,
  value,
}: {
  readonly busy: boolean;
  readonly onChange: (theme: TableTheme) => void;
  readonly value: TableTheme;
}) {
  const { t } = useLanguage();
  const themes: readonly { readonly id: TableTheme; readonly label: string }[] =
    [
      { id: "dark-green", label: "Dark Green" },
      { id: "black-gold", label: "Black Gold" },
      { id: "deep-navy", label: "Deep Navy" },
    ];
  return (
    <section
      className="admin-section theme-picker"
      aria-labelledby="theme-title"
    >
      <p className="section-label">{t("Appearance")}</p>
      <h3 id="theme-title">{t("Table theme")}</h3>
      <p>{t("Synced to every phone and display at this table.")}</p>
      <div className="theme-picker__options">
        {themes.map((theme) => (
          <button
            aria-pressed={value === theme.id}
            data-qa-control="host-theme-choice"
            data-qa-variant={theme.id}
            data-theme-option={theme.id}
            disabled={busy}
            key={theme.id}
            onClick={() => onChange(theme.id)}
            type="button"
          >
            <span aria-hidden="true" />
            {t(theme.label)}
          </button>
        ))}
      </div>
    </section>
  );
}

function useClientSnapshot(runtime: TableClientRuntime): ClientRuntimeSnapshot {
  const [snapshot, setSnapshot] = useState(() => runtime.snapshot());
  useEffect(
    () => runtime.subscribe(() => setSnapshot(runtime.snapshot())),
    [runtime],
  );
  return snapshot;
}

function LeaveTableDialog({
  busy,
  onCancel,
  onConfirm,
  tableTheme,
}: {
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly tableTheme: TableTheme;
}) {
  const { t } = useLanguage();
  return (
    <div
      className="confirm-backdrop"
      data-theme={tableTheme}
      role="presentation"
    >
      <section
        aria-labelledby="leave-table-title"
        aria-modal="true"
        className="confirm-dialog"
        role="dialog"
      >
        <p className="section-label">{t("Permanent on this seat")}</p>
        <h2 id="leave-table-title">{t("Leave this table?")}</h2>
        <p>
          {t(
            "This seat credential will be revoked and cannot reconnect. The host can keep the empty seat for history or replace its device.",
          )}
        </p>
        <div className="button-row">
          <button
            autoFocus
            className="button button--quiet"
            data-qa-control="leave-dialog-cancel"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            {t("Stay at table")}
          </button>
          <button
            className="button button--danger"
            data-qa-control="leave-dialog-confirm"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? t("Leaving…") : t("Leave permanently")}
          </button>
        </div>
      </section>
    </div>
  );
}

function PlayerExperience({
  manageLifecycle = true,
  runtime,
}: {
  readonly manageLifecycle?: boolean;
  readonly runtime: TableClientRuntime;
}) {
  const { t } = useLanguage();
  const snapshot = useClientSnapshot(runtime);
  const playerProjection =
    snapshot.projection?.view === "seat" ? snapshot.projection : undefined;
  const reconnectRequired = Boolean(
    playerProjection?.seats.some(
      (seat) =>
        seat.seatId === playerProjection.self.seatId &&
        seat.connected === false,
    ),
  );
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  useScreenWakeLock(snapshot.status === "playing");

  useEffect(() => {
    if (!manageLifecycle) return;
    let hidden = false;
    let resuming = false;
    const hide = () => {
      if (hidden) return;
      hidden = true;
      // Browsers may terminate a page before this best-effort signal reaches
      // the host. Do not close the endpoint here: pagehide also covers a
      // restorable back-forward-cache or mobile suspension.
      void runtime.setPresence(false).catch(() => undefined);
    };
    const show = () => {
      if (document.visibilityState === "hidden" || resuming) return;
      hidden = false;
      resuming = true;
      setError(undefined);
      void runtime
        .setPresence(true)
        .catch(() => {
          setError(
            isAirplaneMode()
              ? "Connection did not resume. Ask the host to replace this device from Players."
              : "Connection did not resume. Check the network and choose Reconnect to table.",
          );
        })
        .finally(() => {
          resuming = false;
        });
    };
    const visibilityChanged = () => {
      if (document.visibilityState === "hidden") hide();
      else show();
    };
    const poll = globalThis.setInterval(show, 4_000);
    globalThis.addEventListener("pagehide", hide);
    globalThis.addEventListener("pageshow", show);
    globalThis.addEventListener("focus", show);
    globalThis.addEventListener("online", show);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      globalThis.removeEventListener("pagehide", hide);
      globalThis.removeEventListener("pageshow", show);
      globalThis.removeEventListener("focus", show);
      globalThis.removeEventListener("online", show);
      document.removeEventListener("visibilitychange", visibilityChanged);
      globalThis.clearInterval(poll);
    };
  }, [manageLifecycle, runtime]);

  useEffect(() => {
    if (playerProjection?.self.status !== "folded-provisional") return;
    const timer = globalThis.setTimeout(() => {
      void runtime
        .performPlayer({ type: "finalize-fold" })
        .catch(() => undefined);
    }, 5_000);
    return () => globalThis.clearTimeout(timer);
  }, [runtime, playerProjection?.revision, playerProjection?.self.status]);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await runtime.join(displayName);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The table did not respond.",
      );
    } finally {
      setBusy(false);
    }
  }

  function perform(action: PlayerAction) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    void runtime
      .performPlayer(action)
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "The action was not accepted.",
        );
      })
      .finally(() => setBusy(false));
  }

  async function reconnect(): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(undefined);
    try {
      await runtime.setPresence(true);
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Connection did not resume. Check the network and try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function leaveTable(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await runtime.performPlayer({ type: "leave" });
      runtime.close();
      const home = new URL(globalThis.location.href);
      home.hash = "";
      globalThis.history.replaceState(null, "", home);
      globalThis.location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The seat could not be left safely.",
      );
      setLeaveConfirmOpen(false);
      setBusy(false);
    }
  }

  if (!snapshot.seat && snapshot.status !== "rejected") {
    return (
      <main className="join-shell">
        <BrandBar
          aside={
            <>
              <LanguageSwitch compact />
              <span className="secure-label">{t("Encrypted invitation")}</span>
            </>
          }
        />
        <section className="join-card" aria-labelledby="join-title">
          <p className="section-label">{t("Player seat")}</p>
          <h1 id="join-title">{t("Join this table")}</h1>
          <p>
            {t(
              "Your name is only a label at this table. It is not an account.",
            )}
          </p>
          <form onSubmit={(event) => void join(event)}>
            <label>
              <span>{t("Display name")}</span>
              <input
                autoComplete="nickname"
                autoFocus
                maxLength={
                  isAirplaneMode() ? 40 : TABLE_SIDE_DISPLAY_NAME_MAX_LENGTH
                }
                onChange={(event) => setDisplayName(event.target.value)}
                value={displayName}
              />
              {!isAirplaneMode() ? (
                <small>
                  {t("Up to 24 characters keeps the table display readable.")}
                </small>
              ) : null}
            </label>
            {error ? (
              <p className="inline-warning" role="alert">
                {error}
              </p>
            ) : null}
            <button
              className="button button--primary button--wide"
              data-qa-control="player-join-table"
              disabled={!displayName.trim() || busy}
              type="submit"
            >
              {busy ? t("Taking seat…") : t("Join table")}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (snapshot.status === "rejected") {
    return (
      <main className="message-shell">
        <section>
          <p className="section-label">{t("Invitation unavailable")}</p>
          <h1>{t("This seat could not be opened")}</h1>
          <p>
            {snapshot.error ?? t("Ask the host for a fresh player invitation.")}
          </p>
        </section>
      </main>
    );
  }

  if (snapshot.status === "waiting" || !playerProjection) {
    const sittingOutNow = snapshot.seat?.state === "sitting-out";
    const stayingOutNextHand = snapshot.futureSittingOut;
    const returningNextHand = sittingOutNow && !stayingOutNextHand;
    return (
      <main
        className="message-shell message-shell--player-waiting"
        data-theme={snapshot.tableTheme}
      >
        <section className="waiting-seat-card">
          <p className="section-label">
            Seat{" "}
            {snapshot.seat?.displayPosition !== undefined
              ? snapshot.seat.displayPosition + 1
              : ""}
          </p>
          <h1>{t("You have a seat")}</h1>
          <p>
            {stayingOutNextHand
              ? `${snapshot.seat?.displayName}, you are sitting out. Return now to be eligible for the next hand.`
              : returningNextHand
                ? `${snapshot.seat?.displayName}, you are ready and will receive cards when the next hand begins.`
                : `${snapshot.seat?.displayName}, your cards arrive when the Trusted Host deals the next hand.`}
          </p>
          <span className="waiting-line">
            <i />{" "}
            {stayingOutNextHand
              ? t("Sitting out")
              : returningNextHand
                ? t("Ready for next hand")
                : t("Waiting for the deal")}
          </span>
          {(error ?? snapshot.error) ? (
            <p className="inline-warning" role="alert">
              {error ?? snapshot.error}
            </p>
          ) : null}
          <div className="waiting-seat-actions">
            {stayingOutNextHand ? (
              <button
                className="button button--primary"
                data-qa-control="player-return-next-hand"
                disabled={busy}
                onClick={() =>
                  perform({ sittingOut: false, type: "set-sitting-out" })
                }
                type="button"
              >
                {t("Return for next hand")}
              </button>
            ) : null}
            <button
              className="button button--quiet"
              data-qa-control="player-refresh-waiting"
              disabled={busy}
              onClick={() => void reconnect()}
              type="button"
            >
              {t("Refresh table status")}
            </button>
            <button
              className="waiting-seat-leave"
              data-qa-control="player-leave-waiting"
              disabled={busy}
              onClick={() => setLeaveConfirmOpen(true)}
              type="button"
            >
              {t("Leave table permanently")}
            </button>
          </div>
        </section>
        {leaveConfirmOpen ? (
          <LeaveTableDialog
            busy={busy}
            onCancel={() => setLeaveConfirmOpen(false)}
            onConfirm={() => void leaveTable()}
            tableTheme={snapshot.tableTheme}
          />
        ) : null}
      </main>
    );
  }

  return (
    <>
      <TableSurface
        airplaneMode={isAirplaneMode()}
        brandSymbolSrc={brandSymbolGold}
        busy={busy}
        connectionLabel={snapshot.connectionLabel}
        {...((error ?? snapshot.error)
          ? { errorMessage: error ?? snapshot.error }
          : {})}
        futureSittingOut={snapshot.futureSittingOut}
        mode="player"
        onBettingAction={(action) => perform({ action, type: "betting" })}
        onFinalizeFold={() => perform({ type: "finalize-fold" })}
        onFold={() => perform({ type: "fold" })}
        {...(manageLifecycle
          ? { onLeaveTable: () => setLeaveConfirmOpen(true) }
          : {})}
        {...(isAirplaneMode() || reconnectRequired
          ? { onReconnect: reconnect }
          : {})}
        onShowCards={() => perform({ type: "show" })}
        onToggleSittingOut={(sittingOut) =>
          perform({ sittingOut, type: "set-sitting-out" })
        }
        onUndoFold={() => perform({ type: "undo-fold" })}
        projection={playerProjection}
        productName={PRODUCT_NAME}
      />
      {leaveConfirmOpen ? (
        <LeaveTableDialog
          busy={busy}
          onCancel={() => setLeaveConfirmOpen(false)}
          onConfirm={() => void leaveTable()}
          tableTheme={snapshot.tableTheme}
        />
      ) : null}
    </>
  );
}

function RoleExperience({ runtime }: { readonly runtime: TableClientRuntime }) {
  const { t } = useLanguage();
  const snapshot = useClientSnapshot(runtime);
  const joinStarted = useRef(false);
  const actionGuard = useDealerActionGuard();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (snapshot.status !== "joining" || joinStarted.current) return;
    joinStarted.current = true;
    void runtime.join().catch((caught: unknown) => {
      setError(
        caught instanceof Error
          ? caught.message
          : "The display could not join.",
      );
    });
  }, [runtime, snapshot.status]);

  useEffect(() => {
    let resuming = false;
    const resume = () => {
      if (document.visibilityState === "hidden" || resuming) return;
      resuming = true;
      setError(undefined);
      void runtime
        .reconnect()
        .catch((caught: unknown) => {
          setError(
            caught instanceof Error
              ? caught.message
              : "The table did not respond.",
          );
        })
        .finally(() => {
          resuming = false;
        });
    };
    const visibilityChanged = () => {
      if (document.visibilityState === "visible") resume();
    };
    const poll = globalThis.setInterval(resume, 4_000);
    globalThis.addEventListener("pageshow", resume);
    globalThis.addEventListener("focus", resume);
    globalThis.addEventListener("online", resume);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      globalThis.removeEventListener("pageshow", resume);
      globalThis.removeEventListener("focus", resume);
      globalThis.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", visibilityChanged);
      globalThis.clearInterval(poll);
    };
  }, [runtime]);

  const label =
    runtime.role === "public-table"
      ? "Public Table"
      : runtime.role === "tv"
        ? "TV"
        : "Tablet Control";

  if (snapshot.status === "rejected" || error) {
    return (
      <main className="message-shell">
        <section>
          <p className="section-label">{label}</p>
          <h1>{t("This room surface could not be opened")}</h1>
          <p>
            {error ?? snapshot.error ?? t("Ask the host for a fresh link.")}
          </p>
          <button
            className="button button--primary"
            data-qa-control="role-reconnect-error"
            onClick={() => {
              setError(undefined);
              void runtime.reconnect().catch((caught: unknown) => {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "The table did not respond.",
                );
              });
            }}
            type="button"
          >
            {t("Reconnect to table")}
          </button>
        </section>
      </main>
    );
  }

  if (snapshot.status !== "playing" || !snapshot.projection) {
    return (
      <main className="message-shell">
        <section>
          <p className="section-label">{label}</p>
          <h1>{t("Connecting to the table")}</h1>
          <p>
            {t("The public board will appear when the Trusted Host responds.")}
          </p>
          <span className="waiting-line">
            <i /> {t("Waiting for the host")}
          </span>
        </section>
      </main>
    );
  }

  function perform(
    action: Parameters<TableClientRuntime["performDealer"]>[0],
  ): Promise<boolean> {
    return actionGuard.run(
      () => {
        setError(undefined);
        return runtime.performDealer(action);
      },
      (caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "The dealer action was not accepted.",
        );
      },
    );
  }

  return (
    <TableSurface
      airplaneMode={isAirplaneMode()}
      brandSymbolSrc={brandSymbolGold}
      busy={actionGuard.busy}
      connectionLabel={snapshot.connectionLabel}
      {...((error ?? snapshot.error)
        ? { errorMessage: error ?? snapshot.error }
        : {})}
      mode={
        runtime.role === "public-table"
          ? "public"
          : runtime.role === "tv"
            ? "tv"
            : "tablet"
      }
      onEndHand={() => perform({ type: "end-hand" })}
      onConfirmSettlement={() => perform({ type: "confirm-settlement" })}
      onPrepareSettlement={() => perform({ type: "prepare-settlement" })}
      onRevealStreet={(street) => perform({ street, type: "reveal-street" })}
      onStartNextHand={() => perform({ type: "start-next-hand" })}
      onReconnect={() => runtime.reconnect()}
      projection={snapshot.projection}
      productName={PRODUCT_NAME}
    />
  );
}

function AirplaneJoin({
  onCancel,
  onReady,
}: {
  readonly onCancel: () => void;
  readonly onReady: (runtime: TableClientRuntime) => void;
}) {
  const { setLanguage, t } = useLanguage();
  const [pairing, setPairing] = useState<{
    readonly answerCode: string;
    readonly presentationLanguage?: "en" | "zh";
    readonly runtime: TableClientRuntime;
  }>();
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [scannerOpen, setScannerOpen] = useState(false);

  async function readOffer(code: string) {
    pairing?.runtime.close();
    setPairing(undefined);
    setBusy(true);
    setError(undefined);
    try {
      const accepted = await TableClientRuntime.fromAirplaneOffer(code);
      if (!readStoredLanguage() && accepted.presentationLanguage) {
        setLanguage(accepted.presentationLanguage);
      }
      setPairing(accepted);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The Airplane offer could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    if (!pairing) return;
    setBusy(true);
    setError(undefined);
    try {
      await pairing.runtime.join(
        pairing.runtime.role === "player" ? displayName : undefined,
      );
      onReady(pairing.runtime);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The direct Airplane channel did not open.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="airplane-join-shell">
      <BrandBar
        aside={
          <div className="brand-bar__actions">
            <LanguageSwitch compact />
            <span className="secure-label">{t("No internet mode")}</span>
          </div>
        }
      />
      <section className="airplane-join-card">
        <div>
          <p className="section-label">{t("Airplane pairing")}</p>
          <h1>
            {pairing
              ? t("Show the answer to the host")
              : t("Scan the host offer")}
          </h1>
          <p>
            {pairing
              ? t(
                  "The host scans this answer on their device. Then join over the direct local WebRTC channel.",
                )
              : t(
                  "Point this device's camera at the offer QR shown by the Trusted Host. It is decoded only on this device.",
                )}
          </p>
        </div>
        <div className="airplane-join-card__pairing">
          {pairing ? (
            <QrImage
              label="Airplane answer QR code"
              value={pairing.answerCode}
            />
          ) : (
            <button
              className="airplane-scan-target"
              data-qa-control="airplane-player-scan-offer"
              disabled={busy}
              onClick={() => setScannerOpen(true)}
              type="button"
            >
              <span>{busy ? t("Reading QR…") : t("Scan host offer QR")}</span>
              <small>{t("Opens the camera")}</small>
            </button>
          )}
        </div>
        {pairing?.runtime.role === "player" ? (
          <label className="airplane-name-field">
            <span>{t("Display name")}</span>
            <input
              autoComplete="nickname"
              maxLength={40}
              onChange={(event) => setDisplayName(event.target.value)}
              value={displayName}
            />
          </label>
        ) : null}
        {error ? (
          <p className="inline-warning" role="alert">
            {error}
          </p>
        ) : null}
        <div className="button-row">
          <button
            className="button button--quiet"
            data-qa-control="airplane-player-cancel"
            onClick={() => {
              pairing?.runtime.close();
              onCancel();
            }}
            type="button"
          >
            {t("Cancel")}
          </button>
          {pairing ? (
            <button
              className="button button--primary"
              data-qa-control="airplane-player-join-after-scan"
              disabled={
                busy ||
                (pairing.runtime.role === "player" && !displayName.trim())
              }
              onClick={() => void join()}
              type="button"
            >
              {busy ? t("Connecting…") : t("Join after host scans")}
            </button>
          ) : null}
        </div>
      </section>
      {scannerOpen ? (
        <QrCameraScanner
          label={t("Scan host offer QR")}
          onClose={() => setScannerOpen(false)}
          onCode={(code) => {
            setScannerOpen(false);
            void readOffer(code);
          }}
        />
      ) : null}
    </main>
  );
}

function TableSideDisplayJoin({
  onCancel,
  onReady,
}: {
  readonly onCancel: () => void;
  readonly onReady: (runtime: TableClientRuntime) => void;
}) {
  const { t } = useLanguage();
  const [error, setError] = useState<string>();
  const [pairing, setPairing] = useState<TableSideDisplayPairingRequest>();

  useEffect(
    () => () => {
      pairing?.cancel();
    },
    [pairing],
  );

  function prepare(role: "public-table" | "tv") {
    pairing?.cancel();
    setError(undefined);
    try {
      const request = createTableSideDisplayPairingRequest(role);
      setPairing(request);
      void request.waitForInvitation().then(
        (details) => onReady(TableClientRuntime.fromInvitation(details)),
        (caught: unknown) => {
          setError(
            caught instanceof Error
              ? caught.message
              : "The display pairing did not complete.",
          );
        },
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The display pairing could not start.",
      );
    }
  }

  const label = pairing?.role === "tv" ? "TV" : "Public Table";
  return (
    <main className="airplane-join-shell">
      <BrandBar
        aside={<span className="build-label">{t("Table-side pairing")}</span>}
      />
      <section className="airplane-join-card">
        <div>
          <p className="section-label">{t("Display pairing")}</p>
          <h1>
            {pairing
              ? `${t("Show this")} ${t(label)} ${t("request")}`
              : t("Pair this display")}
          </h1>
          <p>
            {pairing
              ? t(
                  "Show this short-lived request to the host. It can only become the role chosen below after the host scans it.",
                )
              : t(
                  "Choose a public display role. A dealer tablet always needs its own explicit invitation.",
                )}
          </p>
        </div>
        {pairing ? (
          <div className="airplane-join-card__pairing">
            <QrImage
              label={`${label} display pairing QR code`}
              value={pairing.code}
            />
            <span className="waiting-line">
              <i /> {t("Waiting for the host scan")}
            </span>
          </div>
        ) : null}
        {error ? (
          <p className="inline-warning" role="alert">
            {error}
          </p>
        ) : null}
        <div className="button-row">
          <button
            className="button button--quiet"
            data-qa-control="display-pair-cancel"
            onClick={() => {
              pairing?.cancel();
              onCancel();
            }}
            type="button"
          >
            {t("Cancel")}
          </button>
          <button
            className="button button--quiet"
            data-qa-control="display-pair-public"
            onClick={() => prepare("public-table")}
            type="button"
          >
            {t("Pair as Public Table")}
          </button>
          <button
            className="button button--primary"
            data-qa-control="display-pair-tv"
            onClick={() => prepare("tv")}
            type="button"
          >
            {t("Pair as TV")}
          </button>
        </div>
      </section>
    </main>
  );
}

function AppContent() {
  const { setLanguage, t } = useLanguage();
  const initialRoute = useMemo(
    () => ({
      clientRecovery: parseClientRecovery(globalThis.location.hash),
      hash: globalThis.location.hash,
      hostRecovery: parseHostRecovery(globalThis.location.hash),
      invitation: parseInvitation(globalThis.location.hash),
    }),
    [],
  );
  const [hostRuntime, setHostRuntime] = useState<HostTableRuntime>();
  const [hostPlayerRuntime, setHostPlayerRuntime] =
    useState<TableClientRuntime>();
  const [hostDeviceView, setHostDeviceView] = useState<HostDeviceView>("host");
  const [hostPlayerRecoveryError, setHostPlayerRecoveryError] =
    useState<string>();
  const [clientRuntime, setClientRuntime] = useState<
    TableClientRuntime | undefined
  >(() =>
    initialRoute.invitation
      ? TableClientRuntime.fromInvitation(initialRoute.invitation)
      : undefined,
  );
  const [booting, setBooting] = useState(
    Boolean(initialRoute.hostRecovery || initialRoute.clientRecovery),
  );
  const [bootError, setBootError] = useState<string>();
  const [airplaneJoinOpen, setAirplaneJoinOpen] = useState(false);
  const [tableSideDisplayJoinOpen, setTableSideDisplayJoinOpen] =
    useState(false);

  useEffect(() => {
    if (initialRoute.invitation) return;
    let active = true;
    async function recover() {
      try {
        if (initialRoute.hostRecovery) {
          const runtime = await HostTableRuntime.recover(
            initialRoute.hostRecovery,
          );
          let recoveredPlayer: TableClientRuntime | undefined;
          let recoveredPlayerError: string | undefined;
          const playerRecovery = parseHostPlayerRecovery(
            initialRoute.hash,
            runtime.binding,
          );
          if (playerRecovery) {
            try {
              recoveredPlayer = await TableClientRuntime.recover(
                playerRecovery,
                { recoveryNavigation: "embedded-host" },
              );
            } catch (caught) {
              recoveredPlayerError =
                caught instanceof Error
                  ? `My Hand recovery stopped: ${caught.message} Use Players → Replace device for that seat.`
                  : "My Hand recovery stopped. Use Players → Replace device for that seat.";
            }
          }
          if (active) {
            setHostRuntime(runtime);
            setHostPlayerRuntime(recoveredPlayer);
            setHostPlayerRecoveryError(recoveredPlayerError);
          } else {
            recoveredPlayer?.close();
            runtime.close();
          }
        } else if (initialRoute.clientRecovery) {
          const runtime = await TableClientRuntime.recover(
            initialRoute.clientRecovery,
          );
          if (active) setClientRuntime(runtime);
          else runtime.close();
        }
      } catch (caught) {
        if (active) {
          setBootError(
            caught instanceof Error
              ? caught.message
              : "Saved table recovery failed safely.",
          );
        }
      } finally {
        if (active) setBooting(false);
      }
    }
    void recover();
    return () => {
      active = false;
    };
  }, [initialRoute]);

  useEffect(() => {
    return () => {
      hostRuntime?.close();
      clientRuntime?.close();
    };
  }, [clientRuntime, hostRuntime]);

  useEffect(() => {
    return () => hostPlayerRuntime?.close();
  }, [hostPlayerRuntime]);

  useEffect(() => {
    if (!hostRuntime) return;
    let backgrounded = false;
    let resuming = false;
    const pauseEmbeddedPlayer = () => {
      if (backgrounded) return;
      backgrounded = true;
      void hostPlayerRuntime?.setPresence(false).catch(() => undefined);
    };
    const resume = () => {
      if (document.visibilityState === "hidden" || resuming) return;
      backgrounded = false;
      resuming = true;
      void (async () => {
        // Re-register the Trusted Host first. The embedded Player uses the
        // same phone and can otherwise race its first authenticated refresh
        // against a relay that has not seen the host return yet.
        await hostRuntime.resumeConnectivity().catch(() => undefined);
        if (!hostPlayerRuntime) return;
        try {
          await hostPlayerRuntime.setPresence(true);
          setHostPlayerRecoveryError(undefined);
        } catch (caught) {
          setHostPlayerRecoveryError(
            caught instanceof Error
              ? `My Hand did not reconnect: ${caught.message}`
              : "My Hand did not reconnect. Choose My Hand and reconnect.",
          );
        }
      })().finally(() => {
        resuming = false;
      });
    };
    const visibilityChanged = () => {
      if (document.visibilityState === "hidden") pauseEmbeddedPlayer();
      else resume();
    };
    const poll = globalThis.setInterval(resume, 4_000);
    globalThis.addEventListener("pagehide", pauseEmbeddedPlayer);
    globalThis.addEventListener("pageshow", resume);
    globalThis.addEventListener("focus", resume);
    globalThis.addEventListener("online", resume);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      globalThis.removeEventListener("pagehide", pauseEmbeddedPlayer);
      globalThis.removeEventListener("pageshow", resume);
      globalThis.removeEventListener("focus", resume);
      globalThis.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", visibilityChanged);
      globalThis.clearInterval(poll);
    };
  }, [hostPlayerRuntime, hostRuntime]);

  function showHostDeviceView(view: HostDeviceView): void {
    setHostDeviceView(view);
    globalThis.requestAnimationFrame(() => {
      globalThis.scrollTo({ behavior: "auto", left: 0, top: 0 });
    });
  }

  async function joinOwnDevice(displayName: string): Promise<void> {
    if (!hostRuntime) throw new Error("The Trusted Host is not ready.");
    if (hostPlayerRuntime) {
      showHostDeviceView("player");
      return;
    }
    const invitation = hostRuntime.snapshot().invitations.player;
    if (!invitation || invitation.seatId) {
      throw new Error(
        "No new-player invitation is available. Open the Join Window and try again.",
      );
    }
    const relayRoutes = hostRuntime.relayRoutes;
    const runtime = TableClientRuntime.fromInvitation(
      {
        binding: { ...hostRuntime.binding },
        invitationToken: invitation.token,
        ...(relayRoutes ? { relayRoutes } : {}),
        role: "player",
      },
      { recoveryNavigation: "embedded-host" },
    );
    try {
      await runtime.join(displayName);
      const snapshot = runtime.snapshot();
      if (snapshot.status === "rejected") {
        throw new Error(snapshot.error ?? "The player seat was rejected.");
      }
      const recovery = runtime.recoveryDetails();
      replaceWithHostRecoveryUrl(
        globalThis.location,
        hostRuntime.tableId,
        recovery.slotId,
      );
      setHostPlayerRecoveryError(undefined);
      setHostPlayerRuntime(runtime);
      showHostDeviceView("player");
    } catch (caught) {
      runtime.close();
      throw caught;
    }
  }

  async function dissolveHostedTable(): Promise<void> {
    if (!hostRuntime) return;
    const confirmed = globalThis.confirm(
      "Dissolve this table for every connected player and display? This cannot be undone.",
    );
    if (!confirmed) return;
    await hostRuntime.dissolve();
    hostPlayerRuntime?.close();
    hostRuntime.close();
    setHostPlayerRuntime(undefined);
    setHostRuntime(undefined);
    setHostDeviceView("host");
    const home = new URL(globalThis.location.href);
    home.hash = "";
    globalThis.history.replaceState(null, "", home);
  }

  if (clientRuntime) {
    return clientRuntime.role === "player" ? (
      <PlayerExperience runtime={clientRuntime} />
    ) : (
      <RoleExperience runtime={clientRuntime} />
    );
  }
  if (hostRuntime)
    return (
      <HostLobby
        activeView={hostDeviceView}
        onDissolve={dissolveHostedTable}
        onJoinOwnDevice={joinOwnDevice}
        onViewChange={showHostDeviceView}
        {...(hostPlayerRuntime ? { playerRuntime: hostPlayerRuntime } : {})}
        {...(hostPlayerRecoveryError
          ? { recoveryError: hostPlayerRecoveryError }
          : {})}
        runtime={hostRuntime}
      />
    );
  if (airplaneJoinOpen) {
    return (
      <AirplaneJoin
        onCancel={() => setAirplaneJoinOpen(false)}
        onReady={(runtime) => {
          setAirplaneJoinOpen(false);
          setClientRuntime(runtime);
        }}
      />
    );
  }
  if (tableSideDisplayJoinOpen) {
    return (
      <TableSideDisplayJoin
        onCancel={() => setTableSideDisplayJoinOpen(false)}
        onReady={(runtime) => {
          setTableSideDisplayJoinOpen(false);
          setClientRuntime(runtime);
        }}
      />
    );
  }
  if (booting) {
    return (
      <main className="message-shell">
        <section>
          <p className="section-label">{t("Encrypted recovery")}</p>
          <h1>{t("Restoring this table")}</h1>
          <p>
            {t("Validating the last committed state and exclusive authority…")}
          </p>
        </section>
      </main>
    );
  }
  if (bootError) {
    return (
      <main className="message-shell">
        <section>
          <p className="section-label">{t("Recovery stopped safely")}</p>
          <h1>{t("This saved table cannot be opened")}</h1>
          <p>{bootError}</p>
          <button
            className="button button--quiet"
            data-qa-control="recovery-return-home"
            onClick={() => {
              const url = new URL(globalThis.location.href);
              url.hash = "";
              globalThis.location.assign(url);
            }}
            type="button"
          >
            {t("Return home")}
          </button>
        </section>
      </main>
    );
  }
  return (
    <Home
      onCreate={async (options) => {
        const runtime = await HostTableRuntime.createNew(options);
        replaceWithHostRecoveryUrl(globalThis.location, runtime.tableId);
        showHostDeviceView("host");
        setHostRuntime(runtime);
      }}
      onJoinSession={(rawUrl) => {
        const url = new URL(rawUrl);
        if (!readStoredLanguage()) {
          const invitedLanguage = languageFromUrl(url.toString());
          if (invitedLanguage) setLanguage(invitedLanguage);
        }
        const invitation = parseInvitation(url.hash);
        if (!invitation) {
          throw new Error("The invitation URL is incomplete.");
        }
        const current = new URL(globalThis.location.href);
        current.search = "";
        current.hash = url.hash;
        globalThis.history.replaceState(null, "", current);
        setClientRuntime(TableClientRuntime.fromInvitation(invitation));
      }}
      {...(isAirplaneMode()
        ? { onJoinAirplane: () => setAirplaneJoinOpen(true) }
        : {})}
      {...(!isAirplaneMode() && tableSideDisplayPairingIsConfigured()
        ? { onPairDisplay: () => setTableSideDisplayJoinOpen(true) }
        : {})}
    />
  );
}

export function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}
