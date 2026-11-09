/**
 * src/workers/caroAi.worker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI Engine Cờ Caro chạy trong Web Worker.
 *
 *  1. Pattern Table   : bảng tra cứu 2^20 phần tử (lazy, DP có nhớ) phân loại thế cờ
 *                       theo 1 hướng (5, 4 mở, 4 chặn, 3 mở, 3 chặn, 2 mở, ...) khi đặt
 *                       quân vào một ô, xét cửa sổ 11 ô (±5) — hỗ trợ cả 2 luật.
 *  2. Incremental     : mỗi nước đặt/gỡ chỉ cập nhật 4 x 10 ô lân cận trên 4 đường
 *                       (thế cờ, cờ hiệu đe doạ, điểm sắp xếp, tổng điểm đánh giá).
 *  3. Candidate Gen   : chỉ ô trống trong bán kính 2 quanh các quân đã đánh, chấm điểm
 *                       tấn công + phòng thủ, lấy Top-K. Nhận diện bắt buộc: thắng ngay,
 *                       chặn 4, 4 mở / 4-4 thắng, chống 3 mở (chỉ xét nước chặn + phản tứ).
 *  4. Negamax + Alpha-Beta + Iterative Deepening + Zobrist Transposition Table.
 *  5. Threat-Space Search (VCF — chuỗi tứ liên hoàn) ở gốc, ở nút lá (quiescence) và
 *     kiểm tra bẫy (đối thủ có VCF sau nước của AI hay không) => chống 3-3, 4-3, 4-4.
 *
 * Worker chỉ `import type` để file tự chứa hoàn toàn (không phụ thuộc runtime).
 */
import type {
  AiLevelConfig,
  AiSearchRequest,
  AiSearchStats,
  AiWorkerRequest,
  AiWorkerResponse,
  RuleMode,
} from '../types/caro';

// ───────────────────────────── Hằng số ─────────────────────────────

const S_NONE = 0;
const S_ONE = 1;
const S_TWO = 2;
const S_OPEN_TWO = 3;
const S_THREE = 4;
const S_OPEN_THREE = 5;
const S_FOUR = 6;
const S_OPEN_FOUR = 7;
const S_FIVE = 8;

/** Mã ô trong khoá pattern (2 bit / ô). */
const C_EMPTY = 0;
const C_MINE = 1;
const C_OPP = 2;
const C_WALL = 3;

const SLOTS = 10; // ±5 quanh tâm, không tính tâm
const TABLE_SIZE = 1 << (SLOTS * 2);
const UNKNOWN = 255;

/** Cờ hiệu (bitmask) cho từng ô trống, theo từng người chơi. */
const F_FIVE = 1; // đặt vào đây là thắng
const F_WIN = 2; // tạo 4 mở hoặc 4-4 => thắng chắc
const F_FOUR = 4; // tạo ít nhất một thế 4 (nước tứ — đe doạ bắt buộc)
const F_43 = 8; // 4-3
const F_33 = 16; // 3-3
const F_THREE = 32; // tạo 3 mở

/** Trọng số sắp xếp nước đi theo từng hướng (index = mã thế cờ). */
const ORDER_W = [0, 1, 8, 40, 50, 320, 380, 6000, 200000];
/** Trọng số đánh giá tĩnh theo từng hướng. */
const EVAL_W = [0, 0, 2, 10, 12, 60, 70, 900, 4000];

const WIN = 10_000_000;
const WIN_TH = WIN - 10_000;
const INF = WIN + 1;

const MAX_PLY = 72;
const TT_BITS = 20;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;

const GEN_WIN_NOW = -1;
const GEN_LOSS = -2;
const GEN_WIN_SOON = -3;

// ───────────────────────────── Pattern Table ─────────────────────────────

/**
 * Phân loại thế cờ 1 chiều bằng định nghĩa đệ quy (quy hoạch động có nhớ):
 *  - FIVE      : chuỗi qua tâm >= 5 và hợp lệ theo luật.
 *  - OPEN_FOUR : có >= 2 ô trống mà đặt vào sẽ thành FIVE.
 *  - FOUR      : có đúng 1 ô như vậy.
 *  - OPEN_THREE: có ô trống đặt vào thành OPEN_FOUR.     (3 mở, kể cả 3 gãy _X_XX_)
 *  - THREE     : có ô trống đặt vào thành FOUR.
 *  - OPEN_TWO  : có ô trống đặt vào thành OPEN_THREE.
 *  - TWO       : có ô trống đặt vào thành THREE.
 *  - ONE       : còn khả năng phát triển; NONE: chết hoàn toàn.
 * Khoá = 10 ô quanh tâm (slot 0..4 = offset -5..-1, slot 5..9 = +1..+5), 2 bit/ô.
 */
class PatternTable {
  readonly rule: RuleMode;
  private readonly table: Uint8Array;

  constructor(rule: RuleMode) {
    this.rule = rule;
    this.table = new Uint8Array(TABLE_SIZE).fill(UNKNOWN);
  }

  get(key: number): number {
    const v = this.table[key];
    return v !== UNKNOWN ? v : this.classify(key);
  }

  private isFive(key: number): boolean {
    let left = 0;
    while (left < 5 && ((key >> (2 * (4 - left))) & 3) === C_MINE) left++;
    let right = 0;
    while (right < 5 && ((key >> (2 * (5 + right))) & 3) === C_MINE) right++;
    if (left + right + 1 < 5) return false;
    if (this.rule === 'freestyle') return true;
    // Luật chặn 2 đầu: chỉ quân đối phương mới tính là chặn (ngoài cửa sổ coi như mở).
    const leftEnd = left < 5 ? (key >> (2 * (4 - left))) & 3 : C_EMPTY;
    const rightEnd = right < 5 ? (key >> (2 * (5 + right))) & 3 : C_EMPTY;
    return !(leftEnd === C_OPP && rightEnd === C_OPP);
  }

  private classify(key: number): number {
    let result: number;
    if (this.isFive(key)) {
      result = S_FIVE;
    } else {
      let fives = 0;
      let best = S_NONE;
      for (let s = 0; s < SLOTS; s++) {
        if (((key >> (2 * s)) & 3) !== C_EMPTY) continue;
        const child = this.get(key | (C_MINE << (2 * s)));
        if (child === S_FIVE) fives++;
        else if (child > best) best = child;
      }
      if (fives >= 2) result = S_OPEN_FOUR;
      else if (fives === 1) result = S_FOUR;
      else if (best === S_OPEN_FOUR) result = S_OPEN_THREE;
      else if (best === S_FOUR) result = S_THREE;
      else if (best === S_OPEN_THREE) result = S_OPEN_TWO;
      else if (best === S_THREE) result = S_TWO;
      else if (best === S_OPEN_TWO || best === S_TWO) result = S_ONE;
      else result = S_NONE;
    }
    this.table[key] = result;
    return result;
  }
}

const patternTables: Partial<Record<RuleMode, PatternTable>> = {};
function getPatternTable(rule: RuleMode): PatternTable {
  let t = patternTables[rule];
  if (!t) {
    t = new PatternTable(rule);
    patternTables[rule] = t;
  }
  return t;
}

// ───────────────────────────── Zobrist RNG ─────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) | 0;
  };
}

// ───────────────────────────── Engine ─────────────────────────────

export interface SearchResult {
  move: number;
  stats: AiSearchStats;
}

export type ProgressCallback = (stats: AiSearchStats) => void;

export class CaroEngine {
  size = 0;
  N = 0;
  rule: RuleMode = 'freestyle';
  private patterns: PatternTable = getPatternTable('freestyle');

  board = new Int8Array(0);
  private near = new Uint8Array(0);
  private shapes = new Uint8Array(0); // (idx*4+d)*2 + (p-1)
  flags = new Uint8Array(0); // idx*2 + (p-1)
  private ordVal = new Int32Array(0);
  private evalVal = new Int32Array(0);
  private sumEval = new Int32Array(3);
  private lineIdx = new Int16Array(0); // (idx*4+d)*10 + slot
  private nearIdx = new Int16Array(0); // idx*25 + k
  private zobLo = new Int32Array(0);
  private zobHi = new Int32Array(0);
  private hashLo = 0;
  private hashHi = 0;
  side = 1;
  stones = 0;

  // Transposition Table
  private ttKey = new Int32Array(TT_SIZE);
  private ttScore = new Int32Array(TT_SIZE);
  private ttMove = new Int16Array(TT_SIZE);
  private ttDepth = new Int8Array(TT_SIZE);
  private ttFlag = new Uint8Array(TT_SIZE);

  // Bộ đệm nước đi theo ply (tránh cấp phát trong vòng lặp nóng)
  private moveBuf: Int16Array[] = [];
  private scoreBuf: Float64Array[] = [];
  private genForced = false;
  private genMeFours = 0;
  private tacticalMove = -1;

  // Tham số tìm kiếm
  private limit = 12;
  private leafVcf = false;
  private leafVcfDepth = 6;
  private deadline = 0;
  private canAbort = false;
  private aborted = false;
  nodes = 0;
  private ttHits = 0;
  private vcfNodes = 0;
  private vcfBudget = 0;
  private vcfFirst = -1;

  // ─────────── Khởi tạo ───────────

  private allocate(size: number): void {
    this.size = size;
    const N = size * size;
    this.N = N;
    this.board = new Int8Array(N);
    this.near = new Uint8Array(N);
    this.shapes = new Uint8Array(N * 8);
    this.flags = new Uint8Array(N * 2);
    this.ordVal = new Int32Array(N * 2);
    this.evalVal = new Int32Array(N * 2);
    this.lineIdx = new Int16Array(N * 4 * SLOTS);
    this.nearIdx = new Int16Array(N * 25);
    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const j = r * size + c;
        for (let d = 0; d < 4; d++) {
          for (let s = 0; s < SLOTS; s++) {
            const k = s < 5 ? s - 5 : s - 4;
            const rr = r + k * dirs[d][0];
            const cc = c + k * dirs[d][1];
            this.lineIdx[(j * 4 + d) * SLOTS + s] =
              rr >= 0 && rr < size && cc >= 0 && cc < size ? rr * size + cc : -1;
          }
        }
        let k = 0;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            this.nearIdx[j * 25 + k++] = rr >= 0 && rr < size && cc >= 0 && cc < size ? rr * size + cc : -1;
          }
        }
      }
    }
    const rnd = mulberry32(0xc0ffee ^ size);
    this.zobLo = new Int32Array(N * 2);
    this.zobHi = new Int32Array(N * 2);
    for (let i = 0; i < N * 2; i++) {
      this.zobLo[i] = rnd();
      this.zobHi[i] = rnd();
    }
    this.moveBuf = [];
    this.scoreBuf = [];
    for (let p = 0; p <= MAX_PLY; p++) {
      this.moveBuf.push(new Int16Array(N));
      this.scoreBuf.push(new Float64Array(N));
    }
    this.clearTT();
  }

  clearTT(): void {
    this.ttFlag.fill(0);
  }

  /** Nạp vị trí bàn cờ (board phẳng 0/1/2). */
  setup(size: number, rule: RuleMode, cells: ArrayLike<number>): void {
    if (size !== this.size) this.allocate(size);
    if (rule !== this.rule) {
      this.rule = rule;
      this.clearTT();
    }
    this.patterns = getPatternTable(rule);
    const N = this.N;
    this.board.fill(0);
    this.near.fill(0);
    this.hashLo = 0;
    this.hashHi = 0;
    this.stones = 0;
    for (let j = 0; j < N; j++) {
      const p = cells[j];
      if (p === 1 || p === 2) {
        this.board[j] = p;
        this.stones++;
        this.hashLo ^= this.zobLo[j * 2 + p - 1];
        this.hashHi ^= this.zobHi[j * 2 + p - 1];
        for (let k = 0; k < 25; k++) {
          const n = this.nearIdx[j * 25 + k];
          if (n >= 0) this.near[n]++;
        }
      }
    }
    this.side = this.stones % 2 === 0 ? 1 : 2;
    this.sumEval.fill(0);
    this.flags.fill(0);
    this.ordVal.fill(0);
    this.evalVal.fill(0);
    for (let j = 0; j < N; j++) {
      if (this.board[j] !== 0) continue;
      for (let d = 0; d < 4; d++) this.recomputeDir(j, d);
      this.aggregate(j);
    }
  }

  // ─────────── Cập nhật gia tăng ───────────

  private recomputeDir(j: number, d: number): void {
    const base = (j * 4 + d) * SLOTS;
    let kx = 0;
    let ko = 0;
    for (let s = 0; s < SLOTS; s++) {
      const n = this.lineIdx[base + s];
      const sh = 2 * s;
      if (n < 0) {
        kx |= C_WALL << sh;
        ko |= C_WALL << sh;
      } else {
        const v = this.board[n];
        if (v === 1) {
          kx |= C_MINE << sh;
          ko |= C_OPP << sh;
        } else if (v === 2) {
          kx |= C_OPP << sh;
          ko |= C_MINE << sh;
        }
      }
    }
    const o = (j * 4 + d) * 2;
    this.shapes[o] = this.patterns.get(kx);
    this.shapes[o + 1] = this.patterns.get(ko);
  }

  /** Tổng hợp 4 hướng của ô j => cờ hiệu đe doạ, điểm sắp xếp, điểm đánh giá. */
  private aggregate(j: number): void {
    for (let p = 0; p < 2; p++) {
      let n4 = 0;
      let open4 = 0;
      let open3 = 0;
      let five = false;
      let ord = 0;
      let ev = 0;
      for (let d = 0; d < 4; d++) {
        const s = this.shapes[(j * 4 + d) * 2 + p];
        ord += ORDER_W[s];
        ev += EVAL_W[s];
        if (s === S_FIVE) five = true;
        else if (s === S_OPEN_FOUR) {
          open4++;
          n4++;
        } else if (s === S_FOUR) n4++;
        else if (s === S_OPEN_THREE) open3++;
      }
      let fl = 0;
      if (five) fl |= F_FIVE | F_FOUR;
      if (n4 > 0) fl |= F_FOUR;
      if (open4 > 0 || n4 >= 2) {
        fl |= F_WIN;
        ord += 20000;
        ev += 600;
      } else if (n4 > 0 && open3 > 0) {
        fl |= F_43;
        ord += 8000;
        ev += 500;
      }
      if (open3 >= 2) {
        fl |= F_33;
        ord += 3000;
        ev += 250;
      }
      if (open3 > 0) fl |= F_THREE;
      const i = j * 2 + p;
      this.sumEval[p + 1] += ev - this.evalVal[i];
      this.evalVal[i] = ev;
      this.ordVal[i] = ord;
      this.flags[i] = fl;
    }
  }

  place(j: number, p: number): void {
    this.board[j] = p;
    this.stones++;
    this.side = 3 - p;
    this.hashLo ^= this.zobLo[j * 2 + p - 1];
    this.hashHi ^= this.zobHi[j * 2 + p - 1];
    const nb = j * 25;
    for (let k = 0; k < 25; k++) {
      const n = this.nearIdx[nb + k];
      if (n >= 0) this.near[n]++;
    }
    for (let q = 0; q < 2; q++) {
      const i = j * 2 + q;
      this.sumEval[q + 1] -= this.evalVal[i];
      this.evalVal[i] = 0;
      this.ordVal[i] = 0;
      this.flags[i] = 0;
    }
    this.updateNeighbors(j);
  }

  remove(j: number): void {
    const p = this.board[j];
    this.board[j] = 0;
    this.stones--;
    this.side = p;
    this.hashLo ^= this.zobLo[j * 2 + p - 1];
    this.hashHi ^= this.zobHi[j * 2 + p - 1];
    const nb = j * 25;
    for (let k = 0; k < 25; k++) {
      const n = this.nearIdx[nb + k];
      if (n >= 0) this.near[n]--;
    }
    for (let d = 0; d < 4; d++) this.recomputeDir(j, d);
    this.aggregate(j);
    this.updateNeighbors(j);
  }

  private updateNeighbors(j: number): void {
    for (let d = 0; d < 4; d++) {
      const base = (j * 4 + d) * SLOTS;
      for (let s = 0; s < SLOTS; s++) {
        const n = this.lineIdx[base + s];
        if (n >= 0 && this.board[n] === 0) {
          this.recomputeDir(n, d);
          this.aggregate(n);
        }
      }
    }
  }

  /** Đánh giá tĩnh theo góc nhìn bên đang đi (ưu tiên nhẹ cho bên cầm quyền chủ động). */
  evaluate(): number {
    const me = this.side;
    const op = 3 - me;
    return ((this.sumEval[me] * 23 - this.sumEval[op] * 20) / 20) | 0;
  }

  // ─────────── Sinh nước đi ứng viên ───────────

  /**
   * Sinh nước đi cho nút ở `ply`.
   * full=false: chỉ phân tích chiến thuật (dùng ở nút lá).
   * Trả về số nước trong moveBuf[ply] hoặc mã GEN_* (tacticalMove chứa nước tương ứng).
   */
  private generate(ply: number, full: boolean, limit: number): number {
    const me = this.side;
    const op = 3 - me;
    const mi = me - 1;
    const oi = op - 1;
    const board = this.board;
    const near = this.near;
    const flags = this.flags;
    const buf = this.moveBuf[ply];
    const scores = this.scoreBuf[ply];
    const N = this.N;
    let opFive = -1;
    let opFiveCount = 0;
    let meWin = -1;
    let opWin = false;
    let meFours = 0;
    this.genForced = false;

    for (let j = 0; j < N; j++) {
      if (board[j] !== 0 || near[j] === 0) continue;
      const fm = flags[j * 2 + mi];
      if (fm & F_FIVE) {
        this.tacticalMove = j;
        return GEN_WIN_NOW;
      }
      const fo = flags[j * 2 + oi];
      if (fo & F_FIVE) {
        if (opFive !== j) opFiveCount++;
        opFive = j;
      }
      if (fm & F_WIN) meWin = j;
      if (fm & F_FOUR) meFours++;
      if (fo & F_WIN) opWin = true;
    }
    this.genMeFours = meFours;

    if (opFiveCount >= 2) {
      this.tacticalMove = opFive;
      return GEN_LOSS;
    }
    if (opFiveCount === 1) {
      buf[0] = opFive;
      this.genForced = true;
      return 1;
    }
    if (meWin >= 0) {
      this.tacticalMove = meWin;
      return GEN_WIN_SOON;
    }
    if (!full) return 0;

    const center = (this.size - 1) / 2;
    const size = this.size;
    let n = 0;
    const cap = opWin ? N : limit;
    for (let j = 0; j < N; j++) {
      if (board[j] !== 0 || near[j] === 0) continue;
      const fm = flags[j * 2 + mi];
      const fo = flags[j * 2 + oi];
      // Đối thủ có 3 mở / 4-4 tiềm năng: chỉ xét nước chặn (ô tạo 4 của đối thủ) + phản tứ.
      if (opWin && !(fo & F_FOUR) && !(fm & F_FOUR)) continue;
      const r = (j / size) | 0;
      const c = j - r * size;
      const sc =
        this.ordVal[j * 2 + mi] * 1.0 +
        this.ordVal[j * 2 + oi] * 0.85 +
        (fm & F_FOUR ? 30 : 0) -
        (Math.abs(r - center) + Math.abs(c - center)) * 0.01;
      // Chèn vào danh sách đã sắp xếp giảm dần, giữ tối đa `cap` phần tử.
      if (n < cap) {
        let k = n++;
        while (k > 0 && scores[k - 1] < sc) {
          scores[k] = scores[k - 1];
          buf[k] = buf[k - 1];
          k--;
        }
        scores[k] = sc;
        buf[k] = j;
      } else if (sc > scores[n - 1]) {
        let k = n - 1;
        while (k > 0 && scores[k - 1] < sc) {
          scores[k] = scores[k - 1];
          buf[k] = buf[k - 1];
          k--;
        }
        scores[k] = sc;
        buf[k] = j;
      }
    }
    if (opWin && n > 24) n = 24;
    return n;
  }

  // ─────────── Negamax + Alpha-Beta + TT ───────────

  private negamax(depth: number, alpha: number, beta: number, ply: number): number {
    this.nodes++;
    if ((this.nodes & 1023) === 0 && this.canAbort && performance.now() > this.deadline) {
      this.aborted = true;
    }
    if (this.aborted) return 0;
    if (this.stones >= this.N) return 0;

    const alphaOrig = alpha;
    const ti = this.hashLo & TT_MASK;
    let ttMove = -1;
    if (this.ttFlag[ti] !== 0 && this.ttKey[ti] === this.hashHi) {
      ttMove = this.ttMove[ti];
      if (depth > 0 && this.ttDepth[ti] >= depth) {
        let s = this.ttScore[ti];
        if (s > WIN_TH) s -= ply;
        else if (s < -WIN_TH) s += ply;
        const f = this.ttFlag[ti];
        if (f === TT_EXACT || (f === TT_LOWER && s >= beta) || (f === TT_UPPER && s <= alpha)) {
          this.ttHits++;
          return s;
        }
      }
    }

    const n = this.generate(ply, depth > 0 && ply < MAX_PLY - 1, this.limit);
    if (n === GEN_WIN_NOW) return WIN - ply;
    if (n === GEN_LOSS) return -(WIN - ply - 1);
    if (n === GEN_WIN_SOON) return WIN - ply - 2;
    const forced = this.genForced;
    if (!forced && (depth <= 0 || ply >= MAX_PLY - 1)) return this.leaf(ply);
    if (forced && ply >= MAX_PLY - 1) return this.evaluate();
    if (n === 0) return this.evaluate();

    const buf = this.moveBuf[ply];
    if (ttMove >= 0 && !forced) {
      for (let i = 1; i < n; i++) {
        if (buf[i] === ttMove) {
          buf[i] = buf[0];
          buf[0] = ttMove;
          break;
        }
      }
    }

    const me = this.side;
    // Nước chặn bắt buộc không tốn độ sâu (extension) => nhìn xuyên chuỗi tứ.
    const childDepth = forced ? depth : depth - 1;
    let best = -INF;
    let bestMove = -1;
    for (let i = 0; i < n; i++) {
      const m = buf[i];
      this.place(m, me);
      const score = -this.negamax(childDepth, -beta, -alpha, ply + 1);
      this.remove(m);
      if (this.aborted) return 0;
      if (score > best) {
        best = score;
        bestMove = m;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) break;
        }
      }
    }

    if (depth > 0) {
      let stored = best;
      if (stored > WIN_TH) stored += ply;
      else if (stored < -WIN_TH) stored -= ply;
      this.ttKey[ti] = this.hashHi;
      this.ttScore[ti] = stored;
      this.ttMove[ti] = bestMove;
      this.ttDepth[ti] = depth;
      this.ttFlag[ti] = best <= alphaOrig ? TT_UPPER : best >= beta ? TT_LOWER : TT_EXACT;
    }
    return best;
  }

  /** Nút lá: Quiescence theo đe doạ — thử VCF ngắn trước khi đánh giá tĩnh. */
  private leaf(ply: number): number {
    if (this.leafVcf && this.genMeFours > 0) {
      this.vcfNodes = 0;
      this.vcfBudget = 250;
      if (this.vcf(this.side, this.leafVcfDepth, false)) return WIN - ply - 20;
    }
    return this.evaluate();
  }

  // ─────────── Threat-Space Search: VCF (Victory by Continuous Fours) ───────────

  /**
   * Bên `a` (đang tới lượt) có thể thắng bằng chuỗi nước tứ liên tiếp hay không.
   * Mỗi nước tứ buộc đối thủ chặn đúng 1 ô => không gian tìm kiếm rất hẹp.
   */
  vcf(a: number, depth: number, record: boolean): boolean {
    this.nodes++;
    if (++this.vcfNodes > this.vcfBudget) return false;
    const d = 3 - a;
    const ai = a - 1;
    const di = d - 1;
    const N = this.N;
    const board = this.board;
    const near = this.near;
    const flags = this.flags;

    let dFive = -1;
    let dFiveCount = 0;
    let aWin = -1;
    for (let j = 0; j < N; j++) {
      if (board[j] !== 0 || near[j] === 0) continue;
      const fa = flags[j * 2 + ai];
      if (fa & F_FIVE) {
        if (record) this.vcfFirst = j;
        return true;
      }
      if (flags[j * 2 + di] & F_FIVE) {
        dFiveCount++;
        dFive = j;
      }
      if (fa & F_WIN) aWin = j;
    }
    if (dFiveCount >= 2) return false;
    if (dFiveCount === 0 && aWin >= 0) {
      if (record) this.vcfFirst = aWin;
      return true;
    }
    if (depth <= 0) return false;

    // Danh sách nước tứ: ưu tiên 4-3, 4-4.
    const attacks: number[] = [];
    if (dFiveCount === 1) {
      // Bị đối thủ tứ: chỉ tiếp tục nếu nước chặn cũng là một nước tứ của mình.
      if (!(flags[dFive * 2 + ai] & F_FOUR)) return false;
      attacks.push(dFive);
    } else {
      const strong: number[] = [];
      for (let j = 0; j < N; j++) {
        if (board[j] !== 0 || near[j] === 0) continue;
        const fa = flags[j * 2 + ai];
        if (!(fa & F_FOUR)) continue;
        if (fa & (F_43 | F_THREE)) strong.push(j);
        else attacks.push(j);
      }
      attacks.unshift(...strong);
    }

    for (let i = 0; i < attacks.length; i++) {
      const c = attacks[i];
      this.place(c, a);
      const block = this.findFivePoint(c, a);
      let win = false;
      if (block < 0) {
        // Không có điểm 5 (ví dụ nước chặn không phải tứ) — bỏ qua.
        win = false;
      } else if (this.countFivePoints(c, a) >= 2) {
        win = true; // tứ kép
      } else {
        this.place(block, d);
        win = this.vcf(a, depth - 1, false);
        this.remove(block);
      }
      this.remove(c);
      if (win) {
        if (record) this.vcfFirst = c;
        return true;
      }
      if (this.vcfNodes > this.vcfBudget) return false;
    }
    return false;
  }

  /** Tìm ô thành 5 của `a` trên 4 đường đi qua ô `c` (bán kính 4). */
  private findFivePoint(c: number, a: number): number {
    for (let d = 0; d < 4; d++) {
      const base = (c * 4 + d) * SLOTS;
      for (let s = 1; s < SLOTS - 1; s++) {
        const n = this.lineIdx[base + s];
        if (n >= 0 && this.board[n] === 0 && this.flags[n * 2 + a - 1] & F_FIVE) return n;
      }
    }
    return -1;
  }

  private countFivePoints(c: number, a: number): number {
    let count = 0;
    for (let d = 0; d < 4; d++) {
      const base = (c * 4 + d) * SLOTS;
      for (let s = 1; s < SLOTS - 1; s++) {
        const n = this.lineIdx[base + s];
        if (n >= 0 && this.board[n] === 0 && this.flags[n * 2 + a - 1] & F_FIVE) count++;
      }
    }
    return count;
  }

  /** Kiểm tra VCF cho bên `a` tại vị trí hiện tại (bên `a` phải đang tới lượt). */
  hasVcf(a: number, depth: number, budget: number): boolean {
    this.vcfNodes = 0;
    this.vcfBudget = budget;
    this.vcfFirst = -1;
    return this.vcf(a, depth, true);
  }

  get lastVcfMove(): number {
    return this.vcfFirst;
  }

  // ─────────── Tìm kiếm ở gốc ───────────

  search(req: AiSearchRequest, onProgress?: ProgressCallback): SearchResult {
    const t0 = performance.now();
    const cfg: AiLevelConfig = req.config;
    this.setup(req.size, req.rule, req.board);
    this.nodes = 0;
    this.ttHits = 0;
    this.aborted = false;
    this.canAbort = false;
    this.limit = cfg.candidateLimit;
    this.leafVcf = cfg.leafVcf;
    this.leafVcfDepth = Math.min(6, Math.max(2, cfg.vcfDepth >> 1));
    this.deadline = t0 + cfg.timeMs;

    const me = this.side;
    const op = 3 - me;
    const toCoord = (m: number) => (m >= 0 ? { row: (m / this.size) | 0, col: m % this.size } : null);
    const makeStats = (depth: number, score: number, reason: string, move: number, candidates: number): AiSearchStats => ({
      depth,
      nodes: this.nodes,
      timeMs: Math.round(performance.now() - t0),
      score,
      candidates,
      ttHits: this.ttHits,
      reason,
      bestMove: toCoord(move),
    });
    const done = (move: number, depth: number, score: number, reason: string, candidates: number): SearchResult => ({
      move,
      stats: makeStats(depth, score, reason, move, candidates),
    });

    // Khai cuộc: bàn trống => Thiên nguyên.
    if (this.stones === 0) {
      const c = (this.size - 1) >> 1;
      return done(c * this.size + c, 0, 0, 'Khai cuộc: Thiên nguyên', 1);
    }

    // 1. Phân tích chiến thuật bắt buộc ở gốc.
    const n = this.generate(0, true, cfg.candidateLimit + 4);
    if (n === GEN_WIN_NOW) return done(this.tacticalMove, 0, WIN, 'Đánh nước thắng (5 quân)', 1);
    if (n === GEN_WIN_SOON) return done(this.tacticalMove, 0, WIN - 2, 'Tạo 4 mở / tứ kép — thắng chắc', 1);
    if (n === GEN_LOSS) return done(this.tacticalMove, 0, -WIN, 'Đối thủ có tứ kép — chặn tạm', 1);
    if (n === 1 && this.genForced) {
      return done(this.moveBuf[0][0], 0, this.evaluate(), 'Chặn bắt buộc thế 4 của đối thủ', 1);
    }
    if (n === 0) {
      const c = (this.size - 1) >> 1;
      return done(c * this.size + c, 0, 0, 'Không có ứng viên', 0);
    }

    // 2. Threat-Space Search: AI có chuỗi tứ liên hoàn thắng?
    if (cfg.rootVcf && this.hasVcf(me, cfg.vcfDepth, 30000) && this.vcfFirst >= 0) {
      return done(this.vcfFirst, 0, WIN - 30, 'VCF: chuỗi tứ liên hoàn thắng cưỡng bức', n);
    }

    const rootMoves = Array.from(this.moveBuf[0].subarray(0, n));
    const rootScores = new Array<number>(n).fill(-INF);
    let bestMove = rootMoves[0];
    let bestScore = -INF;
    let completedDepth = 0;

    // 3. Iterative Deepening Negamax.
    for (let depth = 1; depth <= cfg.maxDepth; depth++) {
      this.canAbort = depth > 1;
      let alpha = -INF;
      let iterBest = -1;
      let iterScore = -INF;
      const scores = new Array<number>(rootMoves.length).fill(-INF);
      for (let i = 0; i < rootMoves.length; i++) {
        const m = rootMoves[i];
        this.place(m, me);
        const s = -this.negamax(depth - 1, -INF, -alpha, 1);
        this.remove(m);
        if (this.aborted) break;
        scores[i] = s;
        if (s > iterScore) {
          iterScore = s;
          iterBest = m;
        }
        if (s > alpha) alpha = s;
      }
      if (this.aborted) break;

      completedDepth = depth;
      bestMove = iterBest;
      bestScore = iterScore;
      // Sắp xếp lại nước ở gốc theo điểm vòng trước (ổn định).
      const order = rootMoves.map((m, i) => ({ m, s: scores[i], i }));
      order.sort((x, y) => y.s - x.s || x.i - y.i);
      for (let i = 0; i < order.length; i++) {
        rootMoves[i] = order[i].m;
        rootScores[i] = order[i].s;
      }
      onProgress?.(makeStats(depth, bestScore, `Đang tìm ở độ sâu ${depth}`, bestMove, n));

      if (bestScore > WIN_TH) break; // đã thấy đường thắng
      if (rootScores.every((s) => s < -WIN_TH)) break; // thua mọi nhánh — giữ nước cầm cự lâu nhất
      if (performance.now() - t0 > cfg.timeMs * 0.45) break; // không đủ thời gian cho vòng tiếp
    }

    let reason = `Negamax α-β độ sâu ${completedDepth}`;

    // 4. Chống bẫy: đối thủ có VCF sau nước đi của AI? => chọn nước khác an toàn.
    if (cfg.trapCheck && bestScore < WIN_TH) {
      const checkCount = Math.min(rootMoves.length, 8);
      const savedNodes = this.nodes;
      let chosen = -1;
      for (let i = 0; i < checkCount; i++) {
        const m = rootMoves[i];
        if (rootScores[i] < -WIN_TH && i > 0) continue;
        this.place(m, me);
        const danger = this.hasVcf(op, cfg.vcfDepth, 6000);
        this.remove(m);
        if (!danger) {
          chosen = m;
          if (i > 0) reason += ' · né bẫy VCF của đối thủ';
          break;
        }
      }
      if (chosen >= 0) bestMove = chosen;
      else reason += ' · đối thủ có đòn ép tứ';
      this.nodes = Math.max(this.nodes, savedNodes);
    }

    // 5. Mức dễ: thỉnh thoảng chọn nước gần-tốt-nhất cho tự nhiên.
    if (cfg.randomness > 0 && Math.abs(bestScore) < WIN_TH && Math.random() < cfg.randomness) {
      const pool: number[] = [];
      for (let i = 0; i < rootMoves.length && pool.length < 4; i++) {
        if (rootScores[i] > -WIN_TH && rootScores[i] >= bestScore - 250) pool.push(rootMoves[i]);
      }
      if (pool.length > 1) {
        bestMove = pool[Math.floor(Math.random() * pool.length)];
        reason += ' · ngẫu nhiên hoá';
      }
    }

    if (bestScore > WIN_TH) reason = `Thấy đường thắng cưỡng bức (độ sâu ${completedDepth})`;
    else if (bestScore < -WIN_TH) reason = `Thế cờ bất lợi — cầm cự tối đa (độ sâu ${completedDepth})`;

    return done(bestMove, completedDepth, bestScore, reason, n);
  }
}

// ───────────────────────────── Worker glue ─────────────────────────────

interface WorkerScope {
  postMessage(message: AiWorkerResponse): void;
  onmessage: ((event: MessageEvent<AiWorkerRequest>) => void) | null;
}

// Chỉ gắn handler khi thực sự chạy trong DedicatedWorkerGlobalScope (cho phép import engine để test bằng Node).
const scope: WorkerScope | undefined =
  typeof self !== 'undefined' && typeof window === 'undefined' && typeof (self as unknown as WorkerScope).postMessage === 'function'
    ? (self as unknown as WorkerScope)
    : undefined;

if (scope) {
  const engine = new CaroEngine();
  scope.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
    const msg = event.data;
    if (msg.type === 'reset') {
      engine.clearTT();
      return;
    }
    if (msg.type === 'search') {
      try {
        const result = engine.search(msg, (stats) => {
          scope!.postMessage({ type: 'progress', requestId: msg.requestId, stats });
        });
        scope!.postMessage({
          type: 'result',
          requestId: msg.requestId,
          move: { row: (result.move / msg.size) | 0, col: result.move % msg.size },
          stats: result.stats,
        });
      } catch (err) {
        scope!.postMessage({
          type: 'error',
          requestId: msg.requestId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };
}
