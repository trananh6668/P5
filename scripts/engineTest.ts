/**
 * scripts/engineTest.ts — kiểm thử engine AI trực tiếp bằng Node (node >= 22.6, type stripping).
 * Chạy: npm run test:engine
 */
import { CaroEngine } from '../src/workers/caroAi.worker.ts';
import type { AiLevelConfig, AiSearchRequest, RuleMode } from '../src/types/caro.ts';

const LEVELS: Record<string, AiLevelConfig> = {
  medium: { id: 'medium', label: '', description: '', maxDepth: 4, timeMs: 1500, candidateLimit: 12, rootVcf: false, leafVcf: false, vcfDepth: 0, trapCheck: false, randomness: 0 },
  hard: { id: 'hard', label: '', description: '', maxDepth: 6, timeMs: 3000, candidateLimit: 12, rootVcf: true, leafVcf: false, vcfDepth: 10, trapCheck: true, randomness: 0 },
  master: { id: 'master', label: '', description: '', maxDepth: 8, timeMs: 6000, candidateLimit: 15, rootVcf: true, leafVcf: true, vcfDepth: 16, trapCheck: true, randomness: 0 },
};

/** Sơ đồ: 'X','O','.' — đặt ở góc trên-trái được dịch tới (offR, offC) trên bàn 15x15. */
function boardFrom(rows: string[], size = 15, offR = 4, offC = 4): number[] {
  const b = new Array(size * size).fill(0);
  rows.forEach((line, r) => {
    [...line.replace(/\s+/g, '')].forEach((ch, c) => {
      const v = ch === 'X' ? 1 : ch === 'O' ? 2 : 0;
      if (v) b[(r + offR) * size + (c + offC)] = v;
    });
  });
  return b;
}

const engine = new CaroEngine();
let failures = 0;

function run(name: string, rows: string[], expect: (r: number, c: number) => boolean, level = 'medium', rule: RuleMode = 'freestyle') {
  const board = boardFrom(rows);
  const stones = board.filter((v) => v).length;
  const aiPlayer = stones % 2 === 0 ? 1 : 2;
  const req: AiSearchRequest = { type: 'search', requestId: 1, size: 15, rule, board, aiPlayer, config: LEVELS[level] };
  const res = engine.search(req);
  const r = Math.floor(res.move / 15) - 4;
  const c = (res.move % 15) - 4;
  const ok = expect(r, c);
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} -> (${r},${c})  depth=${res.stats.depth} nodes=${res.stats.nodes} t=${res.stats.timeMs}ms  [${res.stats.reason}]`,
  );
}

const at = (pairs: [number, number][]) => (r: number, c: number) => pairs.some(([a, b]) => a === r && b === c);

// X đi (số quân chẵn) — AI cầm X.
run('Thắng ngay khi có 4', [
  'XXXX.',
  'OOO..',
  'O....',
], at([[0, 4], [0, -1]]));

run('Chặn 4 của đối thủ', [
  '.OOOO.',
  'X.X...',
  '..X...',
  'X.....',
], (r, c) => (r === 0 && (c === 0 || c === 5)));

// AI cầm O (số quân lẻ), X có 3 mở ngang: phải chặn ở 2 đầu (hoặc đầu xa).
run('Chặn 3 mở', [
  '.......',
  '..XXX..',
  '...O...',
  '......O',
], at([[1, 1], [1, 5], [1, 0], [1, 6]]));

// X chuẩn bị tạo 3-3 tại (2,2) (dọc cột 2 + ngang hàng 2). AI (O) phải phá điểm then chốt.
run('Phòng thủ bẫy 3-3', [
  '..X...O',
  '..X....',
  'XX.....',
  '.......',
  '.......',
  '.......',
  'O.....O',
], at([[2, 2], [3, 2], [-1, 2], [2, 3], [2, -1]]), 'hard');

// X: hàng 0 "OXX.X" + cột 3 "X_XX" => (0,3) là điểm 4-3. AI (O) phải phá.
run('Phòng thủ bẫy 4-3', [
  'OXX.X..',
  '.......',
  '...X...',
  '...X...',
  '.O..O..',
  '..O....',
], at([[0, 3], [1, 3], [4, 3], [-1, 3], [0, 5]]), 'hard');

// AI (X) có VCF: tứ liên hoàn
run('Tìm VCF (Threat-Space Search)', [
  'O.......',
  '.XXX.O..',
  '..O.X...',
  '..O..X..',
  '...O....',
  '..O.....',
  'O.......',
], () => true, 'hard');

// OXXXX.O — Freestyle: O bắt buộc chặn (0,5). Luật chặn 2 đầu: X đặt (0,5) bị chặn 2 đầu => không cần chặn.
const blockedFive = ['OXXXX.O', '.O.....', '..O....', '...X...'];
run('Freestyle: phải chặn 4 kẹp giữa', blockedFive, at([[0, 5]]), 'medium', 'freestyle');
run('Chặn 2 đầu: 5 bị kẹp không phải đe doạ', blockedFive, (r, c) => !(r === 0 && c === 5), 'medium', 'standard');

// Self-play hiệu năng
for (const level of ['medium', 'hard', 'master']) {
  const size = 15;
  const board = new Array(size * size).fill(0);
  let winner = 0;
  let totalNodes = 0;
  let maxTime = 0;
  let moves = 0;
  const reasons = new Map<string, number>();
  for (; moves < 50 && !winner; moves++) {
    const aiPlayer = moves % 2 === 0 ? 1 : 2;
    const res = engine.search({ type: 'search', requestId: 1, size: 15, rule: 'freestyle', board, aiPlayer, config: LEVELS[level] });
    board[res.move] = aiPlayer;
    const key = res.stats.reason.replace(/\d+/g, '#');
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
    totalNodes += res.stats.nodes;
    maxTime = Math.max(maxTime, res.stats.timeMs);
    if (res.stats.score > 9_990_000 && res.stats.reason.includes('5 quân')) winner = aiPlayer;
  }
  console.log(`Self-play ${level}: ${moves} nước, winner=${winner || '-'}, nodes=${totalNodes}, maxTime=${maxTime}ms`);
  for (const [k, v] of reasons) console.log(`    ${v}x  ${k}`);
}

console.log(failures ? `\n${failures} test FAILED` : '\nAll tests passed');
process.exit(failures ? 1 : 0);
