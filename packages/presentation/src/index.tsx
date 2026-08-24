import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import type { Card, Street } from "@html-poker/card-custody";
import type {
  BettingActionIntent,
  HandPhase,
  PublicProjection,
  SeatProjection,
  CardStyle,
  TableTheme,
} from "@html-poker/game-core";

import { cardFaceSrc } from "./card-face-assets";

declare const __HTML_POKER_AIRPLANE_BUILD__: boolean | undefined;

// Vite replaces this at build time. Keeping the compile-time branch here
// lets the standalone artifact omit Normal-only court and full-face markup,
// rather than merely hiding it at runtime.
const airplaneBuild =
  typeof __HTML_POKER_AIRPLANE_BUILD__ !== "undefined" &&
  __HTML_POKER_AIRPLANE_BUILD__;

export type PresentationMode = "host" | "player" | "tablet" | "tv" | "public";

type ActionResult = boolean | void | Promise<boolean | void>;

export interface TableSurfaceProps {
  readonly brandSymbolSrc: string;
  readonly busy: boolean;
  readonly connectionLabel: string;
  readonly developerMode?: boolean;
  readonly errorMessage?: string;
  readonly futureSittingOut?: boolean;
  readonly hostPlayerAdministrationOpen?: boolean;
  readonly hostPlayerCount?: number;
  readonly mode: PresentationMode;
  readonly onBettingAction?: (action: BettingActionIntent) => void;
  readonly onConfirmSettlement?: () => ActionResult;
  readonly onDownloadLog?: () => void;
  /** Trusted Host-only destructive action; runtime confirmation is owned by the app. */
  readonly onDissolveTable?: () => ActionResult;
  readonly onEndHand?: () => ActionResult;
  readonly onFinalizeFold?: () => void;
  readonly onFold?: () => void;
  readonly onHostControls?: () => void;
  readonly onLeaveTable?: () => ActionResult;
  readonly onManageDisplays?: () => void;
  readonly onManagePlayers?: () => void;
  readonly onMyHand?: () => void;
  readonly onPrepareSettlement?: () => ActionResult;
  readonly onReconnect?: () => ActionResult;
  readonly onRevealStreet?: (street: Street) => ActionResult;
  readonly onShowCards?: () => void;
  readonly onStartNextHand?: () => ActionResult;
  readonly onCardStyleChange?: (style: CardStyle) => ActionResult;
  readonly onTableView?: () => void;
  readonly onTableThemeChange?: (theme: TableTheme) => ActionResult;
  readonly onToggleSittingOut?: (sittingOut: boolean) => void;
  readonly onToggleDeveloperMode?: () => void;
  readonly onUndoFold?: () => void;
  readonly projection: PublicProjection | SeatProjection;
  readonly productName: string;
  /** Airplane is intentionally limited to its compact four-colour deck. */
  readonly airplaneMode?: boolean;
}

const suitDetails = {
  c: { label: "clubs", symbol: "♣" },
  d: { label: "diamonds", symbol: "♦" },
  h: { label: "hearts", symbol: "♥" },
  s: { label: "spades", symbol: "♠" },
} as const;

const rankNames: Record<string, string> = {
  A: "ace",
  J: "jack",
  K: "king",
  Q: "queen",
  T: "ten",
};

function cardDetails(card: Card) {
  const rank = card[0] ?? "";
  const suit = card[1] as keyof typeof suitDetails;
  return {
    accessibleName: `${rankNames[rank] ?? rank} of ${suitDetails[suit].label}`,
    isRed: suit === "d" || suit === "h",
    rank,
    suit: suitDetails[suit].symbol,
    suitCode: suit,
  };
}

type SuitCode = keyof typeof suitDetails;

function SuitGlyph({ suit }: { readonly suit: SuitCode }) {
  const paths: Record<SuitCode, string> = {
    // One continuous RevK-derived silhouette preserves the familiar three
    // lobes and flared stem when rasterised at the smallest phone sizes. The
    // previous four disconnected circles/stem read as a pawn or tree.
    c: "M52.5 62.5C52.92 82.08 57.08 83.33 60.83 91.67H39.17C42.92 83.33 47.08 82.08 47.5 62.5A0.83 0.83 0 0 0 45.83 62.5A17.5 17.5 0 1 1 39.67 45.75A0.83 0.83 0 0 0 40.83 44.58A19.17 19.17 0 1 1 59.17 44.58A0.83 0.83 0 0 0 60.33 45.75A17.5 17.5 0 1 1 54.17 62.5A0.83 0.83 0 0 0 52.5 62.5Z",
    d: "M50 2 98 50 50 98 2 50Z",
    h: "M50 94 10 53C-5 38 1 8 25 7c12 0 20 6 25 16C55 13 63 7 75 7c24 1 30 31 15 46Z",
    s: "M50 3C36 24 10 36 10 58c0 15 11 25 25 25 8 0 14-4 18-10-2 10-6 18-13 26h20c-7-8-11-16-13-26 4 6 10 10 18 10 14 0 25-10 25-25C90 36 64 24 50 3Z",
  };
  return (
    <svg
      aria-hidden="true"
      className="card__suit-glyph"
      focusable="false"
      viewBox="0 0 100 100"
    >
      <path d={paths[suit]} fill="currentColor" />
    </svg>
  );
}

function CourtFace({
  rank,
  suit,
}: {
  readonly rank: "J" | "K" | "Q";
  readonly suit: string;
}) {
  const name = rank === "K" ? "King" : rank === "Q" ? "Queen" : "Jack";
  return (
    <svg
      aria-label={`${name} court illustration`}
      className="card__court"
      data-court-rank={rank}
      role="img"
      viewBox="0 0 120 150"
    >
      <title>{name}</title>
      <path
        d="M18 136 28 82c3-16 17-25 32-25s29 9 32 25l10 54Z"
        fill="currentColor"
        opacity=".16"
      />
      <path
        d="M20 136 30 82c3-16 16-25 30-25s27 9 30 25l10 54"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        d="M37 135 42 103h36l5 32M29 102h62M45 116h30"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <ellipse
        cx="60"
        cy="63"
        fill="currentColor"
        opacity=".16"
        rx="20"
        ry="23"
      />
      <path
        d="M43 69c0-17 7-27 17-27s17 10 17 27c0 13-7 24-17 24S43 82 43 69Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
      />
      <path
        d="M51 70h3M66 70h3M55 81c3 2 7 2 10 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
      {rank === "K" ? (
        <path
          d="M37 45 41 21l12 14 7-19 7 19 12-14 4 24Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
      ) : rank === "Q" ? (
        <path
          d="m37 45 7-19 8 10 8-16 8 16 8-10 7 19"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
      ) : (
        <>
          <path
            d="M34 43h52l-7-18H41Z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="4"
          />
          <path
            d="M48 25v18M72 25v18"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
        </>
      )}
      <path
        d="M60 93v42M48 101l12 9 12-9"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <text x="60" y="127" textAnchor="middle">
        {suit}
      </text>
    </svg>
  );
}

export function PlayingCard({
  card,
  compact = false,
  compactGlyphsOnly = false,
  cardStyle = "classic",
  emphasis,
  marker,
  minimal = false,
  quietShown = false,
  fullFace = false,
}: {
  readonly card: Card;
  readonly cardStyle?: CardStyle;
  readonly compact?: boolean;
  /** Normal phone/host cards render only a rank and suit glyph. */
  readonly compactGlyphsOnly?: boolean;
  readonly emphasis?: "best" | "unused";
  readonly marker: "board" | "private" | "shown";
  readonly minimal?: boolean;
  readonly quietShown?: boolean;
  /** Render the approved full SVG face (Normal Mode only). */
  readonly fullFace?: boolean;
}) {
  const details = cardDetails(card);
  const renderFullFace = !airplaneBuild && fullFace;
  const displayRank =
    cardStyle === "classic" && details.rank === "T" ? "10" : details.rank;
  const hasCourtFace =
    !airplaneBuild &&
    cardStyle === "classic" &&
    !compactGlyphsOnly &&
    !minimal &&
    ["J", "Q", "K"].includes(details.rank);
  const markerProps =
    marker === "private"
      ? { "data-private-card": "true" }
      : marker === "board"
        ? { "data-board-card": "true" }
        : { "data-shown-card": "true" };
  return (
    <span
      aria-label={details.accessibleName}
      className={`card card--${cardStyle} card--suit-${card[1]}${details.isRed ? " card--red" : ""}${compact ? " card--compact" : ""}${minimal ? " card--minimal" : ""}${quietShown ? " card--quiet-shown" : ""}${renderFullFace ? " card--svg-face" : ""}${emphasis ? ` card--${emphasis}` : ""}`}
      data-card={card}
      {...(emphasis === "best" ? { "data-best-five-card": "true" } : {})}
      role="img"
      {...markerProps}
    >
      {renderFullFace ? (
        <img
          alt=""
          aria-hidden="true"
          className="card__face-svg"
          src={cardFaceSrc(cardStyle, card)}
        />
      ) : (
        <>
          <span className="card__corner card__corner--top" aria-hidden="true">
            <span className="card__rank">{displayRank}</span>
            <span className="card__corner-suit">
              <SuitGlyph suit={details.suitCode} />
            </span>
          </span>
          <span
            className={`card__pip${hasCourtFace ? " card__pip--court" : ""}`}
            aria-hidden="true"
          >
            {hasCourtFace ? (
              <CourtFace
                rank={details.rank as "J" | "K" | "Q"}
                suit={details.suit}
              />
            ) : (
              <SuitGlyph suit={details.suitCode} />
            )}
          </span>
          <span
            className="card__corner card__corner--bottom"
            aria-hidden="true"
          >
            <span className="card__rank">{displayRank}</span>
            <span className="card__corner-suit">
              <SuitGlyph suit={details.suitCode} />
            </span>
          </span>
        </>
      )}
    </span>
  );
}

function phaseLabel(phase: HandPhase): string {
  const labels: Record<HandPhase, string> = {
    complete: "Hand complete",
    flop: "Flop",
    lobby: "Table ready",
    preflop: "Pre-flop",
    river: "River",
    showdown: "Showdown",
    "settlement-pending": "Settlement review",
    turn: "Turn",
  };
  return labels[phase];
}

function BoardRail({
  bestCards,
  board,
  cardStyle = "classic",
  compactGlyphsOnly = false,
  fullFace = false,
  minimal = false,
}: {
  readonly bestCards?: ReadonlySet<Card>;
  readonly board: readonly Card[];
  readonly cardStyle?: CardStyle;
  readonly compactGlyphsOnly?: boolean;
  readonly fullFace?: boolean;
  readonly minimal?: boolean;
}) {
  return (
    <section className="dealer-rail" aria-label="Community cards">
      <h2 className="visually-hidden">Community cards</h2>
      <div className="dealer-rail__cards">
        {Array.from({ length: 5 }, (_, index) => {
          const card = board[index];
          return card ? (
            <PlayingCard
              card={card}
              cardStyle={cardStyle}
              compactGlyphsOnly={compactGlyphsOnly}
              fullFace={fullFace}
              minimal={minimal}
              {...(bestCards?.size
                ? { emphasis: bestCards.has(card) ? "best" : "unused" }
                : {})}
              key={card}
              marker="board"
            />
          ) : (
            <span
              className="card-space"
              key={`space-${index}`}
              aria-hidden="true"
            >
              <span>{index + 1}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}

function winningBestCards(
  projection: PublicProjection | SeatProjection,
): ReadonlySet<Card> | undefined {
  if (!projection.showdown) return undefined;
  const leaders = new Set(projection.showdown.leaders);
  const cards = projection.seats.flatMap((seat) =>
    leaders.has(seat.seatId) ? (seat.evaluation?.bestFive ?? []) : [],
  );
  return cards.length > 0 ? new Set(cards) : undefined;
}

function blindSeatIds(projection: PublicProjection | SeatProjection): {
  readonly bigBlindSeatId?: string;
  readonly smallBlindSeatId?: string;
} {
  const activeSeats = projection.seats.filter(
    (seat) => seat.status !== "sitting-out" && seat.status !== "waiting",
  );
  if (activeSeats.length < 2) return {};
  const dealerIndex = activeSeats.findIndex(
    (seat) => seat.seatId === projection.dealerSeatId,
  );
  if (dealerIndex < 0) return {};
  const smallBlindIndex =
    activeSeats.length === 2
      ? dealerIndex
      : (dealerIndex + 1) % activeSeats.length;
  const bigBlindIndex = (smallBlindIndex + 1) % activeSeats.length;
  const bigBlindSeatId = activeSeats[bigBlindIndex]?.seatId;
  const smallBlindSeatId = activeSeats[smallBlindIndex]?.seatId;
  return {
    ...(bigBlindSeatId ? { bigBlindSeatId } : {}),
    ...(smallBlindSeatId ? { smallBlindSeatId } : {}),
  };
}

export function tableSeatPosition(index: number, count: number): number {
  if (count <= 1) return 5;
  return Math.round((index * 10) / count) % 10;
}

function seatCanHoldPosition(seat: PublicProjection["seats"][number]): boolean {
  // A visible table marker is a promise that this seat is in the next hand.
  // Neither a sitting-out seat nor a waiting/recovering seat may carry D/SB/BB.
  return seat.status !== "sitting-out" && seat.status !== "waiting";
}

function SeatStateGlyph({
  connected,
  status,
  winner,
}: {
  readonly connected: boolean;
  readonly status: PublicProjection["seats"][number]["status"];
  readonly winner: boolean;
}) {
  if (!connected) {
    return (
      <span
        className="seat-state-glyph seat-state-glyph--offline"
        data-seat-status-glyph="seat-facing"
        aria-hidden="true"
      >
        <span />
      </span>
    );
  }
  if (status === "sitting-out" || status === "waiting") {
    return (
      <span
        className="seat-state-glyph seat-state-glyph--sitting-out"
        data-seat-status-glyph="seat-facing"
        aria-hidden="true"
      >
        <span />
      </span>
    );
  }
  const folded = ["folded", "folded-provisional", "mucked"].includes(status);
  return (
    <span
      className={`seat-state-glyph seat-state-glyph--cards${folded ? " seat-state-glyph--folded" : ""}${winner ? " seat-state-glyph--winner" : ""}`}
      data-seat-status-glyph="seat-facing"
      aria-hidden="true"
    >
      <span />
      <span />
    </span>
  );
}

function seatStateDescription(
  status: SeatProjection["self"]["status"],
  connected: boolean,
): string {
  if (!connected) return "Not connected";
  if (status === "shown") return "Shown to table";
  if (["folded", "folded-provisional", "mucked"].includes(status)) {
    return "Folded";
  }
  if (status === "sitting-out") return "Sitting out";
  if (status === "waiting") return "Waiting";
  return "Playing";
}

function QuietSeatGrid({
  cardStyle = "classic",
  fullFaceShown = false,
  projection,
  selfSeatId,
  showNames = false,
  showShownHands = true,
}: {
  readonly cardStyle?: CardStyle;
  readonly fullFaceShown?: boolean;
  readonly projection: PublicProjection | SeatProjection;
  readonly selfSeatId?: string;
  readonly showNames?: boolean;
  readonly showShownHands?: boolean;
}) {
  const { bigBlindSeatId, smallBlindSeatId } = blindSeatIds(projection);
  const winners = new Set(projection.showdown?.leaders ?? []);
  return (
    <section
      className="quiet-seat-grid"
      aria-label="Player status around table"
    >
      {projection.seats.map((seat, index) => {
        const connected = seat.connected !== false;
        const statusLabel = !connected
          ? "offline"
          : seat.status.replace("-", " ");
        const classifyShownCards =
          !airplaneBuild && Boolean(projection.showdown);
        const winningSelection = winners.has(seat.seatId)
          ? seat.evaluation
          : undefined;
        const position = tableSeatPosition(index, projection.seats.length);
        return (
          <div
            aria-label={`${seat.displayName}, ${statusLabel}`}
            className={`seat-edge-status seat-edge-status--${position}${showNames ? " seat-edge-status--show-name" : ""}${seat.seatId === selfSeatId ? " seat-edge-status--self" : ""}`}
            data-seat-edge-position={position}
            data-seat-edge-status={statusLabel}
            {...(seat.holeCards && showShownHands
              ? { "data-seat-has-shown-hand": "true" }
              : {})}
            {...(seat.seatId === selfSeatId
              ? { "data-seat-self": "true" }
              : {})}
            data-seat-id={seat.seatId}
            key={seat.seatId}
            role="img"
          >
            <SeatStateGlyph
              connected={connected}
              status={seat.status}
              winner={winners.has(seat.seatId)}
            />
            {seat.holeCards && showShownHands ? (
              <span
                className="quiet-shown-hand"
                aria-label={`${seat.displayName}'s shown cards`}
              >
                {seat.holeCards.map((card) => (
                  <PlayingCard
                    card={card}
                    cardStyle={cardStyle}
                    fullFace={fullFaceShown}
                    quietShown
                    {...(classifyShownCards
                      ? {
                          emphasis: winningSelection?.bestFive.includes(card)
                            ? "best"
                            : "unused",
                        }
                      : {})}
                    key={card}
                    marker="shown"
                  />
                ))}
              </span>
            ) : null}
            <span className="seat-edge-status__roles" aria-hidden="true">
              {seatCanHoldPosition(seat) &&
              seat.seatId === projection.dealerSeatId ? (
                <span className="position-token position-token--dealer">D</span>
              ) : null}
              {seat.seatId === smallBlindSeatId ? (
                <span className="position-token position-token--small">SB</span>
              ) : null}
              {seat.seatId === bigBlindSeatId ? (
                <span className="position-token position-token--big">BB</span>
              ) : null}
            </span>
            {showNames ? (
              <span className="seat-edge-status__name" title={seat.displayName}>
                {seat.displayName}
              </span>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function SeatGrid({
  cardStyle = "classic",
  compactGlyphsOnly = false,
  fullFaceShown = false,
  projection,
  mode,
  showNames = false,
}: {
  readonly cardStyle?: CardStyle;
  readonly compactGlyphsOnly?: boolean;
  readonly fullFaceShown?: boolean;
  readonly mode: PresentationMode;
  readonly projection: PublicProjection | SeatProjection;
  readonly showNames?: boolean;
}) {
  if (["player", "public", "tablet", "tv"].includes(mode)) {
    return (
      <QuietSeatGrid
        cardStyle={cardStyle}
        fullFaceShown={fullFaceShown}
        projection={projection}
        showNames={showNames}
      />
    );
  }
  const selfSeatId =
    projection.view === "seat" ? projection.self.seatId : undefined;
  const winners = new Set(projection.showdown?.leaders ?? []);
  return (
    <section className={`seat-grid seat-grid--${mode}`} aria-label="Seats">
      {projection.seats.map((seat, index) => (
        <article
          className={`seat-tile${seat.seatId === selfSeatId ? " seat-tile--self" : ""}`}
          data-seat-status={seat.status}
          key={seat.seatId}
        >
          <header>
            <span className="seat-tile__number">Seat {index + 1}</span>
            {seatCanHoldPosition(seat) &&
            seat.seatId === projection.dealerSeatId ? (
              <span className="dealer-chip" aria-label="Dealer">
                D
              </span>
            ) : null}
          </header>
          <strong>{seat.displayName}</strong>
          <span className="seat-tile__status">
            {seat.status.replace("-", " ")}
          </span>
          {projection.accounting ? (
            <span
              className="seat-tile__stack"
              data-stack={
                projection.accounting.seats.find(
                  (accountingSeat) => accountingSeat.seatId === seat.seatId,
                )?.stack
              }
            >
              Stack{" "}
              {projection.accounting.seats.find(
                (accountingSeat) => accountingSeat.seatId === seat.seatId,
              )?.stack ?? "—"}
            </span>
          ) : null}
          {seat.holeCards ? (
            <div
              className="mini-hand"
              aria-label={`${seat.displayName}'s shown cards`}
            >
              {seat.holeCards.map((card) => (
                <PlayingCard
                  card={card}
                  cardStyle={cardStyle}
                  compact
                  compactGlyphsOnly={compactGlyphsOnly}
                  {...(winners.has(seat.seatId) && seat.evaluation
                    ? {
                        emphasis: seat.evaluation.bestFive.includes(card)
                          ? "best"
                          : "unused",
                      }
                    : {})}
                  key={card}
                  marker="shown"
                />
              ))}
            </div>
          ) : seat.status === "active" ||
            seat.status === "folded-provisional" ? (
            <div
              className="card-back-pair"
              aria-label="Cards not shown"
              role="img"
            >
              <span />
              <span />
            </div>
          ) : null}
          {seat.evaluation ? (
            <span className="hand-label">{seat.evaluation.label}</span>
          ) : null}
        </article>
      ))}
    </section>
  );
}

function ChipRail({
  projection,
}: {
  readonly projection: PublicProjection | SeatProjection;
}) {
  const accounting = projection.accounting;
  if (!accounting) return null;
  const actorName = projection.seats.find(
    (seat) => seat.seatId === accounting.currentActorSeatId,
  )?.displayName;
  return (
    <section className="chip-rail" aria-label="Digital chip accounting">
      <div>
        <span>In the middle</span>
        <strong>Pot {accounting.potTotal}</strong>
      </div>
      <div>
        <span>This street</span>
        <strong>Current bet {accounting.currentBet}</strong>
      </div>
      <p>{actorName ? `${actorName} to act` : "Betting round closed"}</p>
    </section>
  );
}

function SettlementPanel({
  projection,
}: {
  readonly projection: PublicProjection | SeatProjection;
}) {
  const settlement = projection.accounting?.settlement;
  if (!settlement) return null;
  const confirmed = projection.accounting?.phase === "complete";
  const displayName = (seatId: string) =>
    projection.seats.find((seat) => seat.seatId === seatId)?.displayName ??
    seatId;
  return (
    <section className="settlement-panel" aria-labelledby="settlement-title">
      <div>
        <span className="section-label">
          {confirmed ? "Confirmed result" : "Host confirmation gate"}
        </span>
        <h2 id="settlement-title">
          {confirmed ? "Settlement result" : "Settlement proposal"}
        </h2>
        <p>
          {confirmed
            ? "Stacks reflect this confirmed result."
            : "Stacks update only after confirmation."}
        </p>
      </div>
      <strong>Total pot {settlement.totalPot}</strong>
      <ol>
        {settlement.pots.map((pot, index) => (
          <li key={`${pot.amount}-${index}`}>
            <span>{pot.explanation}</span>
            <small>
              {pot.awards
                .map((award) => `${displayName(award.seatId)} +${award.amount}`)
                .join(" · ")}
            </small>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ActionButton({
  children,
  danger = false,
  disabled,
  onClick,
  qaControl,
  qaVariant,
  quiet = false,
}: {
  readonly children: ReactNode;
  readonly danger?: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly qaControl: string;
  readonly qaVariant?: string;
  readonly quiet?: boolean;
}) {
  return (
    <button
      className={`action${danger ? " action--danger" : ""}${quiet ? " action--quiet" : ""}`}
      data-qa-control={qaControl}
      {...(qaVariant ? { "data-qa-variant": qaVariant } : {})}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

const nextStreetByPhase: Partial<
  Record<HandPhase, { readonly label: string; readonly street: Street }>
> = {
  flop: { label: "Deal the turn", street: "turn" },
  preflop: { label: "Deal the flop", street: "flop" },
  turn: { label: "Deal the river", street: "river" },
};

function DealerControls(props: TableSurfaceProps) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const progression = nextStreetByPhase[props.projection.phase];
  if (props.projection.phase === "complete") {
    if (props.projection.accounting) {
      return <p className="dealer-guidance">This hand is complete.</p>;
    }
    return (
      <div className="dealer-actions">
        <ActionButton
          disabled={props.busy || !props.onStartNextHand}
          onClick={() => props.onStartNextHand?.()}
          qaControl="dealer-next-hand"
        >
          Deal next hand
        </ActionButton>
      </div>
    );
  }
  if (props.projection.accounting) {
    if (props.projection.phase === "showdown") {
      return (
        <div className="dealer-actions">
          <ActionButton
            disabled={props.busy || !props.onPrepareSettlement}
            onClick={() => props.onPrepareSettlement?.()}
            qaControl="dealer-review-settlement"
          >
            Review settlement
          </ActionButton>
        </div>
      );
    }
    if (props.projection.phase === "settlement-pending") {
      return (
        <div className="dealer-actions">
          <ActionButton
            disabled={props.busy || !props.onConfirmSettlement}
            onClick={() => props.onConfirmSettlement?.()}
            qaControl="dealer-confirm-settlement"
          >
            Confirm settlement
          </ActionButton>
        </div>
      );
    }
    return <p className="dealer-guidance">Players act from their phones.</p>;
  }
  if (confirmEnd) {
    return (
      <div className="end-confirm" role="group" aria-label="Confirm end hand">
        <span>Physical chips settled?</span>
        <ActionButton
          disabled={props.busy}
          onClick={() => setConfirmEnd(false)}
          qaControl="dealer-cancel-end-hand"
          quiet
        >
          Keep playing
        </ActionButton>
        <ActionButton
          danger
          disabled={props.busy || !props.onEndHand}
          onClick={() => {
            setConfirmEnd(false);
            props.onEndHand?.();
          }}
          qaControl="dealer-confirm-end-hand"
        >
          End this hand
        </ActionButton>
      </div>
    );
  }
  return (
    <div className="dealer-actions">
      <ActionButton
        disabled={props.busy || !props.onEndHand}
        onClick={() => setConfirmEnd(true)}
        qaControl="dealer-open-end-hand"
        quiet
      >
        End hand
      </ActionButton>
      {progression ? (
        <ActionButton
          disabled={props.busy || !props.onRevealStreet}
          onClick={() => props.onRevealStreet?.(progression.street)}
          qaControl="dealer-next-street"
          qaVariant={props.projection.phase}
        >
          {progression.label}
        </ActionButton>
      ) : null}
    </div>
  );
}

const tableThemeOptions: readonly {
  readonly id: TableTheme;
  readonly label: string;
  readonly qaAction: string;
}[] = [
  {
    id: "dark-green",
    label: "Dark Green",
    qaAction: "theme-dark-green",
  },
  { id: "black-gold", label: "Black Gold", qaAction: "theme-black-gold" },
  { id: "deep-navy", label: "Deep Navy", qaAction: "theme-deep-navy" },
];

function TableThemeButtons(props: TableSurfaceProps) {
  if (!props.onTableThemeChange) return null;
  return (
    <div className="surface-theme-picker" role="group" aria-label="Table style">
      {tableThemeOptions.map((theme) => (
        <button
          aria-label={theme.label}
          aria-pressed={props.projection.tableTheme === theme.id}
          data-qa-action={theme.qaAction}
          data-qa-control="tablet-theme-choice"
          data-qa-variant={theme.id}
          data-theme-choice={theme.id}
          disabled={props.busy}
          key={theme.id}
          onClick={() => void props.onTableThemeChange?.(theme.id)}
          type="button"
        >
          <span aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function CardStyleButtons(props: TableSurfaceProps) {
  if (airplaneBuild || !props.onCardStyleChange || props.airplaneMode)
    return null;
  return (
    <div
      className="surface-card-style-picker"
      role="group"
      aria-label="Deck appearance"
    >
      <button
        aria-pressed={props.projection.cardStyle === "classic"}
        data-qa-action="card-style-classic"
        data-qa-control="card-style-classic"
        disabled={props.busy}
        onClick={() => void props.onCardStyleChange?.("classic")}
        type="button"
      >
        Classic
      </button>
      <button
        aria-pressed={props.projection.cardStyle === "four-colour"}
        data-qa-action="card-style-four-colour"
        data-qa-control="card-style-four-colour"
        disabled={props.busy}
        onClick={() => void props.onCardStyleChange?.("four-colour")}
        type="button"
      >
        Four Colour
      </button>
    </div>
  );
}

function ReconnectAction({
  onReconnect,
}: {
  readonly onReconnect: (() => ActionResult) | undefined;
}) {
  return (
    <button
      className="reconnect-action"
      data-qa-action="reconnect"
      data-qa-control="table-reconnect"
      disabled={!onReconnect}
      onClick={() => void onReconnect?.()}
      type="button"
    >
      Reconnect to table
    </button>
  );
}

async function togglePageFullscreen(): Promise<void> {
  const fullscreenDocument = document as Document & {
    readonly webkitFullscreenElement?: Element;
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  if (
    document.fullscreenElement ||
    fullscreenDocument.webkitFullscreenElement
  ) {
    if (document.exitFullscreen) await document.exitFullscreen();
    else await fullscreenDocument.webkitExitFullscreen?.();
  } else if (root.requestFullscreen) {
    await root.requestFullscreen({ navigationUI: "hide" });
  } else if (root.webkitRequestFullscreen) {
    await root.webkitRequestFullscreen();
  } else {
    throw new Error(
      "This browser does not expose page full screen. Add the table to the Home Screen to remove browser controls.",
    );
  }
}

function pageFullscreenActive(): boolean {
  if (typeof document === "undefined") return false;

  const fullscreenDocument = document as Document & {
    readonly webkitFullscreenElement?: Element;
  };
  return Boolean(
    document.fullscreenElement || fullscreenDocument.webkitFullscreenElement,
  );
}

function usePageFullscreen(): boolean {
  const [pageFullscreen, setPageFullscreen] = useState(pageFullscreenActive);

  useEffect(() => {
    function syncPageFullscreen(): void {
      setPageFullscreen(pageFullscreenActive());
    }

    document.addEventListener("fullscreenchange", syncPageFullscreen);
    document.addEventListener("webkitfullscreenchange", syncPageFullscreen);
    syncPageFullscreen();
    return () => {
      document.removeEventListener("fullscreenchange", syncPageFullscreen);
      document.removeEventListener(
        "webkitfullscreenchange",
        syncPageFullscreen,
      );
    };
  }, []);

  return pageFullscreen;
}

type TableCorner = "lower-left" | "lower-right" | "upper-left" | "upper-right";

function CloseGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="table-close-glyph"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}

function LeaveOptionsGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="leave-options-glyph"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
    </svg>
  );
}

function TabletControls(
  props: TableSurfaceProps & {
    readonly onTogglePlayerNames: () => void;
    readonly playerNamesVisible: boolean;
  },
) {
  const [corner, setCorner] = useState<TableCorner>();
  const [fullscreenError, setFullscreenError] = useState<string>();
  const [moreOpen, setMoreOpen] = useState(false);
  const [sliderPosition, setSliderPosition] = useState(0);
  const sliderDragging = useRef(false);
  const sliderGrabOffset = useRef(32);
  const sliderCommitting = useRef(false);
  const sliderTrack = useRef<HTMLDivElement>(null);
  const progression = nextStreetByPhase[props.projection.phase];
  const nextHandUnavailable =
    props.busy ||
    (props.projection.phase === "complete"
      ? !props.onStartNextHand
      : !props.onEndHand || !props.onStartNextHand);
  const corners: readonly {
    readonly id: TableCorner;
    readonly label: string;
  }[] = [
    { id: "upper-left", label: "upper left" },
    { id: "upper-right", label: "upper right" },
    { id: "lower-left", label: "lower left" },
    { id: "lower-right", label: "lower right" },
  ];

  async function invoke(action?: () => ActionResult): Promise<boolean> {
    if (!action || props.busy) return false;
    try {
      const result = await action();
      if (result === false) return false;
      setCorner(undefined);
      setMoreOpen(false);
      return true;
    } catch {
      return false;
    }
  }

  async function commitNextHand(): Promise<void> {
    if (nextHandUnavailable || sliderCommitting.current) return;
    sliderCommitting.current = true;
    const action =
      props.projection.phase === "complete"
        ? props.onStartNextHand
        : async (): Promise<boolean | void> => {
            const ended = await props.onEndHand?.();
            if (ended === false) return false;
            return props.onStartNextHand?.();
          };
    await invoke(action);
    setSliderPosition(0);
    sliderCommitting.current = false;
  }

  const facing = corner?.startsWith("upper") ? "upper" : "lower";

  function orientedPointerPosition(event: ReactPointerEvent): number {
    const track = sliderTrack.current;
    if (!track) return 0;
    const bounds = track.getBoundingClientRect();
    const pointer =
      facing === "upper"
        ? bounds.right - event.clientX
        : event.clientX - bounds.left;
    return Math.max(0, Math.min(92, pointer - sliderGrabOffset.current));
  }

  function beginSliderDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (nextHandUnavailable || sliderCommitting.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointer =
      facing === "upper"
        ? bounds.right - event.clientX
        : event.clientX - bounds.left;
    sliderGrabOffset.current =
      pointer >= sliderPosition && pointer <= sliderPosition + 64
        ? pointer - sliderPosition
        : 32;
    sliderDragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSliderPosition(orientedPointerPosition(event));
  }

  function moveSlider(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!sliderDragging.current) return;
    setSliderPosition(orientedPointerPosition(event));
  }

  function finishSlider(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!sliderDragging.current) return;
    const position = orientedPointerPosition(event);
    sliderDragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (position >= 88) void commitNextHand();
    else setSliderPosition(0);
  }

  function cancelSlider(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!sliderDragging.current) return;
    sliderDragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setSliderPosition(0);
  }

  function controlSliderFromKeyboard(
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void {
    if (nextHandUnavailable || sliderCommitting.current) return;
    if (event.key === "Home" || event.key === "ArrowLeft") {
      event.preventDefault();
      setSliderPosition((value) =>
        event.key === "Home" ? 0 : Math.max(0, value - 12),
      );
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setSliderPosition((value) => Math.min(92, value + 12));
    } else if (event.key === "End") {
      event.preventDefault();
      setSliderPosition(92);
      void commitNextHand();
    } else if (
      (event.key === "Enter" || event.key === " ") &&
      sliderPosition >= 88
    ) {
      event.preventDefault();
      void commitNextHand();
    }
  }

  async function toggleFullscreen(): Promise<void> {
    setFullscreenError(undefined);
    try {
      await togglePageFullscreen();
    } catch (caught) {
      setFullscreenError(
        caught instanceof Error
          ? caught.message
          : "Full screen was not accepted by this browser.",
      );
    }
  }

  function closeSecondary(): void {
    setMoreOpen(false);
    setCorner(undefined);
  }

  function openHostAdministration(action?: () => void): void {
    if (!action) return;
    action();
    closeSecondary();
  }

  return (
    <>
      {corners.map(({ id, label }) => (
        <button
          aria-label={`Open table controls from ${label}`}
          className={`table-corner table-corner--${id}`}
          data-qa-control="tablet-corner-open"
          data-qa-variant={id}
          data-table-corner={id}
          key={id}
          onClick={() => {
            setMoreOpen(false);
            setCorner(id);
          }}
          type="button"
        >
          <span aria-hidden="true" />
        </button>
      ))}

      {corner ? (
        <section
          aria-label="Table controls"
          className={`tablet-quick-panel tablet-quick-panel--${corner}`}
          data-control-facing={facing}
        >
          <svg
            aria-hidden="true"
            className="tablet-quick-panel__gold-thread"
            preserveAspectRatio="none"
            viewBox="0 0 650 244"
          >
            <path
              className="thread-lower-right"
              d="M2 62V46C2 21.7 21.7 2 46 2H650"
            />
            <path
              className="thread-lower-left"
              d="M648 62V46C648 21.7 628.3 2 604 2H0"
            />
            <path
              className="thread-upper-right"
              d="M2 182V198C2 222.3 21.7 242 46 242H650"
            />
            <path
              className="thread-upper-left"
              d="M648 182V198C648 222.3 628.3 242 604 242H0"
            />
          </svg>
          <div className="tablet-quick-panel__content">
            <div className="tablet-quick-panel__utilities">
              <button
                aria-label="More table controls"
                className="icon-action icon-action--more"
                data-qa-control="tablet-quick-more"
                onClick={() => {
                  setCorner(undefined);
                  setMoreOpen(true);
                }}
                type="button"
              >
                <span className="dot-glyph" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </button>
              <button
                aria-label="Close table controls"
                className="icon-action icon-action--close"
                data-qa-control="tablet-quick-close"
                onClick={() => setCorner(undefined)}
                type="button"
              >
                <CloseGlyph />
              </button>
            </div>
            <div className="tablet-quick-panel__actions">
              <button
                className="next-card-action"
                data-qa-control="tablet-next-card"
                disabled={!progression || props.busy || !props.onRevealStreet}
                onClick={() =>
                  void invoke(
                    progression
                      ? () => props.onRevealStreet?.(progression.street)
                      : undefined,
                  )
                }
                type="button"
              >
                <span>Next card</span>
                <small>{progression?.label ?? "Board complete"}</small>
                <b className="arrow-glyph" aria-hidden="true" />
              </button>
              <div className="next-hand-control">
                <div
                  aria-disabled={nextHandUnavailable}
                  aria-label="Slide to deal next hand"
                  aria-valuemax={92}
                  aria-valuemin={0}
                  aria-valuenow={Math.round(sliderPosition)}
                  aria-valuetext={
                    sliderPosition >= 88
                      ? "Release to confirm"
                      : "Drag the gold handle to the arrow"
                  }
                  className="next-hand-slider"
                  data-qa-control="tablet-next-hand"
                  data-slider-travel="92"
                  onKeyDown={controlSliderFromKeyboard}
                  onPointerCancel={cancelSlider}
                  onPointerDown={beginSliderDrag}
                  onPointerMove={moveSlider}
                  onPointerUp={finishSlider}
                  ref={sliderTrack}
                  role="slider"
                  tabIndex={0}
                >
                  <span
                    className="next-hand-slider__handle"
                    style={{ transform: `translateX(${sliderPosition}px)` }}
                  >
                    <span className="slider-grip" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </span>
                  <b className="arrow-glyph" aria-hidden="true" />
                </div>
                <span className="next-hand-control__copy">
                  <strong>Next hand</strong>
                  <small>
                    {props.projection.phase === "complete"
                      ? "Slide · deal now"
                      : "Slide · clear & deal"}
                  </small>
                </span>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {moreOpen ? (
        <div className="secondary-controls-backdrop">
          <section
            aria-labelledby="secondary-controls-title"
            className="secondary-controls"
          >
            <header>
              <div>
                <span className="section-label">Host · this device</span>
                <h2 id="secondary-controls-title">Table controls</h2>
              </div>
              <span className="secondary-controls__health">
                {props.connectionLabel}
              </span>
              <button
                aria-label="Close more controls"
                className="icon-action icon-action--close"
                data-qa-action="close-secondary"
                data-qa-control="tablet-secondary-close"
                onClick={() => setMoreOpen(false)}
                type="button"
              >
                <CloseGlyph />
              </button>
            </header>
            <div className="secondary-controls__rule" />
            <div className="secondary-controls__grid">
              <button
                className="secondary-control-card secondary-control-card--players"
                data-qa-action="manage-players"
                data-qa-control="tablet-manage-players"
                disabled={!props.onManagePlayers}
                onClick={() => openHostAdministration(props.onManagePlayers)}
                type="button"
              >
                <HostControlIcon kind="players" />
                <strong>Players &amp; seats</strong>
                <small>Invites, seat order, dealer, replacement</small>
                <em>
                  {props.onManagePlayers
                    ? `${props.hostPlayerCount ?? props.projection.seats.length} players`
                    : "Trusted Host only"}
                </em>
                <b aria-hidden="true">›</b>
              </button>
              <section className="secondary-control-card secondary-control-card--appearance">
                <HostControlIcon kind="appearance" />
                <strong>Appearance</strong>
                <small>Table colour and deck on every screen</small>
                {props.onTableThemeChange ? (
                  <TableThemeButtons {...props} />
                ) : (
                  <em>Selected by the Trusted Host</em>
                )}
                <CardStyleButtons {...props} />
              </section>
              <button
                className="secondary-control-card secondary-control-card--displays"
                data-qa-action="manage-displays"
                data-qa-control="tablet-manage-displays"
                disabled={!props.onManageDisplays}
                onClick={() => openHostAdministration(props.onManageDisplays)}
                type="button"
              >
                <HostControlIcon kind="displays" />
                <strong>Displays &amp; pairing</strong>
                <small>Tablet, TV and public table screens</small>
                <em>
                  {props.onManageDisplays
                    ? "Manage on this host"
                    : "Trusted Host only"}
                </em>
                <b aria-hidden="true">›</b>
              </button>
              <section className="secondary-control-card secondary-control-card--device">
                <HostControlIcon kind="device" />
                <strong>This device</strong>
                <small>Views and browser presentation</small>
                <div className="secondary-device-actions">
                  {props.onMyHand ? (
                    <button
                      data-qa-action="my-hand"
                      data-qa-control="tablet-view-player"
                      onClick={() => {
                        props.onMyHand?.();
                        closeSecondary();
                      }}
                      type="button"
                    >
                      My Hand
                    </button>
                  ) : null}
                  {props.onHostControls ? (
                    <button
                      data-qa-action="host-controls"
                      data-qa-control="tablet-view-host"
                      onClick={() => {
                        props.onHostControls?.();
                        closeSecondary();
                      }}
                      type="button"
                    >
                      Host Controls
                    </button>
                  ) : null}
                  {!props.airplaneMode ? (
                    <button
                      aria-pressed={props.playerNamesVisible}
                      data-qa-control="tablet-player-names-toggle"
                      onClick={props.onTogglePlayerNames}
                      type="button"
                    >
                      {props.playerNamesVisible
                        ? "Hide player names"
                        : "Show player names"}
                    </button>
                  ) : null}
                  <button
                    data-qa-action="fullscreen"
                    data-qa-control="tablet-fullscreen"
                    onClick={() => void toggleFullscreen()}
                    type="button"
                  >
                    Full screen
                  </button>
                </div>
              </section>
              <section className="secondary-control-card secondary-control-card--connection">
                <HostControlIcon kind="connection" />
                <strong>Connection &amp; recovery</strong>
                <small>Catch up with the Trusted Host now</small>
                {props.onReconnect ? (
                  <ReconnectAction onReconnect={props.onReconnect} />
                ) : (
                  <em>Local host active</em>
                )}
              </section>
              <section className="secondary-control-card secondary-control-card--diagnostics">
                <HostControlIcon kind="diagnostics" />
                <strong>Diagnostics &amp; history</strong>
                <small>Privacy-filtered support evidence</small>
                {props.onDownloadLog ? (
                  <button
                    className="secondary-inline-action"
                    data-qa-action="save-log"
                    data-qa-control="tablet-save-log"
                    onClick={() => props.onDownloadLog?.()}
                    type="button"
                  >
                    Save log
                  </button>
                ) : (
                  <em>Trusted Host only</em>
                )}
              </section>
            </div>
            {fullscreenError ? (
              <p className="secondary-controls__error" role="alert">
                {fullscreenError}
              </p>
            ) : null}
            <button
              className="secondary-controls__return"
              data-qa-action="return-table"
              data-qa-control="tablet-secondary-return"
              onClick={closeSecondary}
              type="button"
            >
              Return to table
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}

function HostRootThemeButtons(props: TableSurfaceProps) {
  if (!props.onTableThemeChange) return null;
  return (
    <div className="surface-theme-picker" role="group" aria-label="Table style">
      {tableThemeOptions.map((theme) => (
        <button
          aria-label={theme.label}
          aria-pressed={props.projection.tableTheme === theme.id}
          data-qa-control="host-root-theme-choice"
          data-qa-variant={theme.id}
          data-theme-choice={theme.id}
          disabled={props.busy}
          key={theme.id}
          onClick={() => void props.onTableThemeChange?.(theme.id)}
          type="button"
        >
          <span aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

type HostControlIconKind =
  | "appearance"
  | "connection"
  | "device"
  | "diagnostics"
  | "displays"
  | "dissolve"
  | "players";

function HostControlIcon({ kind }: { readonly kind: HostControlIconKind }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2.15,
  };
  return (
    <span
      aria-hidden="true"
      className="secondary-control-card__icon"
      data-control-center-icon={kind}
    >
      <svg focusable="false" viewBox="0 0 32 32">
        {kind === "players" ? (
          <>
            <circle {...common} cx="11" cy="10" r="3.5" />
            <path
              {...common}
              d="M4.5 25c.9-4.5 3.1-6.8 6.5-6.8s5.6 2.3 6.5 6.8"
            />
            <path
              {...common}
              d="M20 8.2a3 3 0 0 1 0 5.8M21.4 18.6c3 .8 4.9 2.9 5.4 6.4"
            />
          </>
        ) : null}
        {kind === "displays" ? (
          <>
            <rect {...common} height="15" rx="2.5" width="22" x="3" y="4" />
            <path {...common} d="M11 25h10M16 19v6" />
            <rect {...common} height="11" rx="1.7" width="7" x="21" y="14" />
          </>
        ) : null}
        {kind === "appearance" ? (
          <>
            <path
              {...common}
              d="M16 4C8.8 4 3 8.8 3 15.3 3 21.2 7.7 26 13.5 26h2.2c1.6 0 2.4-1.3 2.4-2.5 0-1.5-1.2-2.2-1.2-3.6 0-1.6 1.2-2.9 3-2.9H22c4 0 7-2.5 7-6.2C29 6.9 23.2 4 16 4Z"
            />
            <circle cx="9.5" cy="13" fill="currentColor" r="1.7" />
            <circle cx="13.5" cy="9" fill="currentColor" r="1.7" />
            <circle cx="8.5" cy="18.2" fill="currentColor" r="1.7" />
          </>
        ) : null}
        {kind === "device" ? (
          <>
            <rect {...common} height="25" rx="3.5" width="16" x="8" y="3.5" />
            <path {...common} d="M13 23.5h6M12 8h8" />
          </>
        ) : null}
        {kind === "diagnostics" ? (
          <>
            <path
              {...common}
              d="M8 3.5h11l5 5v20H8a3 3 0 0 1-3-3v-19a3 3 0 0 1 3-3Z"
            />
            <path
              {...common}
              d="M19 3.5v6h5M9 20h2.8l2.1-4.5 3.1 7 1.8-3.2H22"
            />
          </>
        ) : null}
        {kind === "connection" ? (
          <>
            <path {...common} d="M25.8 11A10.5 10.5 0 0 0 7.7 7.5L5.5 10" />
            <path
              {...common}
              d="M5.5 5.2V10h4.8M6.2 21A10.5 10.5 0 0 0 24.3 24.5l2.2-2.5"
            />
            <path {...common} d="M26.5 26.8V22h-4.8" />
            <path
              {...common}
              d="M11.3 15.8h9.4M14 12.8l-3 3 3 3M18 12.8l3 3-3 3"
            />
          </>
        ) : null}
        {kind === "dissolve" ? (
          <>
            <circle {...common} cx="16" cy="16" r="10.5" />
            <path {...common} d="m11.5 11.5 9 9M20.5 11.5l-9 9" />
          </>
        ) : null}
      </svg>
    </span>
  );
}

function HostControlCenter({
  onClose,
  ...props
}: TableSurfaceProps & { readonly onClose: () => void }) {
  const [fullscreenError, setFullscreenError] = useState<string>();

  function closeAndRun(action?: () => void): void {
    if (!action) return;
    action();
    onClose();
  }

  async function toggleFullscreen(): Promise<void> {
    setFullscreenError(undefined);
    try {
      await togglePageFullscreen();
    } catch (caught) {
      setFullscreenError(
        caught instanceof Error
          ? caught.message
          : "Full screen was not accepted by this browser.",
      );
    }
  }

  return (
    <div className="secondary-controls-backdrop">
      <section
        aria-labelledby="host-control-center-title"
        aria-modal="true"
        className="secondary-controls host-control-center"
        id="host-control-center"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        role="dialog"
      >
        <header>
          <div>
            <span className="section-label">Trusted Host</span>
            <h2 id="host-control-center-title">Table control center</h2>
          </div>
          <span className="secondary-controls__health">
            {props.connectionLabel}
          </span>
          <button
            aria-label="Close table control center"
            autoFocus
            className="icon-action icon-action--close"
            data-qa-control="host-root-controls-close"
            onClick={onClose}
            type="button"
          >
            <CloseGlyph />
          </button>
        </header>
        <div className="secondary-controls__rule" />
        <div className="secondary-controls__grid">
          <button
            className="secondary-control-card"
            data-qa-control="host-root-manage-players"
            disabled={!props.onManagePlayers}
            onClick={() => closeAndRun(props.onManagePlayers)}
            type="button"
          >
            <HostControlIcon kind="players" />
            <strong>Players &amp; seats</strong>
            <small>Invites, seat order, dealer and replacement</small>
            <em>
              {props.hostPlayerCount ?? props.projection.seats.length} players
            </em>
            <b aria-hidden="true">›</b>
          </button>
          <button
            className="secondary-control-card"
            data-qa-control="host-root-manage-displays"
            disabled={!props.onManageDisplays}
            onClick={() => closeAndRun(props.onManageDisplays)}
            type="button"
          >
            <HostControlIcon kind="displays" />
            <strong>Displays &amp; pairing</strong>
            <small>Tablet, TV and public table screens</small>
            <em>Manage on this host</em>
            <b aria-hidden="true">›</b>
          </button>
          <section className="secondary-control-card secondary-control-card--appearance">
            <HostControlIcon kind="appearance" />
            <strong>Appearance</strong>
            <small>Table colour and deck on every screen</small>
            <HostRootThemeButtons {...props} />
            <CardStyleButtons {...props} />
          </section>
          <section className="secondary-control-card secondary-control-card--device">
            <HostControlIcon kind="device" />
            <strong>This device</strong>
            <small>Views and browser presentation</small>
            <div className="secondary-device-actions">
              {props.onTableView ? (
                <button
                  data-qa-control="host-root-view-table"
                  onClick={() => closeAndRun(props.onTableView)}
                  type="button"
                >
                  Table View
                </button>
              ) : null}
              {props.onMyHand ? (
                <button
                  data-qa-control="host-root-view-player"
                  onClick={() => closeAndRun(props.onMyHand)}
                  type="button"
                >
                  My Hand
                </button>
              ) : null}
              <button
                data-qa-control="host-root-fullscreen"
                onClick={() => void toggleFullscreen()}
                type="button"
              >
                Full screen
              </button>
            </div>
          </section>
          <section className="secondary-control-card">
            <HostControlIcon kind="diagnostics" />
            <strong>Diagnostics &amp; history</strong>
            <small>Privacy-filtered support evidence</small>
            <div className="secondary-device-actions">
              <button
                aria-pressed={props.developerMode ?? false}
                data-qa-control="host-root-toggle-developer"
                disabled={!props.onToggleDeveloperMode}
                onClick={() => props.onToggleDeveloperMode?.()}
                type="button"
              >
                Developer mode
              </button>
              <button
                data-qa-control="host-root-save-log"
                disabled={!props.onDownloadLog}
                onClick={() => props.onDownloadLog?.()}
                type="button"
              >
                Save log
              </button>
            </div>
          </section>
          <section className="secondary-control-card">
            <HostControlIcon kind="connection" />
            <strong>Connection &amp; recovery</strong>
            <small>The authoritative browser remains the source of truth</small>
            <em>{props.connectionLabel}</em>
          </section>
          {props.onDissolveTable ? (
            <section className="secondary-control-card secondary-control-card--danger">
              <HostControlIcon kind="dissolve" />
              <strong>Dissolve this table</strong>
              <small>End the session for every connected display</small>
              <button
                data-qa-control="host-dissolve-table"
                disabled={props.busy}
                onClick={() => {
                  void props.onDissolveTable?.();
                  onClose();
                }}
                type="button"
              >
                Dissolve table
              </button>
            </section>
          ) : null}
        </div>
        {fullscreenError ? (
          <p className="secondary-controls__error" role="alert">
            {fullscreenError}
          </p>
        ) : null}
        <button
          className="secondary-controls__return"
          data-qa-control="host-root-controls-return"
          onClick={onClose}
          type="button"
        >
          Return to table
        </button>
      </section>
    </div>
  );
}

function BettingControls(props: {
  readonly busy: boolean;
  readonly onBettingAction?: (action: BettingActionIntent) => void;
  readonly projection: SeatProjection;
}) {
  const actions = props.projection.self.legalActions ?? [];
  const amountAction = actions.find(
    (action) => action.type === "bet-to" || action.type === "raise-to",
  );
  const [amount, setAmount] = useState(
    amountAction && "minTo" in amountAction ? amountAction.minTo : 0,
  );

  useEffect(() => {
    if (amountAction && "minTo" in amountAction) {
      setAmount(amountAction.minTo);
    }
  }, [
    amountAction && "maxTo" in amountAction ? amountAction.maxTo : undefined,
    amountAction && "minTo" in amountAction ? amountAction.minTo : undefined,
    amountAction?.type,
    props.projection.revision,
  ]);

  if (actions.length === 0) {
    const actorName = props.projection.seats.find(
      (seat) => seat.seatId === props.projection.accounting?.currentActorSeatId,
    )?.displayName;
    return (
      <p className="betting-wait">
        {actorName ? `Waiting for ${actorName}.` : "No action required."}
      </p>
    );
  }

  const fold = actions.find((action) => action.type === "fold");
  const check = actions.find((action) => action.type === "check");
  const call = actions.find((action) => action.type === "call");
  const allIn = actions.find((action) => action.type === "all-in");
  return (
    <div className="betting-actions" aria-label="Betting actions">
      {fold ? (
        <ActionButton
          danger
          disabled={props.busy || !props.onBettingAction}
          onClick={() => props.onBettingAction?.({ type: "fold" })}
          qaControl="player-bet-fold"
          quiet
        >
          Fold
        </ActionButton>
      ) : null}
      {check ? (
        <ActionButton
          disabled={props.busy || !props.onBettingAction}
          onClick={() => props.onBettingAction?.({ type: "check" })}
          qaControl="player-bet-check"
        >
          Check
        </ActionButton>
      ) : null}
      {call && "amount" in call ? (
        <ActionButton
          disabled={props.busy || !props.onBettingAction}
          onClick={() => props.onBettingAction?.({ type: "call" })}
          qaControl="player-bet-call"
        >
          Call {call.amount}
        </ActionButton>
      ) : null}
      {amountAction && "minTo" in amountAction ? (
        <div className="bet-amount">
          <span>{amountAction.type === "bet-to" ? "Bet to" : "Raise to"}</span>
          <input
            aria-label={
              amountAction.type === "bet-to"
                ? "Bet to amount"
                : "Raise to amount"
            }
            inputMode="numeric"
            max={amountAction.maxTo}
            min={amountAction.minTo}
            onChange={(event) => setAmount(event.currentTarget.valueAsNumber)}
            step="1"
            type="number"
            value={amount}
          />
          <ActionButton
            disabled={
              props.busy ||
              !props.onBettingAction ||
              !Number.isSafeInteger(amount) ||
              amount < amountAction.minTo ||
              amount > amountAction.maxTo
            }
            onClick={() =>
              props.onBettingAction?.({
                to: amount,
                type: "bet-or-raise-to",
              })
            }
            qaControl="player-bet-commit"
            qaVariant={amountAction.type}
          >
            Commit
          </ActionButton>
        </div>
      ) : null}
      {allIn ? (
        <ActionButton
          disabled={props.busy || !props.onBettingAction}
          onClick={() => props.onBettingAction?.({ type: "all-in" })}
          qaControl="player-bet-all-in"
          quiet
        >
          All in {"to" in allIn ? allIn.to : ""}
        </ActionButton>
      ) : null}
    </div>
  );
}

type GuardedPlayerSliderControl = "player-leave-active" | "player-show-cards";
type GuardedPlayerSliderTone = "gold" | "danger";

/** @qa-build normal: this guarded surface is not rendered by Airplane Mode. */
function GuardedPlayerSlider({
  ariaLabel,
  control,
  disabled,
  label,
  onComplete,
  tone,
}: {
  readonly ariaLabel: string;
  readonly control: GuardedPlayerSliderControl;
  readonly disabled: boolean;
  readonly label: string;
  readonly onComplete?: () => void;
  readonly tone: GuardedPlayerSliderTone;
}) {
  const handleSize = 44;
  const [sliderPosition, setSliderPosition] = useState(0);
  const sliderDragging = useRef(false);
  const sliderGrabOffset = useRef(handleSize / 2);
  const sliderTrack = useRef<HTMLDivElement>(null);

  function travel(): number {
    const width = sliderTrack.current?.getBoundingClientRect().width ?? 0;
    return Math.max(0, width - handleSize);
  }

  function boundedPosition(event: ReactPointerEvent): number {
    const track = sliderTrack.current;
    if (!track) return 0;
    const bounds = track.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(
        travel(),
        event.clientX - bounds.left - sliderGrabOffset.current,
      ),
    );
  }

  function commit(): void {
    if (disabled || !onComplete) return;
    onComplete();
    setSliderPosition(0);
  }

  function beginSliderDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (disabled || !onComplete) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointer = event.clientX - bounds.left;
    if (pointer < sliderPosition || pointer > sliderPosition + handleSize)
      return;
    sliderGrabOffset.current = pointer - sliderPosition;
    sliderDragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSlider(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!sliderDragging.current) return;
    setSliderPosition(boundedPosition(event));
  }

  function finishSlider(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!sliderDragging.current) return;
    const position = boundedPosition(event);
    sliderDragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (position >= travel() * 0.9) {
      commit();
      return;
    }
    setSliderPosition(0);
  }

  function cancelSlider(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!sliderDragging.current) return;
    sliderDragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setSliderPosition(0);
  }

  function controlSliderFromKeyboard(
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void {
    if (disabled || !onComplete) return;
    const distance = travel();
    if (event.key === "Home" || event.key === "ArrowLeft") {
      event.preventDefault();
      setSliderPosition((value) =>
        event.key === "Home" ? 0 : Math.max(0, value - distance / 5),
      );
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setSliderPosition((value) => Math.min(distance, value + distance / 5));
    } else if (event.key === "End") {
      event.preventDefault();
      commit();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
    }
  }

  const sliderTravel = travel();
  const percentage = sliderTravel
    ? Math.round((sliderPosition / sliderTravel) * 100)
    : 0;
  const sliderValueText =
    percentage >= 90
      ? `Release to ${label.toLowerCase()}`
      : `Drag the handle to confirm ${label.toLowerCase()}`;
  const sliderChildren = (
    <>
      <span
        className="player-confirm-slider__handle"
        style={{ transform: `translateX(${sliderPosition}px)` }}
      >
        <span className="slider-grip" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </span>
      <span className="player-confirm-slider__label">{label}</span>
      <b className="arrow-glyph" aria-hidden="true" />
    </>
  );
  return control === "player-show-cards" ? (
    <div
      aria-disabled={disabled || !onComplete}
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percentage}
      aria-valuetext={sliderValueText}
      className={`player-confirm-slider player-confirm-slider--${tone}`}
      data-qa-control="player-show-cards"
      id="player-show-cards"
      onKeyDown={controlSliderFromKeyboard}
      onPointerCancel={cancelSlider}
      onPointerDown={beginSliderDrag}
      onPointerMove={moveSlider}
      onPointerUp={finishSlider}
      ref={sliderTrack}
      role="slider"
      tabIndex={0}
    >
      {sliderChildren}
    </div>
  ) : (
    <div
      aria-disabled={disabled || !onComplete}
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percentage}
      aria-valuetext={sliderValueText}
      className={`player-confirm-slider player-confirm-slider--${tone}`}
      data-qa-control="player-leave-active"
      id="player-leave-active"
      onKeyDown={controlSliderFromKeyboard}
      onPointerCancel={cancelSlider}
      onPointerDown={beginSliderDrag}
      onPointerMove={moveSlider}
      onPointerUp={finishSlider}
      ref={sliderTrack}
      role="slider"
      tabIndex={0}
    >
      {sliderChildren}
    </div>
  );
}

/** @qa-build normal: this guarded surface is not rendered by Airplane Mode. */
function PublicShowControl({
  disabled,
  onShowCards,
}: {
  readonly disabled: boolean;
  readonly onShowCards?: () => void;
}) {
  return (
    <div className="player-show-control">
      <GuardedPlayerSlider
        ariaLabel="Slide to show cards to table"
        control="player-show-cards"
        disabled={disabled}
        label="Show cards to table"
        {...(onShowCards ? { onComplete: onShowCards } : {})}
        tone="gold"
      />
    </div>
  );
}

function PlayerTableStatus({
  projection,
}: {
  readonly projection: SeatProjection;
}) {
  const selfSeatId = projection.self.seatId;
  const selfIndex = projection.seats.findIndex(
    (seat) => seat.seatId === selfSeatId,
  );
  const selfSeat = projection.seats[selfIndex];
  const { bigBlindSeatId, smallBlindSeatId } = blindSeatIds(projection);
  const isDealer =
    selfSeat !== undefined &&
    seatCanHoldPosition(selfSeat) &&
    selfSeatId === projection.dealerSeatId;
  const roles = [
    { active: isDealer, label: "Dealer", token: "D" },
    {
      active: selfSeatId === smallBlindSeatId,
      label: "Small Blind",
      token: "SB",
    },
    { active: selfSeatId === bigBlindSeatId, label: "Big Blind", token: "BB" },
  ] as const;
  const activePositions = roles.filter((role) => role.active);
  const stateDescription = selfSeat
    ? seatStateDescription(selfSeat.status, selfSeat.connected !== false)
    : "Seat unavailable";

  return (
    <section
      aria-label="Your table status"
      className="player-table-status"
      data-player-table-status
    >
      <div className="player-table-status__summary">
        <span
          className="player-table-status__name"
          title={selfSeat?.displayName ?? ""}
        >
          {selfSeat?.displayName ?? "Unknown player"}
        </span>
        <span className="player-table-status__seat">Seat {selfIndex + 1}</span>
        <span className="player-table-status__position-label">
          {activePositions.length > 0
            ? activePositions.map((position, index) => (
                <span key={position.token}>
                  {index > 0 ? " · " : null}
                  <b>{position.token}</b> {position.label}
                </span>
              ))
            : "No blind position"}
        </span>
      </div>
      {selfSeat ? (
        <div className="player-table-status__state">
          <span
            aria-label={`Your table state: ${stateDescription}`}
            className="player-table-status__seat-state"
            role="img"
          >
            <SeatStateGlyph
              connected={selfSeat.connected !== false}
              status={selfSeat.status}
              winner={false}
            />
          </span>
          <span>{stateDescription}</span>
        </div>
      ) : null}
    </section>
  );
}

function PlayerTablePositionDrawer({
  projection,
  onClose,
}: {
  readonly projection: SeatProjection;
  readonly onClose: () => void;
}) {
  return (
    <div className="player-position-backdrop">
      <section
        aria-label="Your table position"
        aria-modal="true"
        className="player-position-drawer"
        role="dialog"
      >
        <header>
          <div>
            <span className="section-label">Your table</span>
            <h2>Physical seat position</h2>
          </div>
          <button
            aria-label="Close your table position"
            className="icon-action icon-action--close"
            data-qa-control="player-table-position-close"
            onClick={onClose}
            type="button"
          >
            <CloseGlyph />
          </button>
        </header>
        <p>
          Your highlighted seat follows the physical table order. Moving seats
          on the host changes this map, not the betting order.
        </p>
        <div className="player-position-map">
          <div aria-hidden="true" className="player-position-map__felt">
            <span>Physical table</span>
          </div>
          <QuietSeatGrid
            projection={projection}
            selfSeatId={projection.self.seatId}
            showNames
            showShownHands={false}
          />
        </div>
      </section>
    </div>
  );
}

function PlayerDepartureControls(props: {
  readonly airplaneMode: boolean;
  readonly beforeLeave?: () => void;
  readonly busy: boolean;
  readonly futureSittingOut: boolean;
  readonly onLeaveTable?: () => ActionResult;
  readonly onToggleSittingOut?: (sittingOut: boolean) => void;
}) {
  return (
    <>
      {props.airplaneMode ? (
        <label className="sit-out-control">
          <input
            checked={props.futureSittingOut}
            data-qa-control="player-sit-out-toggle"
            disabled={props.busy}
            onChange={(event) =>
              props.onToggleSittingOut?.(event.target.checked)
            }
            type="checkbox"
          />
          <span>Sit out next hand</span>
        </label>
      ) : (
        <label className="sit-out-control sit-out-control--switch">
          <input
            checked={props.futureSittingOut}
            data-qa-control="player-sit-out-toggle"
            disabled={props.busy}
            onChange={(event) =>
              props.onToggleSittingOut?.(event.target.checked)
            }
            role="switch"
            type="checkbox"
          />
          <span className="sit-out-control__label">Sit out next hand</span>
          <span aria-hidden="true" className="sit-out-switch">
            <i />
          </span>
        </label>
      )}
      {props.airplaneMode ? (
        props.onLeaveTable ? (
          <button
            className="leave-table-action"
            data-qa-control="player-leave-active"
            disabled={props.busy}
            onClick={() => {
              props.beforeLeave?.();
              void props.onLeaveTable?.();
            }}
            type="button"
          >
            Leave table permanently
          </button>
        ) : null
      ) : props.onLeaveTable ? (
        <div className="leave-table-slider">
          <GuardedPlayerSlider
            ariaLabel="Leave table permanently"
            disabled={props.busy}
            control="player-leave-active"
            label="Leave table permanently"
            onComplete={() => {
              props.beforeLeave?.();
              void props.onLeaveTable?.();
            }}
            tone="danger"
          />
        </div>
      ) : null}
    </>
  );
}

function PrivateHand(
  props: TableSurfaceProps & { readonly projection: SeatProjection },
) {
  const [cardsVisibleOnDevice, setCardsVisibleOnDevice] = useState(false);
  const [leaveOptionsOpen, setLeaveOptionsOpen] = useState(false);
  const status = props.projection.self.status;
  const handId = props.projection.handId;
  const privateCards = props.projection.self.holeCards.join(",");
  const selfEvaluation = props.projection.seats.find(
    (seat) => seat.seatId === props.projection.self.seatId,
  )?.evaluation;
  const shouldClassifyPrivateCards =
    !props.airplaneMode && Boolean(props.projection.showdown);
  const selfIsWinner = Boolean(
    props.projection.showdown?.leaders.includes(props.projection.self.seatId),
  );
  const cardStyle: CardStyle = props.airplaneMode
    ? "four-colour"
    : (props.projection.cardStyle ?? "classic");

  useEffect(() => {
    setCardsVisibleOnDevice(false);
  }, [handId, privateCards]);

  useEffect(() => {
    function coverWhenHidden() {
      if (document.visibilityState === "hidden") setCardsVisibleOnDevice(false);
    }
    document.addEventListener("visibilitychange", coverWhenHidden);
    return () =>
      document.removeEventListener("visibilitychange", coverWhenHidden);
  }, []);

  return (
    <section
      {...(props.airplaneMode
        ? { "aria-labelledby": "private-title" }
        : { "aria-label": "Your cards" })}
      className="private-hand"
    >
      {props.airplaneMode ? (
        <div className="private-hand__heading">
          <span className="section-label">Private hand</span>
          <h1 id="private-title">Your cards</h1>
          <p>
            {status === "shown"
              ? "Shown to the table. Covering them here does not undo the show."
              : cardsVisibleOnDevice
                ? "Visible only on this phone until you choose a table action."
                : "Reveal them privately, then hide them before passing the phone."}
          </p>
        </div>
      ) : null}
      {!props.airplaneMode ? (
        <h1 className="visually-hidden">Your cards</h1>
      ) : null}
      <div className="private-hand__card-area">
        <div className="private-hand__cards">
          {props.projection.self.holeCards.map((card) => (
            <PlayingCard
              card={card}
              cardStyle={cardStyle}
              fullFace={!props.airplaneMode}
              {...(shouldClassifyPrivateCards
                ? {
                    emphasis:
                      selfIsWinner && selfEvaluation?.bestFive.includes(card)
                        ? "best"
                        : "unused",
                  }
                : {})}
              key={card}
              marker="private"
            />
          ))}
          {!cardsVisibleOnDevice ? (
            <button
              aria-label="Reveal my cards privately"
              className="card-cover"
              data-qa-control="player-reveal-private"
              onClick={() => setCardsVisibleOnDevice(true)}
              type="button"
            >
              <span>Reveal my cards privately</span>
              <small>Only visible on this phone.</small>
            </button>
          ) : null}
        </div>
      </div>
      <div className="player-actions">
        {cardsVisibleOnDevice ? (
          <ActionButton
            disabled={false}
            onClick={() => setCardsVisibleOnDevice(false)}
            qaControl="player-hide-private"
            quiet
          >
            Hide my cards
          </ActionButton>
        ) : null}
        {props.projection.accounting ? (
          <BettingControls
            busy={props.busy}
            {...(props.onBettingAction
              ? { onBettingAction: props.onBettingAction }
              : {})}
            projection={props.projection}
          />
        ) : status === "folded-provisional" ? (
          <>
            <div className="undo-window" aria-label="Fold undo window">
              <span />
            </div>
            <ActionButton
              disabled={props.busy}
              onClick={() => props.onUndoFold?.()}
              qaControl="player-undo-fold"
            >
              Undo fold
            </ActionButton>
          </>
        ) : status === "active" ? (
          <>
            <ActionButton
              danger
              disabled={props.busy || !props.onFold}
              onClick={() => props.onFold?.()}
              qaControl="player-fold"
              quiet
            >
              Fold
            </ActionButton>
            {props.airplaneMode ? (
              <ActionButton
                disabled={props.busy || !props.onShowCards}
                onClick={() => props.onShowCards?.()}
                qaControl="player-show-cards"
              >
                Show cards to table
              </ActionButton>
            ) : (
              <PublicShowControl
                disabled={props.busy || !props.onShowCards}
                {...(props.onShowCards
                  ? { onShowCards: props.onShowCards }
                  : {})}
              />
            )}
          </>
        ) : null}
      </div>
      {props.airplaneMode ? (
        <PlayerDepartureControls
          airplaneMode={props.airplaneMode}
          busy={props.busy}
          futureSittingOut={props.futureSittingOut ?? false}
          {...(props.onLeaveTable ? { onLeaveTable: props.onLeaveTable } : {})}
          {...(props.onToggleSittingOut
            ? { onToggleSittingOut: props.onToggleSittingOut }
            : {})}
        />
      ) : props.onLeaveTable || props.onToggleSittingOut ? (
        <button
          aria-expanded={leaveOptionsOpen}
          aria-label="Open leave options"
          className="player-leave-options-open"
          data-qa-control="player-leave-options-open"
          disabled={props.busy}
          onClick={() => setLeaveOptionsOpen(true)}
          type="button"
        >
          <LeaveOptionsGlyph />
        </button>
      ) : null}
      {leaveOptionsOpen ? (
        <div className="player-leave-backdrop">
          <section
            aria-label="Leave options"
            aria-modal="true"
            className="player-leave-drawer"
            role="dialog"
          >
            <header>
              <div>
                <span className="section-label">Player options</span>
                <h2>Step away from the table</h2>
              </div>
              <button
                aria-label="Close leave options"
                className="icon-action icon-action--close"
                data-qa-control="player-leave-options-close"
                onClick={() => setLeaveOptionsOpen(false)}
                type="button"
              >
                <CloseGlyph />
              </button>
            </header>
            <p>
              Sit out skips the incoming hands while keeping your seat till you
              back.
            </p>
            <PlayerDepartureControls
              airplaneMode={props.airplaneMode ?? false}
              beforeLeave={() => setLeaveOptionsOpen(false)}
              busy={props.busy}
              futureSittingOut={props.futureSittingOut ?? false}
              {...(props.onLeaveTable
                ? { onLeaveTable: props.onLeaveTable }
                : {})}
              {...(props.onToggleSittingOut
                ? { onToggleSittingOut: props.onToggleSittingOut }
                : {})}
            />
          </section>
        </div>
      ) : null}
    </section>
  );
}

export function TableSurface(props: TableSurfaceProps) {
  const [hostRootOpen, setHostRootOpen] = useState(false);
  const [playerPositionOpen, setPlayerPositionOpen] = useState(false);
  const [tablePlayerNamesVisible, setTablePlayerNamesVisible] = useState(false);
  const pageFullscreen = usePageFullscreen();
  const isPlayer = props.mode === "player" && props.projection.view === "seat";
  const isQuietPublic = ["public", "tablet", "tv"].includes(props.mode);
  const tableTheme = props.projection.tableTheme ?? "dark-green";
  const cardStyle: CardStyle = props.airplaneMode
    ? "four-colour"
    : (props.projection.cardStyle ?? "classic");
  const bestCards = winningBestCards(props.projection);
  const compactGlyphsOnly = !props.airplaneMode;
  const showQuietPlayerNames =
    !props.airplaneMode &&
    (props.mode === "tv" ||
      (props.mode === "tablet" && tablePlayerNamesVisible));
  return (
    <main
      className={`table-surface table-surface--${props.mode}${hostRootOpen ? " table-surface--host-root-open" : ""}`}
      data-runtime={props.airplaneMode ? "airplane" : "normal"}
      data-page-fullscreen={pageFullscreen ? "true" : "false"}
      data-card-style={cardStyle}
      data-theme={tableTheme}
    >
      {props.mode === "host" ? (
        <header className="table-bar">
          <button
            aria-controls="host-control-center"
            aria-expanded={hostRootOpen}
            aria-haspopup="dialog"
            aria-label="Open table control center"
            className="table-mark table-mark--control"
            data-qa-control="host-root-controls-open"
            onClick={() => setHostRootOpen(true)}
            type="button"
          >
            <img
              alt=""
              className="table-mark__symbol"
              src={props.brandSymbolSrc}
            />
            <strong>{props.productName}</strong>
            {!props.airplaneMode ? (
              <span className="table-mark__control-label">Table controls</span>
            ) : null}
          </button>
          <div className="table-bar__right">
            <div className="table-status" aria-live="polite">
              <strong>{phaseLabel(props.projection.phase)}</strong>
              <span>r{props.projection.revision}</span>
              <span>{props.connectionLabel}</span>
            </div>
            {props.onManagePlayers || props.onToggleDeveloperMode ? (
              <nav className="host-tools" aria-label="Table tools">
                {props.onManagePlayers ? (
                  <button
                    aria-expanded={props.hostPlayerAdministrationOpen ?? false}
                    className="tool-button"
                    data-qa-control="host-manage-players"
                    onClick={props.onManagePlayers}
                    type="button"
                  >
                    Players <span>{props.hostPlayerCount ?? 0}</span>
                  </button>
                ) : null}
                {props.onToggleDeveloperMode ? (
                  <button
                    aria-pressed={props.developerMode ?? false}
                    className="tool-button"
                    data-qa-control="host-developer-toggle"
                    onClick={props.onToggleDeveloperMode}
                    type="button"
                  >
                    Developer
                  </button>
                ) : null}
              </nav>
            ) : null}
          </div>
        </header>
      ) : null}

      {props.mode === "tv" && props.onHostControls ? (
        <button
          aria-label="Return to Host Controls"
          className="host-tv-return"
          data-qa-control="host-tv-return"
          onClick={props.onHostControls}
          type="button"
        >
          <img alt="" src={props.brandSymbolSrc} />
        </button>
      ) : null}

      {isPlayer ? (
        <div className="player-status-bar">
          {props.airplaneMode ? (
            <>
              <span aria-live="polite">{props.connectionLabel}</span>
              <ReconnectAction onReconnect={props.onReconnect} />
            </>
          ) : (
            <PlayerTableStatus projection={props.projection} />
          )}
        </div>
      ) : null}

      {isPlayer ? (
        <PrivateHand {...props} projection={props.projection} />
      ) : (
        <section
          className={`public-table${isQuietPublic ? " public-table--quiet" : ""}`}
          aria-label="Public Table"
        >
          <h1 className="visually-hidden">Public table</h1>
          <ChipRail projection={props.projection} />
          <BoardRail
            {...(bestCards ? { bestCards } : {})}
            board={props.projection.board}
            cardStyle={cardStyle}
            compactGlyphsOnly={compactGlyphsOnly}
            fullFace={
              !props.airplaneMode &&
              (props.mode === "tablet" || props.mode === "tv")
            }
            minimal={props.mode === "host"}
          />
          <SeatGrid
            cardStyle={cardStyle}
            compactGlyphsOnly={compactGlyphsOnly}
            fullFaceShown={
              !props.airplaneMode &&
              (props.mode === "tablet" || props.mode === "tv")
            }
            mode={props.mode}
            projection={props.projection}
            showNames={showQuietPlayerNames}
          />
          <SettlementPanel projection={props.projection} />
          {props.projection.showdown ? (
            <p className="showdown-note" aria-live="polite">
              {props.projection.showdown.leaders.length > 1
                ? "Shown hands are tied."
                : "Best available shown hand is marked."}
            </p>
          ) : null}
        </section>
      )}

      {isPlayer ? (
        <section className="player-board">
          <ChipRail projection={props.projection} />
          <BoardRail
            {...(bestCards ? { bestCards } : {})}
            board={props.projection.board}
            cardStyle={cardStyle}
            compactGlyphsOnly={compactGlyphsOnly}
            minimal
          />
          {!props.airplaneMode ? (
            <div className="player-board__connection-actions">
              <button
                aria-expanded={playerPositionOpen}
                className="player-board__position-action"
                data-qa-control="player-table-position-open"
                onClick={() => setPlayerPositionOpen(true)}
                type="button"
              >
                See your table position
              </button>
              <ReconnectAction onReconnect={props.onReconnect} />
            </div>
          ) : null}
          <SeatGrid
            cardStyle={cardStyle}
            mode="player"
            projection={props.projection}
          />
        </section>
      ) : null}

      {props.errorMessage ? (
        <div className="surface-error" role="alert">
          <span>{props.errorMessage}</span>
          {props.onReconnect ? (
            <ReconnectAction onReconnect={props.onReconnect} />
          ) : null}
        </div>
      ) : null}

      {props.mode === "host" ? (
        <footer className="dealer-dock" aria-label="Dealer controls">
          <div>
            <span className="section-label">Dealer controls</span>
            <strong>{phaseLabel(props.projection.phase)}</strong>
          </div>
          <DealerControls {...props} />
        </footer>
      ) : null}

      {props.mode === "tablet" ? (
        <TabletControls
          {...props}
          onTogglePlayerNames={() =>
            setTablePlayerNamesVisible((visible) => !visible)
          }
          playerNamesVisible={tablePlayerNamesVisible}
        />
      ) : null}

      {isPlayer && !props.airplaneMode && playerPositionOpen ? (
        <PlayerTablePositionDrawer
          onClose={() => setPlayerPositionOpen(false)}
          projection={props.projection}
        />
      ) : null}

      {props.mode === "host" && hostRootOpen ? (
        <HostControlCenter {...props} onClose={() => setHostRootOpen(false)} />
      ) : null}

      {props.developerMode ? (
        <aside className="developer-strip" aria-label="Developer diagnostics">
          <span>Hand ID</span>
          <code>{props.projection.handId ?? "No active hand"}</code>
          {props.onDownloadLog ? (
            <button
              data-qa-control="developer-save-log"
              onClick={props.onDownloadLog}
              type="button"
            >
              Save log
            </button>
          ) : null}
        </aside>
      ) : null}
    </main>
  );
}
