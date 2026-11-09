/** Self-play nhanh: 19x19 + luật chặn 2 đầu, kiểm tra không lỗi & kết quả thắng hợp lệ theo caroRules. */
import { CaroEngine } from '../src/workers/caroAi.worker.ts';
import { checkWinAt } from '../src/utils/caroRules.ts';
import type { AiLevelConfig, RuleMode } from '../src/types/caro.ts';

const cfg: AiLevelConfig = { id: 'hard', label: '', description: '', maxDepth: 6, timeMs: 800, candidateLimit: 12, rootVcf: true, leafVcf: true, vcfDepth: 10, trapCheck: true, randomness: 0 };
const engine = new CaroEngine();

for (const [size, rule] of [[19, 'standard'], [15, 'standard'], [19, 'freestyle']] as [15 | 19, RuleMode][]) {
  const board = new Array(size * size).fill(0);
  let result = 'chưa phân thắng bại';
  let moves = 0;
  for (; moves < 120; moves++) {
    const p = moves % 2 === 0 ? 1 : 2;
    const res = engine.search({ type: 'search', requestId: 1, size, rule, board, aiPlayer: p, config: cfg });
    if (board[res.move] !== 0) throw new Error(`Nước đi không hợp lệ ${res.move}`);
    board[res.move] = p;
    const win = checkWinAt(board, size, Math.floor(res.move / size), res.move % size, rule);
    if (win) {
      result = `${p === 1 ? 'X' : 'O'} thắng (đường ${win.line.length} quân)`;
      moves++;
      break;
    }
  }
  console.log(`${size}x${size} ${rule}: ${moves} nước — ${result}`);
}
