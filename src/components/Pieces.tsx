/**
 * src/components/Pieces.tsx
 * Đồ hoạ quân cờ SVG dùng chung (bàn cờ + icon): đá cờ vây bóng bẩy hoặc X/O 3D nổi.
 */
import { useId } from 'react';
import type { PieceStyle, Player } from '../types/caro';

/** Gradient + filter cho quân cờ. `prefix` giúp nhiều SVG trên trang không trùng id. */
export function PieceDefs({ prefix }: { prefix: string }) {
  return (
    <defs>
      {/* Đá đen */}
      <radialGradient id={`${prefix}-black`} cx="34%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#7c8494" />
        <stop offset="22%" stopColor="#3b3f48" />
        <stop offset="70%" stopColor="#111216" />
        <stop offset="100%" stopColor="#000" />
      </radialGradient>
      {/* Đá trắng */}
      <radialGradient id={`${prefix}-white`} cx="34%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="55%" stopColor="#eceef2" />
        <stop offset="85%" stopColor="#c9ccd3" />
        <stop offset="100%" stopColor="#a3a7b0" />
      </radialGradient>
      {/* Đế quân X/O */}
      <radialGradient id={`${prefix}-disc`} cx="35%" cy="28%" r="80%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="60%" stopColor="#f1ece2" />
        <stop offset="100%" stopColor="#cfc6b5" />
      </radialGradient>
      <linearGradient id={`${prefix}-blue`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="55%" stopColor="#2563eb" />
        <stop offset="100%" stopColor="#1e3a8a" />
      </linearGradient>
      <linearGradient id={`${prefix}-red`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fb7185" />
        <stop offset="55%" stopColor="#dc2626" />
        <stop offset="100%" stopColor="#7f1d1d" />
      </linearGradient>
      <radialGradient id={`${prefix}-shine`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <filter id={`${prefix}-shadow`} x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0.06" dy="0.1" stdDeviation="0.06" floodColor="#000" floodOpacity="0.45" />
      </filter>
    </defs>
  );
}

interface PieceProps {
  prefix: string;
  player: Player;
  style: PieceStyle;
  /** Bán kính quân cờ (đơn vị SVG). */
  r: number;
  cx: number;
  cy: number;
  opacity?: number;
  shadow?: boolean;
}

/** Vẽ 1 quân cờ tâm (cx, cy) bán kính r. */
export function Piece({ prefix, player, style, r, cx, cy, opacity = 1, shadow = true }: PieceProps) {
  const filter = shadow ? `url(#${prefix}-shadow)` : undefined;
  if (style === 'stone') {
    return (
      <g opacity={opacity} filter={filter} transform={`translate(${cx} ${cy}) scale(${r})`}>
        <circle r={1} fill={`url(#${prefix}-${player === 1 ? 'black' : 'white'})`} />
        {player === 2 && <circle r={0.97} fill="none" stroke="#8b8f98" strokeWidth={0.04} />}
        <ellipse cx={-0.32} cy={-0.38} rx={0.32} ry={0.2} fill={`url(#${prefix}-shine)`} opacity={player === 1 ? 0.35 : 0.6} transform="rotate(-30 -0.32 -0.38)" />
      </g>
    );
  }
  // Kiểu X/O 3D: đế tròn + ký hiệu nổi.
  return (
    <g opacity={opacity} filter={filter} transform={`translate(${cx} ${cy}) scale(${r})`}>
      <circle r={1} fill={`url(#${prefix}-disc)`} />
      <circle r={0.96} fill="none" stroke="#b4a993" strokeWidth={0.05} />
      {player === 1 ? (
        <g strokeLinecap="round">
          <path d="M-0.48 -0.48 L0.48 0.48 M0.48 -0.48 L-0.48 0.48" stroke="#0b1d4d" strokeOpacity={0.35} strokeWidth={0.3} transform="translate(0.04 0.06)" />
          <path d="M-0.48 -0.48 L0.48 0.48 M0.48 -0.48 L-0.48 0.48" stroke={`url(#${prefix}-blue)`} strokeWidth={0.3} />
          <path d="M-0.42 -0.48 L0.1 0.04" stroke="#fff" strokeOpacity={0.45} strokeWidth={0.07} />
        </g>
      ) : (
        <g>
          <circle r={0.48} fill="none" stroke="#450a0a" strokeOpacity={0.35} strokeWidth={0.28} transform="translate(0.04 0.06)" />
          <circle r={0.48} fill="none" stroke={`url(#${prefix}-red)`} strokeWidth={0.28} />
          <path d="M-0.42 -0.2 A0.46 0.46 0 0 1 -0.1 -0.47" fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={0.07} strokeLinecap="round" />
        </g>
      )}
      <ellipse cx={-0.35} cy={-0.45} rx={0.3} ry={0.16} fill={`url(#${prefix}-shine)`} opacity={0.55} transform="rotate(-30 -0.35 -0.45)" />
    </g>
  );
}

/** Icon quân cờ độc lập (dùng trong bảng điểm, nút bấm). */
export function PieceIcon({ player, style, size = 28 }: { player: Player; style: PieceStyle; size?: number }) {
  const prefix = `pi${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="-1.2 -1.2 2.4 2.4" aria-hidden="true">
      <PieceDefs prefix={prefix} />
      <Piece prefix={prefix} player={player} style={style} r={1} cx={0} cy={0} />
    </svg>
  );
}

export function playerName(player: Player): string {
  return player === 1 ? 'X' : 'O';
}
