import { useEffect } from 'react';
import { CaroBoard } from './components/CaroBoard';
import { GameControls } from './components/GameControls';
import { ScoreBoard } from './components/ScoreBoard';
import { useCaroGame } from './hooks/useCaroGame';

export default function App() {
  const game = useCaroGame();
  const { state, settings } = game;
  const interactive = state.status === 'playing' && !game.thinking && game.currentPlayer === state.humanPlayer;

  // Phím tắt: Ctrl+Z (đi lại), Ctrl+Y / Ctrl+Shift+Z (đánh lại), N (ván mới).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        game.undo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        game.redo();
      } else if (!mod && e.key.toLowerCase() === 'n') {
        game.newGame();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#1e293b_0%,_#0b1020_55%,_#05070d_100%)] text-slate-100">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 pb-2 pt-5 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-orange-600 text-xl font-black text-slate-900 shadow-lg">
            ✕
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
              Caro <span className="bg-gradient-to-r from-sky-300 to-violet-300 bg-clip-text text-transparent">Master AI</span>
            </h1>
            <p className="text-xs text-slate-400">Negamax · Alpha-Beta · Threat-Space Search · Zobrist TT · Web Worker</p>
          </div>
        </div>
        <span className="hidden rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300 sm:inline-flex">
          ● Offline 100%
        </span>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 pb-8 pt-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex justify-center">
          <div className="w-full max-w-[min(100%,calc(100vh-120px))] min-w-[280px] p-1.5">
            <CaroBoard
              size={state.size}
              board={state.board}
              moves={state.moves}
              lastMove={game.lastMove}
              win={state.win}
              showNumbers={settings.showNumbers}
              theme={settings.theme}
              pieceStyle={settings.pieceStyle}
              interactive={interactive}
              hoverPlayer={state.humanPlayer}
              thinking={game.thinking}
              onPlay={game.play}
            />
          </div>
        </div>

        <aside className="space-y-4">
          <ScoreBoard
            status={state.status}
            win={state.win}
            humanPlayer={state.humanPlayer}
            aiPlayer={game.aiPlayer}
            currentPlayer={game.currentPlayer}
            thinking={game.thinking}
            thinkStartedAt={game.thinkStartedAt}
            stats={game.aiStats}
            aiError={game.aiError}
            level={settings.level}
            rule={state.rule}
            size={state.size}
            moveCount={state.moves.length}
            pieceStyle={settings.pieceStyle}
            tally={game.tally}
            onResetTally={game.resetTally}
          />
          <GameControls
            canUndo={game.canUndo}
            canRedo={game.canRedo}
            humanPlayer={state.humanPlayer}
            level={settings.level}
            rule={state.rule}
            size={state.size}
            theme={settings.theme}
            pieceStyle={settings.pieceStyle}
            showNumbers={settings.showNumbers}
            onUndo={game.undo}
            onRedo={game.redo}
            onNewGame={game.newGame}
            onSwapSides={game.swapSides}
            onLevel={game.setLevel}
            onRule={game.setRule}
            onSize={game.setSize}
            onTheme={game.setTheme}
            onPieceStyle={game.setPieceStyle}
            onToggleNumbers={game.toggleNumbers}
          />
        </aside>
      </main>
    </div>
  );
}
