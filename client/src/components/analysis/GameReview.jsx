import { useMemo } from 'react';
import { CLASSIFICATIONS } from '../../lib/evaluation';

const ORDER = ['inaccuracy', 'mistake', 'blunder'];

export default function GameReview({ evals, classifications, fens, progress, onAnalyze, white, black }) {
  const counts = useMemo(() => {
    const out = { w: { blunder: 0, mistake: 0, inaccuracy: 0 }, b: { blunder: 0, mistake: 0, inaccuracy: 0 } };
    classifications.forEach((c, ply) => {
      if (c) out[fens[ply - 1].split(' ')[1]][c]++;
    });
    return out;
  }, [classifications, fens]);

  const running = progress !== null;
  const done = evals.length > 0;

  return (
    <section>
      <h2 className="section-title border-b border-rule pb-2">Engine review</h2>

      {running ? (
        <div className="pt-3" aria-live="polite">
          <p className="text-sm text-muted tabular-nums">
            {progress.phase === 'verify'
              ? `Taking a closer look at the critical moments: ${progress.done + 1} of ${progress.total}`
              : `Stockfish is going through the game: position ${progress.done + 1} of ${progress.total}`}
          </p>
          <div className="mt-2.5 h-0.5 bg-wash">
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      ) : done ? (
        <table className="mt-1 w-full text-sm tabular-nums">
          <thead>
            <tr>
              <th className="py-2" />
              {ORDER.map((c) => (
                <th key={c} className={`w-14 py-2 text-right font-mono font-semibold ${CLASSIFICATIONS[c].className}`} title={CLASSIFICATIONS[c].label}>
                  {CLASSIFICATIONS[c].symbol}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[['w', white], ['b', black]].map(([side, name]) => (
              <tr key={side} className="border-t border-rule">
                <td className="max-w-0 truncate py-2 pr-3 text-ink">{name}</td>
                {ORDER.map((c) => (
                  <td key={c} className={`py-2 text-right font-mono ${counts[side][c] ? 'text-ink' : 'text-muted/60'}`}>{counts[side][c]}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="pt-2 text-xs text-muted">
                ?! inaccuracy · ? mistake · ?? blunder, judged by how much each move cost in winning chances.
              </td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <div className="pt-3">
          <p className="text-sm leading-relaxed text-muted">
            Let Stockfish score every position, then look harder at the moves that seem to lose ground. You get an evaluation graph under the board and each slip marked in the move list. It takes about a second per move.
          </p>
          <button type="button" onClick={onAnalyze} className="btn btn-line mt-3">
            Review all moves
          </button>
        </div>
      )}
    </section>
  );
}
