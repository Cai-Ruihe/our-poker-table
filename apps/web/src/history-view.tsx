import { useEffect, useMemo, useRef, useState } from "react";

import type { Card } from "@html-poker/card-custody";
import { useLanguage } from "@html-poker/presentation";
import {
  groupPublicHistoryHands,
  parsePublicTableHistory,
  searchPublicHistoryHands,
  type PublicHistoryFrame,
  type PublicHistoryHand,
  type PublicTableHistory,
} from "../../../packages/game-core/src/public-history";

import "./history.css";

const MAX_HISTORY_BYTES = 20 * 1024 * 1024;
const INITIAL_RESULT_LIMIT = 50;

const copy = {
  en: {
    title: "Hand history",
    intro:
      "Import a public table history JSON file to find a hand and step through its recorded frames.",
    close: "Close history",
    import: "Import public history JSON",
    importAnother: "Import another file",
    fileLimit: "JSON files up to 20 MB. The file stays in this browser.",
    fileTooLarge: "That file is larger than 20 MB. Choose a smaller JSON file.",
    invalidFile:
      "This file could not be read as a supported public table history. Check the JSON file and try again.",
    invalidSearch:
      "Enter up to two valid cards (such as Ah Kd) and check the time range.",
    imported: "Imported history · not independently verified",
    incomplete:
      "This export may omit hands from before public history recording began.",
    complete: "This export records public history from the first hand.",
    exported: "Exported",
    search: "Find a hand",
    cards: "Public hole cards",
    cardsHint: "Example: Ah Kd",
    from: "From time",
    to: "To time",
    player: "Player name",
    playerHint: "Any player",
    clearSearch: "Clear search",
    hand: "Hand to replay",
    showMore: "Show 50 more hands",
    noMatches:
      "No hands match these filters. Try different cards, times, or a player name.",
    noHands: "This public history contains no recorded hands.",
    uploadPrompt: "Choose a public table history JSON file to begin.",
    recorded: "Recorded step",
    step: "Step",
    previous: "Previous step",
    next: "Next step",
    board: "Community cards",
    pot: "Pot",
    chips: "chips",
    seats: "Players at this step",
    dealer: "Dealer",
    publicCards: "Publicly shown cards",
    noPublicCards: "No public hole cards shown at this step",
    stack: "Stack",
    contribution: "In pot",
    currentAction: "Action at this step",
    noAction: "No action recorded for this step.",
    awards: "Awards recorded at this step",
    unknownPlayer: "Unknown player",
    phase: "Stage",
    percent: "Step position",
  },
  zh: {
    title: "手牌历史",
    intro:
      "导入牌桌公开历史 JSON 文件，查找任意一手并逐步查看已记录的牌局进程。",
    close: "关闭历史记录",
    import: "导入公开历史 JSON",
    importAnother: "导入另一个文件",
    fileLimit: "支持不超过 20 MB 的 JSON 文件。文件仅在此浏览器中读取。",
    fileTooLarge: "文件超过 20 MB，请选择较小的 JSON 文件。",
    invalidFile: "无法读取为受支持的牌桌公开历史。请检查 JSON 文件后重试。",
    invalidSearch:
      "请输入最多两张有效底牌（例如 Ah Kd），并检查开始和结束时间。",
    imported: "已导入历史 · 未经独立验证",
    incomplete: "公开历史记录开始之前的部分手牌可能未包含在此导出中。",
    complete: "此导出从第一手开始记录公开历史。",
    exported: "导出时间",
    search: "查找手牌",
    cards: "公开底牌",
    cardsHint: "例如：Ah Kd",
    from: "开始时间",
    to: "结束时间",
    player: "玩家名称",
    playerHint: "任意玩家",
    clearSearch: "清除筛选",
    hand: "选择要回看的手牌",
    showMore: "再显示 50 手",
    noMatches: "没有符合条件的手牌。请调整底牌、时间或玩家名称。",
    noHands: "此公开历史中没有已记录的手牌。",
    uploadPrompt: "请选择牌桌公开历史 JSON 文件以开始。",
    recorded: "记录步骤",
    step: "步骤",
    previous: "上一步",
    next: "下一步",
    board: "公共牌",
    pot: "底池",
    chips: "筹码",
    seats: "此步骤的玩家",
    dealer: "庄家",
    publicCards: "已公开的底牌",
    noPublicCards: "此步骤尚未公开底牌",
    stack: "剩余筹码",
    contribution: "已投入底池",
    currentAction: "此步骤的行动",
    noAction: "此步骤没有记录行动。",
    awards: "此步骤记录的派奖",
    unknownPlayer: "未知玩家",
    phase: "阶段",
    percent: "步骤位置",
  },
} as const;

function localTime(value: string, language: "en" | "zh"): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "zh" ? "zh-SG" : "en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function chipCount(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : String(value);
}

function matchCountText(count: number, language: "en" | "zh"): string {
  if (language === "zh") return `${count} 手符合条件`;
  return `${count} matching ${count === 1 ? "hand" : "hands"}`;
}

function localDateTimeToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}

const suitGlyph: Record<string, string> = {
  c: "♣",
  d: "♦",
  h: "♥",
  s: "♠",
};

const suitName: Record<string, { en: string; zh: string }> = {
  c: { en: "clubs", zh: "梅花" },
  d: { en: "diamonds", zh: "方块" },
  h: { en: "hearts", zh: "红桃" },
  s: { en: "spades", zh: "黑桃" },
};

const phaseNames: Record<string, { en: string; zh: string }> = {
  lobby: { en: "Lobby", zh: "牌局大厅" },
  preflop: { en: "Pre-flop", zh: "翻牌前" },
  flop: { en: "Flop", zh: "翻牌圈" },
  turn: { en: "Turn", zh: "转牌圈" },
  river: { en: "River", zh: "河牌圈" },
  showdown: { en: "Showdown", zh: "摊牌" },
  "settlement-pending": { en: "Settlement pending", zh: "等待结算" },
  complete: { en: "Complete", zh: "已结束" },
};

const seatStatusNames: Record<string, { en: string; zh: string }> = {
  active: { en: "Active", zh: "行动中" },
  waiting: { en: "Waiting", zh: "等待中" },
  "sitting-out": { en: "Sitting out", zh: "暂时离桌" },
  "folded-provisional": { en: "Fold pending", zh: "弃牌待确认" },
  folded: { en: "Folded", zh: "已弃牌" },
  shown: { en: "Shown", zh: "已亮牌" },
  mucked: { en: "Mucked", zh: "已盖牌" },
  "all-in": { en: "All in", zh: "全下" },
};

const actionNames: Record<string, { en: string; zh: string }> = {
  AllIn: { en: "All in", zh: "全下" },
  "all-in": { en: "All in", zh: "全下" },
  bet: { en: "Bet", zh: "下注" },
  BetOrRaiseTo: { en: "Bet or raise to", zh: "下注或加注至" },
  "bet-or-raise-to": { en: "Bet or raise to", zh: "下注或加注至" },
  Call: { en: "Call", zh: "跟注" },
  call: { en: "Call", zh: "跟注" },
  Check: { en: "Check", zh: "过牌" },
  check: { en: "Check", zh: "过牌" },
  Fold: { en: "Fold", zh: "弃牌" },
  fold: { en: "Fold", zh: "弃牌" },
  raise: { en: "Raise", zh: "加注" },
  StartHand: { en: "Hand started", zh: "开始新手牌" },
  ShowCards: { en: "Show cards", zh: "亮牌" },
  PrepareSettlement: { en: "Settlement proposed", zh: "生成结算方案" },
  ConfirmSettlement: { en: "Settlement confirmed", zh: "确认结算" },
  TopUpChips: { en: "Chips topped up", zh: "补充筹码" },
};

const eventNames: Record<string, { en: string; zh: string }> = {
  AccountingHandStarted: { en: "Hand started", zh: "开始新手牌" },
  AccountingStreetStarted: { en: "Street started", zh: "新一轮公共牌" },
  BettingActionCommitted: { en: "Betting action", zh: "下注行动" },
  BettingRoundClosed: { en: "Betting round closed", zh: "本轮下注结束" },
  ChipsToppedUp: { en: "Chips topped up", zh: "已补充筹码" },
  ForcedBetPosted: { en: "Blind posted", zh: "已下盲注" },
  SettlementConfirmed: { en: "Settlement confirmed", zh: "结算已确认" },
  SettlementProposed: { en: "Settlement proposed", zh: "已提交结算" },
  ShowdownStarted: { en: "Showdown started", zh: "开始摊牌" },
};

function phaseName(value: string, language: "en" | "zh"): string {
  return phaseNames[value]?.[language] ?? value;
}

function seatStatusName(value: string, language: "en" | "zh"): string {
  return seatStatusNames[value.toLowerCase()]?.[language] ?? value;
}

function eventName(value: string, language: "en" | "zh"): string {
  return (
    eventNames[value]?.[language] ??
    value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("-", " ")
  );
}

function cardRank(card: Card): string {
  const rank = card.slice(0, 1);
  return rank === "T" ? "10" : rank;
}

function cardSpokenName(card: Card, language: "en" | "zh"): string {
  const suit = suitName[card.slice(1, 2)];
  const translatedSuit = suit?.[language] ?? card.slice(1, 2);
  return language === "zh"
    ? `${cardRank(card)}${translatedSuit}`
    : `${cardRank(card)} of ${translatedSuit}`;
}

function CardFace({
  card,
  language,
  small = false,
}: {
  readonly card: Card;
  readonly language: "en" | "zh";
  readonly small?: boolean;
}) {
  const suit = card.slice(1, 2);
  return (
    <span
      aria-label={cardSpokenName(card, language)}
      className={`history-replay__card${small ? " history-replay__card--small" : ""}${suit === "h" || suit === "d" ? " history-replay__card--red" : ""}`}
      data-history-public-card={card}
      role="img"
    >
      <span>{cardRank(card)}</span>
      <span aria-hidden="true">{suitGlyph[suit] ?? suit}</span>
    </span>
  );
}

function actionText(
  frame: PublicHistoryFrame,
  hand: PublicHistoryHand,
  language: "en" | "zh",
): string {
  const actingSeat = frame.action.seatId
    ? frame.seats.find((seat) => seat.seatId === frame.action.seatId)
    : undefined;
  const amount = frame.action.to ?? frame.action.amount;
  const text = copy[language];
  const amountText =
    amount === undefined ? "" : ` · ${chipCount(amount)} ${text.chips}`;
  const actor =
    actingSeat?.displayName ?? (frame.action.seatId ? text.unknownPlayer : "");
  const action =
    actionNames[frame.action.type]?.[language] ?? frame.action.type;
  const note = frame.action.note ? ` · ${frame.action.note}` : "";
  return `${actor} ${action}${amountText}${note}`.trim() || hand.handId;
}

export function HistoryReplay({
  onClose,
  initialHistory,
}: {
  readonly onClose: () => void;
  readonly initialHistory?: PublicTableHistory;
}) {
  const { language } = useLanguage();
  const text = copy[language];
  const [history, setHistory] = useState<PublicTableHistory | undefined>(
    initialHistory,
  );
  const [sourceName, setSourceName] = useState<string>();
  const [importError, setImportError] = useState<string>();
  const [cardQuery, setCardQuery] = useState("");
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [playerQuery, setPlayerQuery] = useState("");
  const [selectedHandId, setSelectedHandId] = useState("");
  const [frameIndex, setFrameIndex] = useState(0);
  const [visibleHandLimit, setVisibleHandLimit] =
    useState(INITIAL_RESULT_LIMIT);
  const importRequest = useRef(0);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    globalThis.addEventListener("keydown", closeOnEscape);
    return () => globalThis.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    if (!initialHistory) return;
    setHistory(initialHistory);
    setSourceName(undefined);
    setSelectedHandId("");
    setFrameIndex(0);
    setVisibleHandLimit(INITIAL_RESULT_LIMIT);
  }, [initialHistory]);

  const searchResult = useMemo(() => {
    if (!history) return { hands: [], error: undefined as string | undefined };
    const query = {
      ...(cardQuery.trim() ? { cards: cardQuery.trim() } : {}),
      ...(fromQuery
        ? { from: localDateTimeToIso(fromQuery) ?? fromQuery }
        : {}),
      ...(toQuery ? { to: localDateTimeToIso(toQuery) ?? toQuery } : {}),
      ...(playerQuery.trim() ? { player: playerQuery.trim() } : {}),
    };
    try {
      return {
        hands: searchPublicHistoryHands(history, query),
        error: undefined as string | undefined,
      };
    } catch {
      return { hands: [], error: copy[language].invalidSearch };
    }
  }, [history, cardQuery, fromQuery, toQuery, playerQuery, language]);
  const matchedHands = searchResult.hands;
  const searchError = searchResult.error;

  const handNumbers = useMemo(
    () =>
      new Map(
        history
          ? groupPublicHistoryHands(history).map((hand, index) => [
              hand.handId,
              index + 1,
            ])
          : [],
      ),
    [history],
  );
  const handLabel = (id: string) =>
    language === "zh"
      ? `第 ${handNumbers.get(id)} 手`
      : `Hand ${handNumbers.get(id)}`;
  const listedHands = matchedHands.slice(0, visibleHandLimit);
  const selectedHand =
    matchedHands.find((hand) => hand.handId === selectedHandId) ??
    matchedHands[0];
  const activeFrameIndex = selectedHand
    ? Math.min(frameIndex, Math.max(0, selectedHand.frames.length - 1))
    : 0;
  const activeFrame = selectedHand?.frames[activeFrameIndex];

  async function importHistory(
    file: File | undefined,
    input: HTMLInputElement,
  ) {
    const requestId = ++importRequest.current;
    input.value = "";
    setImportError(undefined);
    if (!file) return;
    if (file.size > MAX_HISTORY_BYTES) {
      setImportError(text.fileTooLarge);
      return;
    }

    try {
      const parsed = parsePublicTableHistory(await file.text());
      if (requestId !== importRequest.current) return;
      const firstHand = groupPublicHistoryHands(parsed)[0];
      setHistory(parsed);
      setSourceName(file.name);
      setSelectedHandId(firstHand?.handId ?? "");
      setFrameIndex(0);
      setVisibleHandLimit(INITIAL_RESULT_LIMIT);
    } catch {
      if (requestId === importRequest.current) setImportError(text.invalidFile);
    }
  }

  function updateSearch(setValue: (next: string) => void, next: string) {
    setValue(next);
    setFrameIndex(0);
    setVisibleHandLimit(INITIAL_RESULT_LIMIT);
  }

  function clearSearch() {
    setCardQuery("");
    setFromQuery("");
    setToQuery("");
    setPlayerQuery("");
    setFrameIndex(0);
    setVisibleHandLimit(INITIAL_RESULT_LIMIT);
  }

  const seatNames = new Map(
    activeFrame?.seats.map((seat) => [seat.seatId, seat.displayName]) ?? [],
  );
  const visibleEvents = activeFrame?.events ?? [];

  return (
    <div
      className="history-replay-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="history-replay-title"
        aria-modal="true"
        className="history-replay"
        role="dialog"
      >
        <header className="history-replay__header">
          <div className="history-replay__heading">
            <p className="history-replay__eyebrow">
              <span aria-hidden="true">♠</span>{" "}
              {language === "zh"
                ? "OUR POKER TABLE / 公开记录"
                : "OUR POKER TABLE / PUBLIC RECORD"}
            </p>
            <h1 id="history-replay-title">{text.title}</h1>
            <p>{text.intro}</p>
          </div>
          <button
            aria-label={text.close}
            autoFocus
            className="history-replay__close"
            data-qa-control="history-close"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
            <span>{text.close}</span>
          </button>
        </header>

        <section aria-label={text.import} className="history-replay__import">
          <div className="history-replay__import-copy">
            <span aria-hidden="true" className="history-replay__import-mark">
              ↥
            </span>
            <div>
              <strong>{history ? text.importAnother : text.import}</strong>
              <small>{text.fileLimit}</small>
            </div>
          </div>
          <label className="history-replay__button history-replay__button--gold">
            {history ? text.importAnother : text.import}
            <input
              accept="application/json,.json"
              className="visually-hidden"
              data-qa-control="history-import"
              onChange={(event) =>
                void importHistory(
                  event.currentTarget.files?.[0],
                  event.currentTarget,
                )
              }
              type="file"
            />
          </label>
        </section>

        {importError ? (
          <p className="history-replay__error" role="alert">
            {importError}
          </p>
        ) : null}

        {!history ? (
          <div className="history-replay__empty-import">
            <span aria-hidden="true">♣</span>
            <p>{text.uploadPrompt}</p>
          </div>
        ) : (
          <>
            <div className="history-replay__source" role="status">
              <span className="history-replay__source-dot" />
              <span>{text.imported}</span>
              {sourceName ? <strong>{sourceName}</strong> : null}
              <small>
                {history.completeFromFirstHand
                  ? text.complete
                  : text.incomplete}
              </small>
              <small>
                {text.exported} {localTime(history.exportedAt, language)}
              </small>
            </div>

            <section
              aria-labelledby="history-search-title"
              className="history-replay__search"
            >
              <div className="history-replay__search-heading">
                <div>
                  <p className="history-replay__section-label">
                    {language === "zh" ? "搜索牌局记录" : "SEARCH THE RECORD"}
                  </p>
                  <h2 id="history-search-title">{text.search}</h2>
                </div>
                <span className="history-replay__match-count">
                  {matchCountText(matchedHands.length, language)}
                </span>
              </div>
              <div className="history-replay__filters">
                <label className="history-replay__field history-replay__field--cards">
                  <span>{text.cards}</span>
                  <input
                    autoComplete="off"
                    data-qa-control="history-search-cards"
                    onChange={(event) =>
                      updateSearch(setCardQuery, event.currentTarget.value)
                    }
                    placeholder={text.cardsHint}
                    value={cardQuery}
                  />
                </label>
                <label className="history-replay__field">
                  <span>{text.from}</span>
                  <input
                    data-qa-control="history-search-from"
                    onChange={(event) =>
                      updateSearch(setFromQuery, event.currentTarget.value)
                    }
                    type="datetime-local"
                    value={fromQuery}
                  />
                </label>
                <label className="history-replay__field">
                  <span>{text.to}</span>
                  <input
                    data-qa-control="history-search-to"
                    onChange={(event) =>
                      updateSearch(setToQuery, event.currentTarget.value)
                    }
                    type="datetime-local"
                    value={toQuery}
                  />
                </label>
                <label className="history-replay__field">
                  <span>{text.player}</span>
                  <input
                    autoComplete="off"
                    data-qa-control="history-search-player"
                    onChange={(event) =>
                      updateSearch(setPlayerQuery, event.currentTarget.value)
                    }
                    placeholder={text.playerHint}
                    value={playerQuery}
                  />
                </label>
              </div>
              {searchError ? (
                <p className="history-replay__error" role="alert">
                  {searchError}
                </p>
              ) : null}
              <div className="history-replay__search-foot">
                <small>
                  {language === "zh"
                    ? "搜索会按每手牌当时公开的记录筛选。"
                    : "Search uses the public records available for each hand."}
                </small>
                <button
                  className="history-replay__text-button"
                  data-qa-control="history-search-clear"
                  onClick={clearSearch}
                  type="button"
                >
                  {text.clearSearch}
                </button>
              </div>
            </section>

            {matchedHands.length > 0 ? (
              <div className="history-replay__hand-select">
                <label className="history-replay__field">
                  <span>{text.hand}</span>
                  <select
                    data-qa-control="history-hand-select"
                    onChange={(event) => {
                      setSelectedHandId(event.currentTarget.value);
                      setFrameIndex(0);
                    }}
                    value={selectedHand?.handId ?? ""}
                  >
                    {listedHands.map((hand) => (
                      <option key={hand.handId} value={hand.handId}>
                        {handLabel(hand.handId)} ·{" "}
                        {localTime(hand.startedAt, language)}
                      </option>
                    ))}
                  </select>
                </label>
                {matchedHands.length > listedHands.length ? (
                  <button
                    className="history-replay__button history-replay__button--quiet"
                    data-qa-control="history-show-more"
                    onClick={() =>
                      setVisibleHandLimit((limit) =>
                        Math.min(
                          limit + INITIAL_RESULT_LIMIT,
                          matchedHands.length,
                        ),
                      )
                    }
                    type="button"
                  >
                    {text.showMore} ({matchedHands.length - listedHands.length})
                  </button>
                ) : null}
              </div>
            ) : null}

            {selectedHand && activeFrame ? (
              <>
                <section
                  aria-label={text.recorded}
                  className="history-replay__stage"
                >
                  <div className="history-replay__stage-main">
                    <div className="history-replay__stage-topline">
                      <div>
                        <p className="history-replay__section-label">
                          {text.recorded}
                        </p>
                        <h2>{handLabel(selectedHand.handId)}</h2>
                      </div>
                      <span className="history-replay__frame-time">
                        {localTime(activeFrame.at, language)}
                      </span>
                    </div>

                    <div
                      className="history-replay__felt"
                      data-history-frame-revision={activeFrame.revision}
                    >
                      <div className="history-replay__felt-meta">
                        <span>
                          {text.phase}{" "}
                          <strong>
                            {phaseName(activeFrame.phase, language)}
                          </strong>
                        </span>
                        {activeFrame.potTotal !== undefined ? (
                          <span>
                            {text.pot}{" "}
                            <strong>{chipCount(activeFrame.potTotal)}</strong>
                          </span>
                        ) : null}
                      </div>
                      <div
                        aria-label={text.board}
                        className="history-replay__board"
                      >
                        {Array.from({ length: 5 }, (_, index) => {
                          const card = activeFrame.board[index];
                          return card ? (
                            <CardFace
                              card={card}
                              key={`${card}-${index}`}
                              language={language}
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className="history-replay__card-slot"
                              key={`empty-${index}`}
                            />
                          );
                        })}
                      </div>
                      <p className="history-replay__action-line">
                        <span aria-hidden="true">›</span>
                        {actionText(activeFrame, selectedHand, language)}
                      </p>
                    </div>

                    <section
                      aria-labelledby="history-seats-title"
                      className="history-replay__seats"
                    >
                      <div className="history-replay__subheading">
                        <h3 id="history-seats-title">{text.seats}</h3>
                        <span>{activeFrame.seats.length}</span>
                      </div>
                      <div className="history-replay__seat-grid">
                        {activeFrame.seats.map((seat) => (
                          <article
                            className="history-replay__seat"
                            key={seat.seatId}
                          >
                            <header>
                              <strong>{seat.displayName}</strong>
                              {seat.seatId === activeFrame.dealerSeatId ? (
                                <span className="history-replay__dealer">
                                  {text.dealer}
                                </span>
                              ) : null}
                              <small>
                                {seatStatusName(seat.status, language)}
                              </small>
                            </header>
                            <div className="history-replay__seat-cards">
                              {seat.holeCards?.length ? (
                                <>
                                  <span>{text.publicCards}</span>
                                  <div>
                                    {seat.holeCards.map((card, index) => (
                                      <CardFace
                                        card={card}
                                        key={`${seat.seatId}-${card}-${index}`}
                                        language={language}
                                        small
                                      />
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <span className="history-replay__no-cards">
                                  {text.noPublicCards}
                                </span>
                              )}
                            </div>
                            <div className="history-replay__seat-metrics">
                              {seat.stack !== undefined ? (
                                <span>
                                  {text.stack}{" "}
                                  <strong>{chipCount(seat.stack)}</strong>
                                </span>
                              ) : null}
                              {seat.contribution !== undefined ? (
                                <span>
                                  {text.contribution}{" "}
                                  <strong>
                                    {chipCount(seat.contribution)}
                                  </strong>
                                </span>
                              ) : null}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  </div>

                  <aside className="history-replay__step-rail">
                    <div className="history-replay__step-counter">
                      <span>{text.step}</span>
                      <strong>
                        {activeFrameIndex + 1}
                        <small> / {selectedHand.frames.length}</small>
                      </strong>
                    </div>
                    <label className="history-replay__range-label">
                      <span className="visually-hidden">{text.percent}</span>
                      <input
                        aria-label={text.percent}
                        data-qa-control="history-step-range"
                        disabled={selectedHand.frames.length <= 1}
                        max={Math.max(0, selectedHand.frames.length - 1)}
                        min={0}
                        onChange={(event) =>
                          setFrameIndex(Number(event.currentTarget.value))
                        }
                        type="range"
                        value={activeFrameIndex}
                      />
                    </label>
                    <div className="history-replay__step-buttons">
                      <button
                        aria-label={text.previous}
                        className="history-replay__step-button"
                        data-qa-control="history-step-prev"
                        disabled={activeFrameIndex <= 0}
                        onClick={() => setFrameIndex(activeFrameIndex - 1)}
                        type="button"
                      >
                        <span aria-hidden="true">←</span>
                        {text.previous}
                      </button>
                      <button
                        aria-label={text.next}
                        className="history-replay__step-button"
                        data-qa-control="history-step-next"
                        disabled={
                          activeFrameIndex >= selectedHand.frames.length - 1
                        }
                        onClick={() => setFrameIndex(activeFrameIndex + 1)}
                        type="button"
                      >
                        {text.next}
                        <span aria-hidden="true">→</span>
                      </button>
                    </div>

                    <section
                      aria-labelledby="history-actions-title"
                      className="history-replay__actions"
                    >
                      <p className="history-replay__section-label">
                        {text.currentAction}
                      </p>
                      <h3 id="history-actions-title">
                        {actionText(activeFrame, selectedHand, language)}
                      </h3>
                      {visibleEvents.length ? (
                        <ul>
                          {visibleEvents.map((event, index) => (
                            <li
                              key={`${event.type}-${event.seatId ?? ""}-${index}`}
                            >
                              <span>{eventName(event.type, language)}</span>
                              <small>
                                {event.seatId
                                  ? (seatNames.get(event.seatId) ??
                                    text.unknownPlayer)
                                  : ""}
                                {event.amount !== undefined
                                  ? ` · ${chipCount(event.amount)}`
                                  : ""}
                              </small>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="history-replay__quiet-copy">
                          {text.noAction}
                        </p>
                      )}
                    </section>

                    {activeFrame.awards?.length ? (
                      <section className="history-replay__awards">
                        <p className="history-replay__section-label">
                          {text.awards}
                        </p>
                        {activeFrame.awards.map((award, index) => (
                          <p key={`${award.seatId}-${index}`}>
                            <strong>
                              {seatNames.get(award.seatId) ??
                                text.unknownPlayer}
                            </strong>
                            <span>
                              {chipCount(award.amount)} {text.chips}
                            </span>
                          </p>
                        ))}
                      </section>
                    ) : null}
                  </aside>
                </section>
              </>
            ) : matchedHands.length === 0 && !searchError ? (
              <div className="history-replay__empty-results" role="status">
                <span aria-hidden="true">⌕</span>
                <p>
                  {groupPublicHistoryHands(history).length === 0
                    ? text.noHands
                    : text.noMatches}
                </p>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
