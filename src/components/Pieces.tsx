/**
 * src/components/Pieces.tsx
 * Đồ hoạ quân cờ SVG dùng chung (bàn cờ + icon): đá cờ vây bóng bẩy hoặc X/O 3D nổi.
 * Đã tối ưu chống lỗi đảo màu bởi Auto Dark Mode / Dark Reader.
 */
import { useId, type CSSProperties } from 'react';
import type { PieceStyle, Player } from '../types/caro';

const NO_DARK_OVERRIDE: CSSProperties = {
  colorScheme: ' only light',
  forcedColorAdjust: 'none',
  filter: 'none',
};

/** Gradient + filter cho quân cờ. `prefix` giúp nhiều SVG trên trang không trùng id. */
export function PieceDefs({ prefix }: { prefix: string }) {
  return (
    <defs style={NO_DARK_OVERRIDE} data-darkreader-ignore>
      {/* Đá đen */}
      <radialGradient id={`${prefix}-black`} cx="34%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#6e7685" stopOpacity={1} style={NO_DARK_OVERRIDE} />
        <stop offset="25%" stopColor="#353942" stopOpacity={1} style={NO_DARK_OVERRIDE} />
        <stop offset="70%" stopColor="#14161b" stopOpacity={1} style={NO_DARK_OVERRIDE} />
        <stop offset="100%" stopColor="#08090c" stopOpacity={1} style={NO_DARK_OVERRIDE} />
      </radialGradient>

      {/* Đá trắng (Dùng tông trắng ngà shell #fcfaf5 để tránh bị Force Dark Mode nhận diện là nền trắng) */}
      <radialGradient id={`${prefix}-white`} cx="34%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#fcfaf5" stopOpacity={1} style={NO_DARK_OVERRIDE} />
        <stop offset="50%" stopColor="#f2efe9" stopOpacity={1} style={NO_DARK_OVERRIDE} />
        <stop offset="82%" stopColor="#dcd8ce" stopOpacity={1} style={NO_DARK_OVERRIDE} />
        <stop offset="100%" stopColor="#b8b2a6" stopOpacity={1} style={NO_DARK_OVERRIDE} />
      </radialGradient>

      {/* Đế quân X/O */}
      <radialGradient id={`${prefix}-disc`} cx="35%" cy="28%" r="80%">
        <stop offset="0%" stopColor="#fcfaf5" stopOpacity={1} style={NO_DARK_OVERRIDE} />
        <stop offset="60%" stopColor="#f1ece2" stopOpacity={1} style={NO_DARK_OVERRIDE} />
        <stop offset="100%" stopColor="#cfc6b5" stopOpacity={1} style={NO_DARK_OVERRIDE} />
      </radialGradient>

      <linearGradient id={`${prefix}-blue`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#60a5fa" stopOpacity={1} style={NO_DARK_OVERRIDE} />
        <stop offset="55%" stopColor="#2563eb" stopOpacity={1} style={NO_DARK_OVERRIDE} />
        <stop offset="100%" stopColor="#1e3a8a" stopOpacity={1} style={NO_DARK_OVERRIDE} />
      </linearGradient>

      <linearGradient id={`${prefix}-red`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fb7185" stopOpacity={1} style={NO_DARK_OVERRIDE} />
        <stop offset="55%" stopColor="#dc2626" stopOpacity={1} style={NO_DARK_OVERRIDE} />
        <stop offset="100%" stopColor="#7f1d1d" stopOpacity={1} style={NO_DARK_OVERRIDE} />
      </linearGradient>

      <filter id={`${prefix}-shadow`} x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0.06" dy="0.1" stdDeviation="0.06" floodColor="#000000" floodOpacity={0.45} />
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
    const isBlack = player === 1;
    return (
      <g
        filter={filter}
        transform={`translate(${cx} ${cy}) scale(${r})`}
        data-darkreader-ignore
        style={{
          opacity,
          colorScheme: 'only light',
          forcedColorAdjust: 'none',
        }}
      >
        {/* Lớp lót màu đặc cố định phòng trường hợp gradient bị can thiệp */}
        <circle
          r={1}
          fill={isBlack ? '#14161b' : '#f2efe9'}
          style={NO_DARK_OVERRIDE}
        />
        {/* Lớp phủ Gradient 3D */}
        <circle
          r={1}
          fill={`url(#${prefix}-${isBlack ? 'black' : 'white'})`}
          style={NO_DARK_OVERRIDE}
        />
        {/* Viền tạo khối cho quân trắng */}
        {!isBlack && (
          <circle
            r={0.965}
            fill="none"
            stroke="#9ca3af"
            strokeWidth={0.045}
            style={NO_DARK_OVERRIDE}
          />
        )}
        {/* Điểm phản quang (dùng fill trực tiếp thay vì gradient trắng-sang-trắng để không bị đảo thành màu đen) */}
        <ellipse
          cx={-0.3}
          cy={-0.34}
          rx={0.26}
          ry={0.14}
          transform="rotate(-30 -0.3 -0.34)"
          fill="#fcfaf5"
          fillOpacity={isBlack ? 0.22 : 0.65}
          style={NO_DARK_OVERRIDE}
        />
      </g>
    );
  }

  // Kiểu X/O 3D: đế tròn + ký hiệu nổi.
  return (
    <g
      filter={filter}
      transform={`translate(${cx} ${cy}) scale(${r})`}
      data-darkreader-ignore
      style={{
        opacity,
        colorScheme: 'only light',
        forcedColorAdjust: 'none',
      }}
    >
      <circle r={1} fill="#f1ece2" style={NO_DARK_OVERRIDE} />
      <circle r={1} fill={`url(#${prefix}-disc)`} style={NO_DARK_OVERRIDE} />
      <circle
        r={0.96}
        fill="none"
        stroke="#b4a993"
        strokeWidth={0.05}
        style={NO_DARK_OVERRIDE}
      />
      {player === 1 ? (
        <g strokeLinecap="round">
          <path
            d="M-0.48 -0.48 L0.48 0.48 M0.48 -0.48 L-0.48 0.48"
            transform="translate(0.04 0.06)"
            fill="none"
            stroke="#0b1d4d"
            strokeOpacity={0.35}
            strokeWidth={0.3}
            style={NO_DARK_OVERRIDE}
          />
          <path
            d="M-0.48 -0.48 L0.48 0.48 M0.48 -0.48 L-0.48 0.48"
            fill="none"
            stroke={`url(#${prefix}-blue)`}
            strokeWidth={0.3}
            style={NO_DARK_OVERRIDE}
          />
          <path
            d="M-0.42 -0.48 L0.1 0.04"
            fill="none"
            stroke="#fcfaf5"
            strokeOpacity={0.45}
            strokeWidth={0.07}
            style={NO_DARK_OVERRIDE}
          />
        </g>
      ) : (
        <g>
          <circle
            r={0.48}
            transform="translate(0.04 0.06)"
            fill="none"
            stroke="#450a0a"
            strokeOpacity={0.35}
            strokeWidth={0.28}
            style={NO_DARK_OVERRIDE}
          />
          <circle
            r={0.48}
            fill="none"
            stroke={`url(#${prefix}-red)`}
            strokeWidth={0.28}
            style={NO_DARK_OVERRIDE}
          />
          <path
            d="M-0.42 -0.2 A0.46 0.46 0 0 1 -0.1 -0.47"
            strokeLinecap="round"
            fill="none"
            stroke="#fcfaf5"
            strokeOpacity={0.55}
            strokeWidth={0.07}
            style={NO_DARK_OVERRIDE}
          />
        </g>
      )}
      <ellipse
        cx={-0.32}
        cy={-0.4}
        rx={0.24}
        ry={0.12}
        transform="rotate(-30 -0.32 -0.4)"
        fill="#fcfaf5"
        fillOpacity={0.5}
        style={NO_DARK_OVERRIDE}
      />
    </g>
  );
}

/** Icon quân cờ độc lập (dùng trong bảng điểm, nút bấm). */
export function PieceIcon({ player, style, size = 28 }: { player: Player; style: PieceStyle; size?: number }) {
  const prefix = `pi${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-1.2 -1.2 2.4 2.4"
      aria-hidden="true"
      data-darkreader-ignore
      style={NO_DARK_OVERRIDE}
    >
      <PieceDefs prefix={prefix} />
      <Piece prefix={prefix} player={player} style={style} r={1} cx={0} cy={0} />
    </svg>
  );
}

export function playerName(player: Player): string {
  return player === 1 ? 'X' : 'O';
}