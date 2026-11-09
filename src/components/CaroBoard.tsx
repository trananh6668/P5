/**
 * src/components/CaroBoard.tsx
 * Bàn cờ SVG: lưới sắc nét, điểm sao (Hoshi/Tengen), toạ độ, quân cờ 3D, highlight nước
 * cuối, số thứ tự nước đi, chỉ báo hover tại giao điểm, đường thắng phát sáng.
 * Các lớp tĩnh được memo hoá để hover chuột chỉ render lại lớp chỉ báo => giữ 60 FPS.
 */
import { memo, useCallback, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { BoardTheme, Cell, Move, PieceStyle, Player, WinInfo } from '../types/caro';
import { columnLabel, getStarPoints } from '../utils/caroRules';
import { Piece, PieceDefs } from './Pieces';

const CELL = 36;
const PAD = 34;
const STONE_R = CELL * 0.44;
const DEF = 'board';

interface ThemeSpec {
  frame: string;
  boardFrom: string;
  boardTo: string;
  line: string;
  star: string;
  label: string;
  grain: number;
}

const THEMES: Record<BoardTheme, ThemeSpec> = {
  wood: { frame: '#6b4219', boardFrom: '#f0c27b', boardTo: '#c98d45', line: '#4a2c0f', star: '#3b230b', label: '#5c3812', grain: 0.22 },
  dark: { frame: '#0b0d14', boardFrom: '#2a3042', boardTo: '#181c28', line: '#5f6a85', star: '#94a0bd', label: '#8390ad', grain: 0.06 },
  light: { frame: '#cbd2df', boardFrom: '#ffffff', boardTo: '#e9edf5', line: '#a5aec0', star: '#6b7487', label: '#7a8396', grain: 0.0 },
};

const pos = (i: number) => PAD + i * CELL;

export interface CaroBoardProps {
  size: number;
  board: Cell[];
  moves: Move[];
  lastMove: Move | null;
  win: WinInfo | null;
  showNumbers: boolean;
  theme: BoardTheme;
  pieceStyle: PieceStyle;
  /** Người chơi có thể đặt quân hay không (đúng lượt, AI không nghĩ, ván chưa kết thúc). */
  interactive: boolean;
  hoverPlayer: Player;
  thinking: boolean;
  onPlay: (row: number, col: number) => void;
}

// ─────────── Lớp lưới (tĩnh) ───────────

const GridLayer = memo(function GridLayer({ size, theme }: { size: number; theme: BoardTheme }) {
  const t = THEMES[theme];
  const end = pos(size - 1);
  const total = PAD * 2 + CELL * (size - 1);
  const stars = getStarPoints(size);
  const lines: string[] = [];
  for (let i = 0; i < size; i++) {
    lines.push(`M${PAD} ${pos(i)}H${end}`);
    lines.push(`M${pos(i)} ${PAD}V${end}`);
  }
  return (
    <g>
      <defs>
        <linearGradient id="board-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={t.boardFrom} />
          <stop offset="100%" stopColor={t.boardTo} />
        </linearGradient>
        <filter id="board-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.32" numOctaves="3" seed="7" result="noise" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.2  0 0 0 0 0.05  0 0 0 0.9 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <rect x={0} y={0} width={total} height={total} rx={14} fill="url(#board-bg)" />
      {t.grain > 0 && <rect x={0} y={0} width={total} height={total} rx={14} fill="#000" filter="url(#board-grain)" opacity={t.grain} />}
      <rect x={PAD} y={PAD} width={end - PAD} height={end - PAD} fill="none" stroke={t.line} strokeWidth={2} />
      <path d={lines.join('')} stroke={t.line} strokeWidth={1} shapeRendering="crispEdges" />
      {stars.map((s) => (
        <circle key={`${s.row}-${s.col}`} cx={pos(s.col)} cy={pos(s.row)} r={s.row === (size >> 1) && s.col === (size >> 1) ? 4.6 : 3.8} fill={t.star} />
      ))}
      {Array.from({ length: size }, (_, i) => (
        <g key={i} fill={t.label} fontSize={11} fontWeight={600} fontFamily="ui-sans-serif, system-ui" textAnchor="middle" style={{ userSelect: 'none' }}>
          <text x={pos(i)} y={PAD - 18}>{columnLabel(i)}</text>
          <text x={pos(i)} y={end + 26}>{columnLabel(i)}</text>
          <text x={PAD - 20} y={pos(i) + 4}>{size - i}</text>
          <text x={end + 20} y={pos(i) + 4}>{size - i}</text>
        </g>
      ))}
    </g>
  );
});

// ─────────── Lớp quân cờ ───────────

interface StonesProps {
  size: number;
  board: Cell[];
  moves: Move[];
  showNumbers: boolean;
  pieceStyle: PieceStyle;
  winSet: Set<number>;
}

const StonesLayer = memo(function StonesLayer({ size, board, moves, showNumbers, pieceStyle, winSet }: StonesProps) {
  const numbers = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of moves) map.set(m.row * size + m.col, m.number);
    return map;
  }, [moves, size]);

  const stones = [];
  for (let idx = 0; idx < board.length; idx++) {
    const p = board[idx];
    if (p === 0) continue;
    const row = Math.floor(idx / size);
    const col = idx % size;
    const cx = pos(col);
    const cy = pos(row);
    const num = numbers.get(idx);
    const isWin = winSet.has(idx);
    const textColor = pieceStyle === 'stone' ? (p === 1 ? '#f8fafc' : '#111827') : p === 1 ? '#1e3a8a' : '#7f1d1d';
    stones.push(
      <g key={idx} className="stone-enter" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        {isWin && <circle cx={cx} cy={cy} r={STONE_R + 4} className="win-glow" fill="none" stroke="#facc15" strokeWidth={3} />}
        <Piece prefix={DEF} player={p as Player} style={pieceStyle} r={STONE_R} cx={cx} cy={cy} />
        {showNumbers && num !== undefined && (
          <text
            x={cx}
            y={cy + (pieceStyle === 'xo' ? STONE_R * 0.92 : 4)}
            textAnchor="middle"
            fontSize={pieceStyle === 'xo' ? 8.5 : num > 99 ? 9.5 : 11.5}
            fontWeight={700}
            fontFamily="ui-sans-serif, system-ui"
            fill={textColor}
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {num}
          </text>
        )}
      </g>,
    );
  }
  return <g>{stones}</g>;
});

// ─────────── Component chính ───────────

export const CaroBoard = memo(function CaroBoard(props: CaroBoardProps) {
  const { size, board, moves, lastMove, win, showNumbers, theme, pieceStyle, interactive, hoverPlayer, thinking, onPlay } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const total = PAD * 2 + CELL * (size - 1);

  const winSet = useMemo(() => new Set(win ? win.line.map((c) => c.row * size + c.col) : []), [win, size]);

  const locate = useCallback(
    (e: PointerEvent<SVGSVGElement>): number | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      const col = Math.round((pt.x - PAD) / CELL);
      const row = Math.round((pt.y - PAD) / CELL);
      if (row < 0 || col < 0 || row >= size || col >= size) return null;
      // Chỉ nhận khi con trỏ đủ gần giao điểm.
      if (Math.hypot(pt.x - pos(col), pt.y - pos(row)) > CELL * 0.62) return null;
      return row * size + col;
    },
    [size],
  );

  const onMove = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const idx = locate(e);
      setHover((h) => (h === idx ? h : idx));
    },
    [locate],
  );

  const onClick = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const idx = locate(e);
      if (idx === null || !interactive || board[idx] !== 0) return;
      onPlay(Math.floor(idx / size), idx % size);
    },
    [locate, interactive, board, onPlay, size],
  );

  const showHover = interactive && hover !== null && board[hover] === 0;
  const hRow = hover !== null ? Math.floor(hover / size) : 0;
  const hCol = hover !== null ? hover % size : 0;
  const t = THEMES[theme];
  const markerColor = pieceStyle === 'stone' ? (lastMove?.player === 1 ? '#f87171' : '#dc2626') : '#f59e0b';

  return (
    <div className={`relative w-full select-none ${thinking ? 'board-thinking' : ''}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${total} ${total}`}
        className={`block h-auto w-full rounded-2xl ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
        style={{ boxShadow: `0 0 0 6px ${t.frame}, 0 24px 60px -12px rgba(0,0,0,0.55)` }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onPointerUp={onClick}
        role="grid"
        aria-label={`Bàn cờ caro ${size}x${size}`}
      >
        <PieceDefs prefix={DEF} />
        <GridLayer size={size} theme={theme} />

        {/* Chỉ báo hover tại giao điểm */}
        {showHover && (
          <g style={{ pointerEvents: 'none' }}>
            <path
              d={`M${pos(hCol)} ${PAD}V${pos(size - 1)}M${PAD} ${pos(hRow)}H${pos(size - 1)}`}
              stroke={theme === 'dark' ? '#93c5fd' : '#1d4ed8'}
              strokeOpacity={0.18}
              strokeWidth={2}
            />
            <Piece prefix={DEF} player={hoverPlayer} style={pieceStyle} r={STONE_R} cx={pos(hCol)} cy={pos(hRow)} opacity={0.45} shadow={false} />
            <circle cx={pos(hCol)} cy={pos(hRow)} r={STONE_R + 2} fill="none" stroke={theme === 'dark' ? '#93c5fd' : '#2563eb'} strokeWidth={1.5} strokeDasharray="4 3" className="hover-ring" />
          </g>
        )}

        <StonesLayer size={size} board={board} moves={moves} showNumbers={showNumbers} pieceStyle={pieceStyle} winSet={winSet} />

        {/* Đánh dấu nước vừa đi */}
        {lastMove && !win && (
          <g key={`${lastMove.row}-${lastMove.col}-${lastMove.number}`} style={{ pointerEvents: 'none' }}>
            <circle cx={pos(lastMove.col)} cy={pos(lastMove.row)} r={STONE_R + 3} fill="none" stroke={markerColor} strokeWidth={2} className="last-move-ring" />
            {!showNumbers && pieceStyle === 'stone' && (
              <circle cx={pos(lastMove.col)} cy={pos(lastMove.row)} r={3.6} fill={markerColor} />
            )}
          </g>
        )}

        {/* Đường thắng */}
        {win && win.line.length >= 2 && (
          <line
            x1={pos(win.line[0].col)}
            y1={pos(win.line[0].row)}
            x2={pos(win.line[win.line.length - 1].col)}
            y2={pos(win.line[win.line.length - 1].row)}
            stroke="#facc15"
            strokeWidth={6}
            strokeLinecap="round"
            className="win-line"
            style={{ pointerEvents: 'none', filter: 'drop-shadow(0 0 6px rgba(250,204,21,0.9))' }}
          />
        )}
      </svg>

      {thinking && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur">
          <span className="inline-flex items-center gap-2">
            <span className="thinking-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            AI đang tính toán…
          </span>
        </div>
      )}
    </div>
  );
});
