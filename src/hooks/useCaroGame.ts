/**
 * src/hooks/useCaroGame.ts
 * Quản lý trạng thái ván cờ (reducer thuần) + đồng bộ với AI Web Worker.
 *
 * Cơ chế huỷ (Cancellation Token):
 *  - Mỗi yêu cầu tìm kiếm có `requestId` tăng dần; kết quả mang id cũ bị bỏ qua.
 *  - Huỷ cứng: khi người chơi Undo / New Game / đổi luật trong lúc AI đang nghĩ,
 *    worker bị `terminate()` ngay lập tức và một worker mới được tạo — CPU được giải
 *    phóng tức thì, không phải chờ vòng tìm kiếm hiện tại kết thúc.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  AI_LEVELS,
  type AiLevel,
  type AiSearchStats,
  type AiWorkerRequest,
  type AiWorkerResponse,
  type BoardSize,
  type BoardTheme,
  type Cell,
  type GameStatus,
  type Move,
  type PieceStyle,
  type Player,
  type RuleMode,
  type WinInfo,
} from '../types/caro';
import { checkWinAt, createEmptyBoard, isBoardFull, opponentOf, playerToMove, toIndex } from '../utils/caroRules';

// ───────────────────────────── Reducer ─────────────────────────────

export interface GameState {
  gameId: number;
  size: BoardSize;
  rule: RuleMode;
  humanPlayer: Player;
  board: Cell[];
  moves: Move[];
  /** Ngăn xếp Redo — phần tử cuối là nước được làm lại tiếp theo. */
  redo: Move[];
  status: GameStatus;
  win: WinInfo | null;
}

type Action =
  | { type: 'place'; row: number; col: number; player: Player }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'new'; size?: BoardSize; rule?: RuleMode; humanPlayer?: Player };

function initialState(size: BoardSize, rule: RuleMode, humanPlayer: Player, gameId = 1): GameState {
  return {
    gameId,
    size,
    rule,
    humanPlayer,
    board: createEmptyBoard(size),
    moves: [],
    redo: [],
    status: 'playing',
    win: null,
  };
}

function applyMove(state: GameState, row: number, col: number, player: Player): GameState | null {
  if (state.status !== 'playing') return null;
  if (row < 0 || col < 0 || row >= state.size || col >= state.size) return null;
  if (player !== playerToMove(state.moves.length)) return null;
  const idx = toIndex(row, col, state.size);
  if (state.board[idx] !== 0) return null;

  const board = state.board.slice();
  board[idx] = player;
  const move: Move = { row, col, player, number: state.moves.length + 1 };
  const win = checkWinAt(board, state.size, row, col, state.rule);
  const status: GameStatus = win ? 'won' : isBoardFull(board) ? 'draw' : 'playing';
  return { ...state, board, moves: [...state.moves, move], status, win };
}

function rebuild(state: GameState, moves: Move[]): GameState {
  const board = createEmptyBoard(state.size);
  for (const m of moves) board[toIndex(m.row, m.col, state.size)] = m.player;
  return { ...state, board, moves, status: 'playing', win: null };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'place': {
      const next = applyMove(state, action.row, action.col, action.player);
      return next ? { ...next, redo: [] } : state;
    }
    case 'undo': {
      // Không cho xoá nước đầu tiên của AI khi AI cầm X (AI sẽ đi lại y hệt).
      const minLen = state.humanPlayer === 2 ? 1 : 0;
      if (state.moves.length <= minLen) return state;
      const moves = state.moves.slice();
      const redo = state.redo.slice();
      do {
        redo.push(moves.pop()!);
      } while (moves.length > minLen && playerToMove(moves.length) !== state.humanPlayer);
      return { ...rebuild(state, moves), redo };
    }
    case 'redo': {
      if (state.redo.length === 0) return state;
      const redo = state.redo.slice();
      let s: GameState = state;
      do {
        const m = redo.pop()!;
        const next = applyMove(s, m.row, m.col, m.player);
        if (!next) break;
        s = next;
      } while (redo.length > 0 && s.status === 'playing' && playerToMove(s.moves.length) !== s.humanPlayer);
      return { ...s, redo };
    }
    case 'new':
      return initialState(
        action.size ?? state.size,
        action.rule ?? state.rule,
        action.humanPlayer ?? state.humanPlayer,
        state.gameId + 1,
      );
    default:
      return state;
  }
}

// ───────────────────────────── Cài đặt lưu localStorage ─────────────────────────────

interface Settings {
  size: BoardSize;
  rule: RuleMode;
  humanPlayer: Player;
  level: AiLevel;
  showNumbers: boolean;
  theme: BoardTheme;
  pieceStyle: PieceStyle;
}

export interface Tally {
  wins: number;
  losses: number;
  draws: number;
}

const SETTINGS_KEY = 'caro-master-ai:settings';
const TALLY_KEY = 'caro-master-ai:tally';

const DEFAULT_SETTINGS: Settings = {
  size: 15,
  rule: 'freestyle',
  humanPlayer: 1,
  level: 'hard',
  showNumbers: false,
  theme: 'wood',
  pieceStyle: 'stone',
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<T>) } : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage có thể bị chặn (chế độ riêng tư) — bỏ qua. */
  }
}

function createAiWorker(): Worker {
  return new Worker(new URL('../workers/caroAi.worker.ts', import.meta.url), { type: 'module' });
}

// ───────────────────────────── Hook ─────────────────────────────

export function useCaroGame() {
  const [settings, setSettings] = useState<Settings>(() => loadJson(SETTINGS_KEY, DEFAULT_SETTINGS));
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initialState(settings.size, settings.rule, settings.humanPlayer),
  );
  const [thinking, setThinking] = useState(false);
  const [aiStats, setAiStats] = useState<AiSearchStats | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [thinkStartedAt, setThinkStartedAt] = useState<number | null>(null);
  const [tally, setTally] = useState<Tally>(() => loadJson(TALLY_KEY, { wins: 0, losses: 0, draws: 0 }));

  const workerRef = useRef<Worker | null>(null);
  const pendingIdRef = useRef<number | null>(null);
  const requestSeqRef = useRef(0);
  const levelRef = useRef(settings.level);
  levelRef.current = settings.level;
  const countedGameRef = useRef<number>(0);

  useEffect(() => saveJson(SETTINGS_KEY, settings), [settings]);
  useEffect(() => saveJson(TALLY_KEY, tally), [tally]);

  // AI luôn là bên tới lượt khi có kết quả; giữ trong ref để callback ổn định.
  const aiPlayerRef = useRef<Player>(opponentOf(state.humanPlayer));
  aiPlayerRef.current = opponentOf(state.humanPlayer);

  // Xử lý message từ worker — chỉ nhận kết quả khớp token đang chờ.
  const handleMessage = useCallback((event: MessageEvent<AiWorkerResponse>) => {
    const msg = event.data;
    if (msg.requestId !== pendingIdRef.current) return; // token cũ => bỏ qua
    if (msg.type === 'progress') {
      setAiStats(msg.stats);
    } else if (msg.type === 'result') {
      pendingIdRef.current = null;
      setThinking(false);
      setThinkStartedAt(null);
      setAiStats(msg.stats);
      dispatch({ type: 'place', row: msg.move.row, col: msg.move.col, player: aiPlayerRef.current });
    } else if (msg.type === 'error') {
      pendingIdRef.current = null;
      setThinking(false);
      setThinkStartedAt(null);
      setAiError(msg.message);
    }
  }, []);

  const spawnWorker = useCallback(() => {
    workerRef.current?.terminate();
    const worker = createAiWorker();
    worker.onmessage = handleMessage;
    worker.onerror = (e) => {
      pendingIdRef.current = null;
      setThinking(false);
      setThinkStartedAt(null);
      setAiError(e.message || 'Lỗi Web Worker');
    };
    workerRef.current = worker;
    return worker;
  }, [handleMessage]);

  useEffect(() => {
    spawnWorker();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [spawnWorker]);

  /** Huỷ tác vụ AI đang chạy (terminate + respawn worker). */
  const cancelSearch = useCallback(() => {
    if (pendingIdRef.current === null) return;
    pendingIdRef.current = null;
    spawnWorker(); // terminate() worker cũ + tạo worker mới
    setThinking(false);
    setThinkStartedAt(null);
  }, [spawnWorker]);

  const post = useCallback((msg: AiWorkerRequest) => {
    (workerRef.current ?? spawnWorker()).postMessage(msg);
  }, [spawnWorker]);

  const aiPlayer = opponentOf(state.humanPlayer);
  const currentPlayer = playerToMove(state.moves.length);
  const isAiTurn = state.status === 'playing' && currentPlayer === aiPlayer;

  // Kích hoạt AI khi tới lượt máy.
  useEffect(() => {
    if (!isAiTurn) return;
    const requestId = ++requestSeqRef.current;
    pendingIdRef.current = requestId;
    setThinking(true);
    setThinkStartedAt(performance.now());
    setAiError(null);
    post({
      type: 'search',
      requestId,
      size: state.size,
      rule: state.rule,
      board: state.board.slice(),
      aiPlayer,
      config: AI_LEVELS[levelRef.current],
    });
    return () => {
      // Trạng thái thay đổi trước khi AI trả lời => huỷ tác vụ cũ.
      if (pendingIdRef.current === requestId) cancelSearch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAiTurn, state.moves, state.gameId]);

  // Thống kê thắng/thua (mỗi ván chỉ tính 1 lần).
  useEffect(() => {
    if (state.status === 'playing' || countedGameRef.current === state.gameId) return;
    countedGameRef.current = state.gameId;
    setTally((t) =>
      state.status === 'draw'
        ? { ...t, draws: t.draws + 1 }
        : state.win?.winner === state.humanPlayer
          ? { ...t, wins: t.wins + 1 }
          : { ...t, losses: t.losses + 1 },
    );
  }, [state.status, state.gameId, state.win, state.humanPlayer]);

  // ─────────── Hành động ───────────

  const play = useCallback(
    (row: number, col: number) => {
      if (thinking || state.status !== 'playing' || currentPlayer !== state.humanPlayer) return;
      dispatch({ type: 'place', row, col, player: state.humanPlayer });
    },
    [thinking, state.status, state.humanPlayer, currentPlayer],
  );

  const undo = useCallback(() => {
    cancelSearch();
    dispatch({ type: 'undo' });
  }, [cancelSearch]);

  const redo = useCallback(() => {
    cancelSearch();
    dispatch({ type: 'redo' });
  }, [cancelSearch]);

  const startNew = useCallback(
    (opts: { size?: BoardSize; rule?: RuleMode; humanPlayer?: Player } = {}) => {
      cancelSearch();
      post({ type: 'reset' });
      setAiStats(null);
      setAiError(null);
      dispatch({ type: 'new', ...opts });
      setSettings((s) => ({ ...s, ...opts }));
    },
    [cancelSearch, post],
  );

  const newGame = useCallback(() => startNew(), [startNew]);
  const swapSides = useCallback(() => startNew({ humanPlayer: opponentOf(state.humanPlayer) }), [startNew, state.humanPlayer]);
  const setSize = useCallback((size: BoardSize) => startNew({ size }), [startNew]);
  const setRule = useCallback((rule: RuleMode) => startNew({ rule }), [startNew]);
  const setLevel = useCallback((level: AiLevel) => setSettings((s) => ({ ...s, level })), []);
  const setTheme = useCallback((theme: BoardTheme) => setSettings((s) => ({ ...s, theme })), []);
  const setPieceStyle = useCallback((pieceStyle: PieceStyle) => setSettings((s) => ({ ...s, pieceStyle })), []);
  const toggleNumbers = useCallback(() => setSettings((s) => ({ ...s, showNumbers: !s.showNumbers })), []);
  const resetTally = useCallback(() => setTally({ wins: 0, losses: 0, draws: 0 }), []);

  const canUndo = state.moves.length > (state.humanPlayer === 2 ? 1 : 0);
  const canRedo = state.redo.length > 0;
  const lastMove = state.moves.length ? state.moves[state.moves.length - 1] : null;

  return useMemo(
    () => ({
      state,
      settings,
      aiPlayer,
      currentPlayer,
      isAiTurn,
      thinking,
      thinkStartedAt,
      aiStats,
      aiError,
      tally,
      lastMove,
      canUndo,
      canRedo,
      play,
      undo,
      redo,
      newGame,
      swapSides,
      setSize,
      setRule,
      setLevel,
      setTheme,
      setPieceStyle,
      toggleNumbers,
      resetTally,
    }),
    [
      state, settings, aiPlayer, currentPlayer, isAiTurn, thinking, thinkStartedAt, aiStats, aiError, tally,
      lastMove, canUndo, canRedo, play, undo, redo, newGame, swapSides, setSize, setRule, setLevel, setTheme,
      setPieceStyle, toggleNumbers, resetTally,
    ],
  );
}

export type CaroGame = ReturnType<typeof useCaroGame>;
