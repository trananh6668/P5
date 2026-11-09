/**
 * src/components/GameControls.tsx
 * Thanh công cụ (Undo / Redo / Đổi bên / Ván mới) và bảng cài đặt (cấp độ, luật, kích
 * thước, giao diện, kiểu quân, số thứ tự nước đi).
 */
import { AI_LEVELS } from '../types/caro';
import type { AiLevel, BoardSize, BoardTheme, PieceStyle, Player, RuleMode } from '../types/caro';
import { PieceIcon } from './Pieces';

interface GameControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  humanPlayer: Player;
  level: AiLevel;
  rule: RuleMode;
  size: BoardSize;
  theme: BoardTheme;
  pieceStyle: PieceStyle;
  showNumbers: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onNewGame: () => void;
  onSwapSides: () => void;
  onLevel: (level: AiLevel) => void;
  onRule: (rule: RuleMode) => void;
  onSize: (size: BoardSize) => void;
  onTheme: (theme: BoardTheme) => void;
  onPieceStyle: (style: PieceStyle) => void;
  onToggleNumbers: () => void;
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  cols,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  cols?: number;
}) {
  return (
    <div className="grid gap-1 rounded-xl bg-black/25 p-1" style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-all duration-200 ${
            o.value === value ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:bg-white/10 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function GameControls(p: GameControlsProps) {
  return (
    <section className="panel space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <button type="button" className="btn" onClick={p.onUndo} disabled={!p.canUndo} title="Đi lại (Ctrl+Z)">
          <span className="text-lg leading-none">↶</span>
          <span>Đi lại</span>
        </button>
        <button type="button" className="btn" onClick={p.onRedo} disabled={!p.canRedo} title="Đánh lại (Ctrl+Y)">
          <span className="text-lg leading-none">↷</span>
          <span>Đánh lại</span>
        </button>
        <button type="button" className="btn" onClick={p.onSwapSides} title="Đổi bên và bắt đầu ván mới">
          <span className="flex items-center justify-center gap-0.5">
            <PieceIcon player={p.humanPlayer === 1 ? 2 : 1} style={p.pieceStyle} size={16} />
          </span>
          <span>Cầm {p.humanPlayer === 1 ? 'O' : 'X'}</span>
        </button>
        <button type="button" className="btn btn-primary" onClick={p.onNewGame} title="Ván mới (N)">
          <span className="text-lg leading-none">✦</span>
          <span>Ván mới</span>
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="field-label">Cấp độ AI</label>
        <Segmented
          value={p.level}
          onChange={p.onLevel}
          cols={4}
          options={(Object.keys(AI_LEVELS) as AiLevel[]).map((id) => ({ value: id, label: AI_LEVELS[id].label, hint: AI_LEVELS[id].description }))}
        />
      </div>

      <div className="space-y-1.5">
        <label className="field-label">Luật chơi <span className="text-slate-500">(đổi luật = ván mới)</span></label>
        <Segmented
          value={p.rule}
          onChange={p.onRule}
          options={[
            { value: 'freestyle', label: 'Tự do (Gomoku)', hint: 'Đủ 5 quân liên tiếp là thắng' },
            { value: 'standard', label: 'Chặn 2 đầu (VN)', hint: '5 quân bị chặn cả 2 đầu chưa thắng' },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="field-label">Bàn cờ</label>
          <Segmented
            value={p.size}
            onChange={p.onSize}
            options={[
              { value: 15 as BoardSize, label: '15×15' },
              { value: 19 as BoardSize, label: '19×19' },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <label className="field-label">Kiểu quân</label>
          <Segmented
            value={p.pieceStyle}
            onChange={p.onPieceStyle}
            options={[
              { value: 'stone', label: 'Đá vây' },
              { value: 'xo', label: 'X / O' },
            ]}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="field-label">Giao diện bàn cờ</label>
        <Segmented
          value={p.theme}
          onChange={p.onTheme}
          options={[
            { value: 'wood', label: 'Gỗ cổ điển' },
            { value: 'dark', label: 'Tối' },
            { value: 'light', label: 'Sáng' },
          ]}
        />
      </div>

      <label className="flex cursor-pointer items-center justify-between rounded-xl bg-black/25 px-3 py-2.5">
        <span className="text-sm text-slate-200">Hiển thị số thứ tự nước đi</span>
        <span className="relative inline-flex">
          <input type="checkbox" className="peer sr-only" checked={p.showNumbers} onChange={p.onToggleNumbers} />
          <span className="h-6 w-11 rounded-full bg-slate-600 transition-colors peer-checked:bg-sky-500" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </span>
      </label>
    </section>
  );
}
