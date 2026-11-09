/**
 * src/types/caro.ts
 * Định nghĩa kiểu dữ liệu dùng chung giữa UI (Main Thread) và AI Engine (Web Worker).
 *
 * LƯU Ý: Worker chỉ `import type` từ file này (không import giá trị runtime) để
 * bundle của worker tự chứa và có thể chạy test trực tiếp bằng Node.
 */

/** 0 = ô trống, 1 = quân X (luôn đi trước), 2 = quân O. */
export type Cell = 0 | 1 | 2;
export type Player = 1 | 2;

export const EMPTY: Cell = 0;
export const PLAYER_X: Player = 1;
export const PLAYER_O: Player = 2;

export type BoardSize = 15 | 19;

/**
 * - freestyle: Gomoku tự do — từ 5 quân liên tiếp trở lên là thắng.
 * - standard : Caro Việt Nam (chặn 2 đầu) — chuỗi >= 5 quân nhưng bị quân đối
 *              phương chặn ở CẢ 2 đầu thì chưa thắng. Mép bàn cờ không tính là quân chặn.
 */
export type RuleMode = 'freestyle' | 'standard';

export type AiLevel = 'easy' | 'medium' | 'hard' | 'master';

export type GameStatus = 'playing' | 'won' | 'draw';

export type BoardTheme = 'wood' | 'dark' | 'light';
export type PieceStyle = 'stone' | 'xo';

export interface Coord {
  row: number;
  col: number;
}

export interface Move extends Coord {
  player: Player;
  /** Số thứ tự nước đi, bắt đầu từ 1. */
  number: number;
}

export interface WinInfo {
  winner: Player;
  /** Các ô tạo thành đường thắng (đã sắp xếp theo thứ tự trên đường). */
  line: Coord[];
}

/**
 * Mã thế cờ theo 1 hướng khi đặt quân vào một ô (bảng tra cứu pattern trong worker).
 * Dùng object hằng thay vì `enum` để tương thích `erasableSyntaxOnly`.
 */
export const PatternShape = {
  NONE: 0,
  ONE: 1,
  TWO: 2, // 2 bị chặn
  OPEN_TWO: 3, // 2 mở (Live 2)
  THREE: 4, // 3 bị chặn (Blocked 3)
  OPEN_THREE: 5, // 3 mở (Live 3) — có thể thành 4 mở
  FOUR: 6, // 4 bị chặn (Blocked 4) — đúng 1 điểm thành 5
  OPEN_FOUR: 7, // 4 mở (Live 4) — >= 2 điểm thành 5
  FIVE: 8, // 5 hợp lệ theo luật hiện tại
} as const;
export type PatternShapeId = (typeof PatternShape)[keyof typeof PatternShape];

export const PATTERN_LABELS: Record<PatternShapeId, string> = {
  0: 'Không',
  1: 'Đơn',
  2: '2 chặn',
  3: '2 mở',
  4: '3 chặn',
  5: '3 mở',
  6: '4 chặn',
  7: '4 mở',
  8: '5 (Thắng)',
};

/** Cấu hình độ khó gửi kèm mỗi yêu cầu tìm kiếm tới worker. */
export interface AiLevelConfig {
  id: AiLevel;
  label: string;
  description: string;
  /** Độ sâu tối đa của Negamax (iterative deepening từ 1 -> maxDepth). */
  maxDepth: number;
  /** Ngân sách thời gian (ms) cho một nước đi. */
  timeMs: number;
  /** Số nước ứng viên tối đa (Top-K) được đưa vào cây tìm kiếm ở mỗi nút. */
  candidateLimit: number;
  /** Tìm chuỗi tứ liên hoàn (VCF — Threat Space Search) cho chính AI ở gốc. */
  rootVcf: boolean;
  /** Tìm VCF tại các nút lá (quiescence theo đe doạ). */
  leafVcf: boolean;
  /** Độ sâu (số nước tấn công) của VCF. */
  vcfDepth: number;
  /** Kiểm tra bẫy: loại nước đi để đối thủ có chuỗi VCF thắng. */
  trapCheck: boolean;
  /** Xác suất chọn ngẫu nhiên một nước gần-tốt-nhất (làm AI "người" hơn ở mức dễ). */
  randomness: number;
}

export const AI_LEVELS: Record<AiLevel, AiLevelConfig> = {
  easy: {
    id: 'easy',
    label: 'Dễ',
    description: 'Depth 2 · Top 8 ứng viên',
    maxDepth: 2,
    timeMs: 500,
    candidateLimit: 8,
    rootVcf: false,
    leafVcf: false,
    vcfDepth: 0,
    trapCheck: false,
    randomness: 0.35,
  },
  medium: {
    id: 'medium',
    label: 'Trung bình',
    description: 'Depth 4 · Top 12 ứng viên',
    maxDepth: 4,
    timeMs: 1500,
    candidateLimit: 12,
    rootVcf: false,
    leafVcf: false,
    vcfDepth: 0,
    trapCheck: false,
    randomness: 0,
  },
  hard: {
    id: 'hard',
    label: 'Cao thủ',
    description: 'Depth 6 · VCF gốc · Chống bẫy',
    maxDepth: 6,
    timeMs: 3000,
    candidateLimit: 12,
    rootVcf: true,
    leafVcf: false,
    vcfDepth: 10,
    trapCheck: true,
    randomness: 0,
  },
  master: {
    id: 'master',
    label: 'Siêu khó',
    description: 'Depth 8 · Threat Search toàn cây',
    maxDepth: 8,
    timeMs: 6000,
    candidateLimit: 15,
    rootVcf: true,
    leafVcf: true,
    vcfDepth: 16,
    trapCheck: true,
    randomness: 0,
  },
};

/** Điểm thắng tuyệt đối của engine; điểm > AI_WIN_THRESHOLD nghĩa là thắng cưỡng bức. */
export const AI_WIN_SCORE = 10_000_000;
export const AI_WIN_THRESHOLD = AI_WIN_SCORE - 10_000;

// ───────────────────────── Giao thức Main Thread <-> Worker ─────────────────────────

export interface AiSearchRequest {
  type: 'search';
  requestId: number;
  size: BoardSize;
  rule: RuleMode;
  /** Bàn cờ phẳng, độ dài size*size, giá trị 0/1/2. */
  board: number[];
  aiPlayer: Player;
  config: AiLevelConfig;
}

export interface AiResetRequest {
  type: 'reset';
}

export type AiWorkerRequest = AiSearchRequest | AiResetRequest;

export interface AiSearchStats {
  /** Độ sâu Negamax đã hoàn thành trọn vẹn. */
  depth: number;
  /** Tổng số node đã duyệt (Negamax + VCF). */
  nodes: number;
  timeMs: number;
  /** Đánh giá theo góc nhìn của AI. */
  score: number;
  /** Số nước ứng viên ở gốc. */
  candidates: number;
  /** Số lần trúng Transposition Table. */
  ttHits: number;
  /** Lý do chọn nước (tactical, VCF, search...). */
  reason: string;
  bestMove: Coord | null;
}

export interface AiProgressMessage {
  type: 'progress';
  requestId: number;
  stats: AiSearchStats;
}

export interface AiResultMessage {
  type: 'result';
  requestId: number;
  move: Coord;
  stats: AiSearchStats;
}

export interface AiErrorMessage {
  type: 'error';
  requestId: number;
  message: string;
}

export type AiWorkerResponse = AiProgressMessage | AiResultMessage | AiErrorMessage;
