/**
 * src/components/ScoreBoard.tsx
 * Bảng trạng thái: lượt đi, kết quả, người chơi, phân tích AI (độ sâu, node, thời gian,
 * tốc độ, đánh giá thế cờ) và thống kê thắng/thua.
 */
import { useEffect, useState } from 'react';
import { AI_LEVELS, AI_WIN_SCORE, AI_WIN_THRESHOLD } from '../types/caro';
import type { AiLevel, AiSearchStats, GameStatus, PieceStyle, Player, RuleMode, WinInfo } from '../types/caro';
import { formatCoord } from '../utils/caroRules';
import type { Tally } from '../hooks/useCaroGame';
import { PieceIcon, playerName } from './Pieces';

interface ScoreBoardProps {
  status: GameStatus;
  win: WinInfo | null;
  humanPlayer: Player;
  aiPlayer: Player;
  currentPlayer: Player;
  thinking: boolean;
  thinkStartedAt: number | null;
  stats: AiSearchStats | null;
  aiError: string | null;
  level: AiLevel;
  rule: RuleMode;
  size: number;
  moveCount: number;
  pieceStyle: PieceStyle;
  tally: Tally;
  onResetTally: () => void;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('vi-VN');
}

function useLiveElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (startedAt === null) return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 80) {
        last = t;
        setNow(performance.now());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}

function describeScore(score: number): { text: string; ratio: number; tone: string } {
  if (score > AI_WIN_THRESHOLD) {
    const plies = Math.max(1, AI_WIN_SCORE - score);
    return { text: `AI thấy đường thắng (~${Math.ceil(plies / 2)} nước)`, ratio: 1, tone: 'text-rose-400' };
  }
  if (score < -AI_WIN_THRESHOLD) {
    return { text: 'AI đánh giá: bạn đang có đòn thắng!', ratio: -1, tone: 'text-emerald-400' };
  }
  const ratio = Math.tanh(score / 2500);
  const text =
    Math.abs(ratio) < 0.12 ? 'Thế cờ cân bằng' : ratio > 0 ? (ratio > 0.6 ? 'AI ưu thế lớn' : 'AI nhỉnh hơn') : ratio < -0.6 ? 'Bạn ưu thế lớn' : 'Bạn nhỉnh hơn';
  return { text, ratio, tone: ratio > 0.12 ? 'text-rose-300' : ratio < -0.12 ? 'text-emerald-300' : 'text-slate-300' };
}

export function ScoreBoard(props: ScoreBoardProps) {
  const { status, win, humanPlayer, aiPlayer, currentPlayer, thinking, thinkStartedAt, stats, aiError, level, rule, size, moveCount, pieceStyle, tally, onResetTally } = props;
  const elapsed = useLiveElapsed(thinking ? thinkStartedAt : null);
  const cfg = AI_LEVELS[level];

  let banner: { text: string; cls: string };
  if (status === 'won') {
    banner = win?.winner === humanPlayer
      ? { text: '🎉 Bạn đã chiến thắng!', cls: 'from-emerald-500 to-teal-500' }
      : { text: '🤖 AI chiến thắng!', cls: 'from-rose-500 to-orange-500' };
  } else if (status === 'draw') {
    banner = { text: '🤝 Ván cờ hoà', cls: 'from-slate-500 to-slate-600' };
  } else if (thinking) {
    banner = { text: 'AI đang suy nghĩ…', cls: 'from-indigo-500 to-violet-500' };
  } else {
    banner = { text: currentPlayer === humanPlayer ? 'Lượt của bạn' : 'Lượt của AI', cls: 'from-sky-500 to-blue-600' };
  }

  const score = stats ? describeScore(stats.score) : null;
  const timeMs = thinking ? Math.max(elapsed, stats?.timeMs ?? 0) : (stats?.timeMs ?? 0);
  const nps = stats && stats.timeMs > 0 ? Math.round((stats.nodes / stats.timeMs) * 1000) : 0;

  const playerCardProps = { status, currentPlayer, pieceStyle, levelLabel: cfg.label };

  return (
    <section className="panel space-y-4">
      <div className={`rounded-xl bg-gradient-to-r ${banner.cls} px-4 py-3 text-center text-base font-bold text-white shadow-lg ${thinking ? 'animate-pulse' : ''}`}>
        {banner.text}
      </div>

      <div className="flex gap-2">
        <PlayerCard who="human" player={humanPlayer} {...playerCardProps} />
        <PlayerCard who="ai" player={aiPlayer} {...playerCardProps} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="stat-chip">
          <div className="stat-label">Luật</div>
          <div className="stat-value">{rule === 'freestyle' ? 'Tự do' : 'Chặn 2 đầu'}</div>
        </div>
        <div className="stat-chip">
          <div className="stat-label">Bàn cờ</div>
          <div className="stat-value">{size}×{size}</div>
        </div>
        <div className="stat-chip">
          <div className="stat-label">Số nước</div>
          <div className="stat-value">{moveCount}</div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Phân tích AI</h3>
          <span className="rounded-md bg-violet-500/20 px-2 py-0.5 text-[11px] font-medium text-violet-200">{cfg.description}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Metric label="Thời gian suy nghĩ" value={`${(timeMs / 1000).toFixed(2)} s`} live={thinking} />
          <Metric label="Số node đã duyệt" value={stats ? formatNumber(stats.nodes) : '—'} live={thinking} />
          <Metric label="Độ sâu đạt được" value={stats ? `${stats.depth} / ${cfg.maxDepth}` : '—'} />
          <Metric label="Tốc độ" value={nps ? `${formatNumber(nps)} n/s` : '—'} />
          <Metric label="Ứng viên ở gốc" value={stats ? String(stats.candidates) : '—'} />
          <Metric label="TT hits" value={stats ? formatNumber(stats.ttHits) : '—'} />
        </div>

        {score && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px] text-slate-400">
              <span>Bạn</span>
              <span className={`font-semibold ${score.tone}`}>{score.text}</span>
              <span>AI</span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-emerald-500/30">
              <div
                className="absolute inset-y-0 right-0 bg-gradient-to-l from-rose-500 to-rose-400 transition-all duration-500"
                style={{ width: `${((score.ratio + 1) / 2) * 100}%` }}
              />
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/60" />
            </div>
          </div>
        )}

        {stats && (
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            <span className="text-slate-300">Quyết định:</span> {stats.reason}
            {stats.bestMove && (
              <>
                {' '}· nước <span className="font-mono text-sky-300">{formatCoord(stats.bestMove, size)}</span>
              </>
            )}
          </p>
        )}
        {aiError && <p className="mt-2 text-xs text-rose-400">Lỗi AI: {aiError}</p>}
      </div>

      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-3 gap-2 text-center">
          <div className="stat-chip">
            <div className="stat-label">Thắng</div>
            <div className="stat-value text-emerald-300">{tally.wins}</div>
          </div>
          <div className="stat-chip">
            <div className="stat-label">Thua</div>
            <div className="stat-value text-rose-300">{tally.losses}</div>
          </div>
          <div className="stat-chip">
            <div className="stat-label">Hoà</div>
            <div className="stat-value text-slate-200">{tally.draws}</div>
          </div>
        </div>
        <button type="button" onClick={onResetTally} className="btn-ghost h-full px-2 text-[11px]" title="Xoá thống kê">
          ↺
        </button>
      </div>
    </section>
  );
}

interface PlayerCardProps {
  who: 'human' | 'ai';
  player: Player;
  status: GameStatus;
  currentPlayer: Player;
  pieceStyle: PieceStyle;
}

function PlayerCard({ who, player, status, currentPlayer, pieceStyle }: PlayerCardProps) {
  const active = status === 'playing' && currentPlayer === player;
  return (
    <div
      className={`flex flex-1 items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-300 ${
        active ? 'border-sky-400/70 bg-sky-400/10 shadow-[0_0_0_3px_rgba(56,189,248,0.15)]' : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <div className={active ? 'piece-bob' : ''}>
        <PieceIcon player={player} style={pieceStyle} size={34} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">{who === 'human' ? 'Bạn' : 'Máy (AI)'}</div>
        <div className="truncate text-xs text-slate-400">
          Quân {playerName(player)} · {player === 1 ? 'đi trước' : 'đi sau'}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, live }: { label: string; value: string; live?: boolean }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-mono text-sm font-semibold tabular-nums ${live ? 'text-sky-300' : 'text-slate-100'}`}>{value}</div>
    </div>
  );
}
