import { LoaderCircle } from 'lucide-react';
import { format } from 'date-fns';

// verified === false: the coach cited a move Stockfish didn't flag, even after being asked to fix it
function MoveLink({ ply, labelForPly, onJump, verified }) {
  const label = ply !== null && ply !== undefined ? labelForPly(ply) : null;
  if (!label) return null;
  return (
    <>
      {' '}
      <button
        type="button"
        onClick={() => onJump(ply)}
        className="fig whitespace-nowrap text-[14px] font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent cursor-pointer"
        title="Show this position"
      >
        {label}
      </button>
      {verified === false && (
        <span className="ml-1.5 font-sans text-xs text-amber-700 dark:text-amber-400" title="Stockfish didn't flag this move as a mistake, so treat this note with care">
          not flagged by Stockfish
        </span>
      )}
    </>
  );
}

function Note({ head, children }) {
  return (
    <p className="font-serif text-[16.5px] leading-[1.6] text-ink">
      <span className="font-semibold">{head}.</span> {children}
    </p>
  );
}

export default function ReportPanel({ report, loading, error, onGenerate, onJump, labelForPly, busy, needsAnalysis }) {
  return (
    <section>
      <div className="flex items-baseline justify-between border-b border-rule pb-2">
        <h2 className="section-title">Coach’s notes</h2>
        <span className="text-xs text-muted">
          AI-written, via Groq{report?.reported_at ? ` · saved ${format(new Date(report.reported_at), 'd MMM')}` : ''}
        </span>
      </div>

      {loading ? (
        <div className="space-y-2.5 pt-4" aria-live="polite">
          <p className="flex items-center gap-2 font-serif italic text-muted">
            <LoaderCircle size={14} className="animate-spin" /> Reading through the game…
          </p>
          {[100, 92, 97, 60].map((w, i) => <div key={i} className="skeleton h-3" style={{ width: `${w}%` }} />)}
        </div>
      ) : report ? (
        <div className="space-y-3.5 pt-4">
          <p className="font-serif text-[18px] italic leading-[1.55] text-ink">{report.summary}</p>
          <Note head="Opening">{report.opening}</Note>
          <Note head="Turning point">
            {report.turning_point.text}
            <MoveLink ply={report.turning_point.ply} labelForPly={labelForPly} onJump={onJump} verified={report.checks?.turning_point} />
          </Note>
          <Note head="Costliest mistake">
            {report.blunder.text}
            <MoveLink ply={report.blunder.ply} labelForPly={labelForPly} onJump={onJump} verified={report.checks?.blunder} />
          </Note>
          {report.missed_win && (
            <Note head="Missed win">
              {report.missed_win.text}
              <MoveLink ply={report.missed_win.ply} labelForPly={labelForPly} onJump={onJump} verified={report.checks?.missed_win} />
            </Note>
          )}
          {report.lessons?.length > 0 && (
            <div className="border-t border-rule pt-3.5">
              <p className="text-sm font-medium text-ink">To work on</p>
              <ol className="mt-2 space-y-1.5">
                {report.lessons.map((lesson, i) => (
                  <li key={i} className="flex gap-3 font-serif text-[16px] leading-[1.55] text-ink">
                    <span className="font-mono text-sm leading-[1.7] text-muted">{i + 1}</span>
                    <span>{lesson}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ) : (
        <p className="pt-3 text-sm leading-relaxed text-muted">
          An AI coach reads the engine’s evaluations and the clock times and writes the game up: how the opening went, where it turned, the costliest mistake, and what to work on. It may only point at moves Stockfish flagged, and every move it cites is checked.
        </p>
      )}

      {error && !loading && (
        <p className="mt-3 border-l-2 border-red-600 pl-3 text-sm text-red-700 dark:text-red-400" role="alert">{error}</p>
      )}

      <button type="button" onClick={onGenerate} disabled={loading || busy} className="btn btn-ink mt-4">
        {report ? 'Rewrite the notes' : needsAnalysis ? 'Review moves and write notes' : 'Write the notes'}
      </button>
    </section>
  );
}
