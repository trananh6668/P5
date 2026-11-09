/**
 * src/utils/caroRules.ts
 * Luật chơi: kiểm tra thắng / hoà theo luật Tự do (Freestyle) và Chặn 2 đầu (Caro VN).
 */
import type { Cell, Coord, Player, RuleMode, WinInfo } from '../types/caro';

/** 4 hướng: ngang, dọc, chéo chính, chéo phụ. */
export const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

export function createEmptyBoard(size: number): Cell[] {
  return new Array<Cell>(size * size).fill(0);
}

export function toIndex(row: number, col: number, size: number): number {
  return row * size + col;
}

export function inBounds(row: number, col: number, size: number): boolean {
  return row >= 0 && row < size && col >= 0 && col < size;
}

export function opponentOf(player: Player): Player {
  return player === 1 ? 2 : 1;
}

/** X luôn đi trước: số quân chẵn => tới lượt X. */
export function playerToMove(moveCount: number): Player {
  return moveCount % 2 === 0 ? 1 : 2;
}

/**
 * Kiểm tra quân vừa đặt tại (row, col) có tạo đường thắng hay không.
 *
 * - freestyle: chuỗi liên tiếp >= 5 là thắng.
 * - standard : chuỗi liên tiếp >= 5, và KHÔNG bị quân đối phương chặn ở cả hai đầu.
 *              (Ô ngoài bàn cờ không được tính là quân chặn.)
 */
export function checkWinAt(
  board: ArrayLike<number>,
  size: number,
  row: number,
  col: number,
  rule: RuleMode,
): WinInfo | null {
  const player = board[toIndex(row, col, size)] as Cell;
  if (player === 0) return null;
  const opp = opponentOf(player);

  for (const [dr, dc] of DIRECTIONS) {
    const backward: Coord[] = [];
    const forward: Coord[] = [];

    let r = row - dr;
    let c = col - dc;
    while (inBounds(r, c, size) && board[toIndex(r, c, size)] === player) {
      backward.push({ row: r, col: c });
      r -= dr;
      c -= dc;
    }
    const endA = inBounds(r, c, size) ? board[toIndex(r, c, size)] : -1;

    r = row + dr;
    c = col + dc;
    while (inBounds(r, c, size) && board[toIndex(r, c, size)] === player) {
      forward.push({ row: r, col: c });
      r += dr;
      c += dc;
    }
    const endB = inBounds(r, c, size) ? board[toIndex(r, c, size)] : -1;

    const length = backward.length + 1 + forward.length;
    if (length < 5) continue;
    if (rule === 'standard' && endA === opp && endB === opp) continue; // bị chặn 2 đầu

    return {
      winner: player,
      line: [...backward.reverse(), { row, col }, ...forward],
    };
  }
  return null;
}

/** Quét toàn bàn (dùng khi khôi phục trạng thái). */
export function findWinner(board: ArrayLike<number>, size: number, rule: RuleMode): WinInfo | null {
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (board[toIndex(row, col, size)] !== 0) {
        const win = checkWinAt(board, size, row, col, rule);
        if (win) return win;
      }
    }
  }
  return null;
}

export function isBoardFull(board: ArrayLike<number>): boolean {
  for (let i = 0; i < board.length; i++) if (board[i] === 0) return false;
  return true;
}

/** Điểm sao (Hoshi) và Thiên nguyên (Tengen) cho bàn 15x15 / 19x19. */
export function getStarPoints(size: number): Coord[] {
  const center = Math.floor(size / 2);
  const edge = size >= 19 ? 3 : 3;
  const far = size - 1 - edge;
  const points: Coord[] = [
    { row: edge, col: edge },
    { row: edge, col: far },
    { row: far, col: edge },
    { row: far, col: far },
    { row: center, col: center },
  ];
  if (size >= 19) {
    points.push(
      { row: edge, col: center },
      { row: center, col: edge },
      { row: center, col: far },
      { row: far, col: center },
    );
  }
  return points;
}

/** Nhãn cột A, B, C... (bỏ qua chữ I theo quy ước cờ vây). */
export function columnLabel(col: number): string {
  const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
  return letters[col] ?? String(col + 1);
}

export function formatCoord(coord: Coord, size: number): string {
  return `${columnLabel(coord.col)}${size - coord.row}`;
}
