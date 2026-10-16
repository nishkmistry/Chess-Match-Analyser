import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { API_BASE } from '../lib/api';
import { figurine } from '../lib/chess';
import { clockSummary, lossPct, motifSummary, openingSummary, phaseSummary, reviewFacts } from '../lib/insights';
import { inAccount, listAccounts, opponentName, resolveAccount } from '../lib/matches';
import { reviewGame } from '../lib/review';
import AccountPicker from './AccountPicker';

const pct = (x) => `${Math.round(x * 100)}%`;
const PHASE_LABELS = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' };
const PHASE_NOTES = { opening: 'moves 1–12', middlegame: '', endgame: 'few pieces left' };

// Several Stockfish workers at once, leaving a core free for the page
const PARALLEL = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));

function SectionHead({ title, children }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-rule pb-2">
      <h2 className="section-title">{title}</h2>
      {children && <span className="text-xs text-muted">{children}</span>}
    </div>
  );
}

function Lead({ children }) {
  return <p className="mt-3 font-serif text-[17px] leading-[1.55] text-ink">{children}</p>;
}

function ReviewQueue({ pending, onReviewed }) {
  const [run, setRun] = useState(null);   // { done, failed, total, active: { [id]: { label, done, total } } }
  const abort = useRef(null);

  useEffect(() => () => abort.current?.abort(), []);

  const start = async () => {
    const controller = new AbortController();
    abort.current = controller;
    const queue = [...pending];
    const total = queue.length;
    const active = {};
    let done = 0;
    let failed = 0;
    const publish = () => setRun({ done, failed, total, active: { ...active } });
    publish();

    const worker = async () => {
      while (queue.length && !controller.signal.aborted) {
        const match = queue.shift();
        const label = `vs ${opponentName(match)}`;
        try {
          const analysis = await reviewGame(match, {
            signal: controller.signal,
            onProgress: ({ done: position, total: positions }) => {
              active[match.match_id] = { label, done: position, total: positions };
              publish();
            },
          });
          onReviewed(analysis);
          done++;
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.error(`Review of game ${match.match_id} failed:`, err);
          failed++;
        }
        delete active[match.match_id];
        publish();
      }
    };

    await Promise.all(Array.from({ length: Math.min(PARALLEL, total) }, worker));
    if (controller.signal.aborted) return;
    setRun(null);
    if (failed) toast.error(`${failed} game${failed === 1 ? '' : 's'} could not be reviewed.`);
    else toast.success(`Reviewed ${done} game${done === 1 ? '' : 's'}.`);
  };

  const stop = () => {
    abort.current?.abort();
    setRun(null);
  };

  if (run) {
    const active = Object.values(run.active);
    const partial = active.reduce((sum, a) => sum + (a.total ? a.done / a.total : 0), 0);
    return (
      <div className="border-b border-rule py-4" aria-live="polite">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-sm text-ink tabular-nums">
            Reviewing games with Stockfish: {run.done} of {run.total} done
            {active.length > 0 && <span className="text-muted"> · {active.map((a) => `${a.label} (${a.done + 1}/${a.total})`).join(', ')}</span>}
          </p>
          <button type="button" onClick={stop} className="btn btn-line">Stop</button>
        </div>
        <div className="mt-3 h-0.5 bg-wash">
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${((run.done + partial) / run.total) * 100}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">Each review is saved as it finishes, so stopping loses nothing already done. Keep this tab open.</p>
      </div>
    );
  }

  if (pending.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule py-4">
      <p className="text-sm text-muted">
        {pending.length} game{pending.length === 1 ? ' hasn’t' : 's haven’t'} been reviewed by the engine yet, so {pending.length === 1 ? 'it isn’t' : 'they aren’t'} counted below.
        {' '}About a minute per game, {PARALLEL > 1 ? `${PARALLEL} at a time, ` : ''}in your browser.
      </p>
      <button type="button" onClick={start} className="btn btn-ink">Review {pending.length === 1 ? 'it' : `all ${pending.length}`}</button>
    </div>
  );
}

function PhaseSection({ facts }) {
  const rows = phaseSummary(facts);
  const ranked = rows.filter((r) => r.moves >= 10).sort((a, b) => b.avgLoss - a.avgLoss);
  const worst = ranked[0];
  const best = ranked[ranked.length - 1];

  return (
    <section>
      <SectionHead title="Where you lose ground" />
      {worst && best && worst !== best && (
        <Lead>
          The {worst.phase} costs you most: {lossPct(worst.avgLoss).toFixed(1)}% winning chances per move,
          against {lossPct(best.avgLoss).toFixed(1)}% in the {best.phase}.
        </Lead>
      )}
      <table className="mt-3 w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-muted">
            <th className="py-2 text-left font-normal" />
            <th className="py-2 text-right font-normal">Your moves</th>
            <th className="w-12 py-2 text-right font-mono font-semibold text-amber-700 dark:text-amber-400" title="Inaccuracies">?!</th>
            <th className="w-12 py-2 text-right font-mono font-semibold text-orange-700 dark:text-orange-400" title="Mistakes">?</th>
            <th className="w-12 py-2 text-right font-mono font-semibold text-red-700 dark:text-red-400" title="Blunders">??</th>
            <th className="py-2 text-right font-normal">Lost per move</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.phase} className="border-t border-rule">
              <td className="py-2.5 pr-3">
                <span className={r === worst ? 'font-semibold text-ink' : 'text-ink'}>{PHASE_LABELS[r.phase]}</span>
                {PHASE_NOTES[r.phase] && <span className="ml-2 text-xs text-muted">{PHASE_NOTES[r.phase]}</span>}
              </td>
              <td className="py-2.5 text-right font-mono text-muted">{r.moves}</td>
              {['inaccuracy', 'mistake', 'blunder'].map((tag) => (
                <td key={tag} className={`py-2.5 text-right font-mono ${r[tag] ? 'text-ink' : 'text-muted/60'}`}>{r[tag]}</td>
              ))}
              <td className="py-2.5 text-right font-mono text-ink">{r.avgLoss === null ? '—' : `${lossPct(r.avgLoss).toFixed(1)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Lost per move: the average drop in your winning chances, as Stockfish sees it. Endgame starts when each side is down to about a rook and two minor pieces.
      </p>
    </section>
  );
}

function ClockSection({ facts }) {
  const summary = clockSummary(facts);
  const byKey = Object.fromEntries(summary.rows.map((r) => [r.key, r]));
  const base = byKey.normal.rate;

  let lead = null;
  if (summary.games === 0) {
    lead = 'None of your reviewed games has clock times, so there’s nothing to measure yet.';
  } else if (summary.errors === 0) {
    lead = 'No mistakes or blunders in the reviewed games, so the clock hasn’t cost you anything.';
  } else {
    const ratios = ['pressure', 'fast', 'long']
      .map((key) => ({ key, row: byKey[key], ratio: base ? byKey[key].rate / base : null }))
      .filter(({ row, ratio }) => row.moves >= 8 && ratio !== null && ratio >= 1.5)
      .sort((a, b) => b.ratio - a.ratio);
    const phrases = { pressure: 'in time trouble', fast: 'when you move quickly with time in hand', long: 'after a long think' };
    const top = ratios[0];
    lead = top
      ? `You make ${top.ratio.toFixed(1)}× as many mistakes per move ${phrases[top.key]} as at a normal pace (${top.row.errors} in ${top.row.moves} moves${top.row.moves < 30 ? ', a small sample so far' : ''}).`
      : 'Your mistakes aren’t tied to the clock: the rate is about the same whatever the time.';
  }

  return (
    <section>
      <SectionHead title="The clock">{summary.games} game{summary.games === 1 ? '' : 's'} with clock times</SectionHead>
      <Lead>{lead}</Lead>
      {summary.games > 0 && (
        <table className="mt-3 w-full text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-2 text-left font-normal" />
              <th className="py-2 text-right font-normal">Of your moves</th>
              <th className="py-2 text-right font-normal">Of your mistakes</th>
              <th className="py-2 text-right font-normal">Per 100 moves</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((r) => (
              <tr key={r.key} className="border-t border-rule">
                <td className="py-2.5 pr-3">
                  <div className="text-ink">{r.label}</div>
                  {r.note && <div className="text-xs text-muted">{r.note}</div>}
                </td>
                <td className="py-2.5 text-right font-mono text-muted">{pct(r.moveShare)}</td>
                <td className="py-2.5 text-right font-mono text-ink">{summary.errors ? pct(r.errorShare) : '—'}</td>
                <td className="py-2.5 text-right font-mono text-ink">{r.rate === null ? '—' : r.rate.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Mistakes here means mistakes and blunders. Time trouble is under a tenth of the starting clock; daily games are left out.
      </p>
    </section>
  );
}

function OpeningSection({ matches, factsById }) {
  const rows = openingSummary(matches, factsById).slice(0, 10);
  const weakest = rows.filter((r) => r.games >= 2).sort((a, b) => a.score - b.score)[0];

  return (
    <section>
      <SectionHead title="Openings" />
      {weakest && weakest.score < 0.5 && (
        <Lead>
          Your weakest: the {weakest.family} as {weakest.color === 'white' ? 'White' : 'Black'}, {pct(weakest.score)} from {weakest.games} games
          {weakest.avgEval !== null && weakest.avgEval < -0.3 ? `, and you’re already ${Math.abs(weakest.avgEval).toFixed(1)} pawns down after move 12 on average` : ''}.
        </Lead>
      )}
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No opening names in these games.</p>
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="mt-3 w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-muted">
                <th className="py-2 text-left font-normal">Opening</th>
                <th className="py-2 text-left font-normal">As</th>
                <th className="py-2 text-right font-normal">Games</th>
                <th className="py-2 text-right font-normal">Score</th>
                <th className="py-2 text-right font-normal" title="Average engine score after move 12, from your side, in reviewed games">After move 12</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-rule">
                  <td className="max-w-[14rem] truncate py-2.5 pr-3 text-ink" title={r.family}>{r.family}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`inline-block size-2.5 border align-middle ${r.color === 'white' ? 'border-stone-400 bg-white' : 'border-stone-900 bg-stone-900 dark:border-stone-500'}`} title={r.color} />
                  </td>
                  <td className="py-2.5 text-right font-mono text-muted">{r.games}</td>
                  <td className="py-2.5 text-right font-mono text-ink">{pct(r.score)}</td>
                  <td className={`py-2.5 text-right font-mono ${r.avgEval === null ? 'text-muted/60' : r.avgEval >= 0.5 ? 'text-green-700 dark:text-green-400' : r.avgEval <= -0.5 ? 'text-red-700 dark:text-red-400' : 'text-ink'}`}>
                    {r.avgEval === null ? '—' : `${r.avgEval > 0 ? '+' : ''}${r.avgEval.toFixed(1)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs leading-relaxed text-muted">Score counts every imported game; after move 12 uses the reviewed ones, in pawns from your side.</p>
    </section>
  );
}

function MotifSection({ facts }) {
  const rows = motifSummary(facts);
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <section>
      <SectionHead title="Recurring mistakes">{total} mistakes and blunders</SectionHead>
      {rows.length === 0 ? (
        <Lead>Nothing to sort yet: no mistakes or blunders in the reviewed games.</Lead>
      ) : (
        <ol className="mt-1">
          {rows.map((r) => (
            <li key={r.motif} className="border-b border-rule py-3 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-ink">{r.label}</span>
                <span className="font-mono text-sm text-muted tabular-nums">{r.count}</span>
              </div>
              <div className="mt-1.5 h-1 bg-wash">
                <div className="h-full bg-accent/70" style={{ width: `${(r.count / rows[0].count) * 100}%` }} />
              </div>
              <p className="mt-1.5 text-sm text-muted">
                {r.examples.map((ex, i) => (
                  <span key={`${ex.match.match_id}-${ex.ply}`}>
                    {i > 0 && ' · '}
                    <Link to={`/analysis/${ex.match.match_id}?ply=${ex.ply}`} className="link fig text-[13px]">
                      {ex.moveNo}{ex.side === 'w' ? '.' : '…'} {figurine(ex.san)}
                    </Link>
                    {' '}vs {opponentName(ex.match)}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Sorted by what Stockfish’s best moves show: what your opponent could take next, or what you could have played instead. Links open the position.
      </p>
    </section>
  );
}

export default function InsightsPage({ matches: allMatches, loading, account, onAccountChange }) {
  const [analyses, setAnalyses] = useState(null);
  const accounts = useMemo(() => listAccounts(allMatches), [allMatches]);
  const activeAccount = resolveAccount(accounts, account);
  const matches = useMemo(() => inAccount(allMatches, activeAccount), [allMatches, activeAccount]);
  const accountLabel = accounts.find((a) => a.key === activeAccount)?.label;

  useEffect(() => {
    axios.get(`${API_BASE}/analyses`)
      .then((res) => setAnalyses(res.data))
      .catch((err) => {
        console.error('Failed to load reviews', err);
        toast.error('Could not load saved reviews.');
        setAnalyses([]);
      });
  }, []);

  const onReviewed = useCallback((analysis) => {
    setAnalyses((prev) => [...(prev ?? []).filter((a) => a.match_id !== analysis.match_id), analysis]);
  }, []);

  const { facts, factsById, pending } = useMemo(() => {
    const byMatch = Object.fromEntries((analyses ?? []).map((a) => [a.match_id, a]));
    const list = [];
    const byId = {};
    for (const m of matches) {
      const f = byMatch[m.match_id] && reviewFacts(m, byMatch[m.match_id]);
      if (f) {
        list.push(f);
        byId[m.match_id] = f;
      }
    }
    return {
      facts: list,
      factsById: byId,
      pending: analyses ? matches.filter((m) => m.pgn && m.player_color && !byMatch[m.match_id]) : [],
    };
  }, [matches, analyses]);

  const ready = !loading && analyses !== null;

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-rule pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-4xl font-semibold tracking-[-0.02em] text-ink md:text-5xl">Insights</h1>
          <p className="mt-2 text-muted">
            {!ready
              ? <span className="skeleton inline-block h-4 w-72" />
              : `Patterns across ${facts.length} engine-reviewed game${facts.length === 1 ? '' : 's'}${matches.length ? ` of the ${matches.length} imported${accounts.length > 1 && accountLabel ? ` for ${accountLabel}` : ''}` : ''}.`}
          </p>
        </div>
        <AccountPicker accounts={accounts} value={activeAccount} onChange={onAccountChange} />
      </div>

      {ready && <ReviewQueue key={activeAccount} pending={pending} onReviewed={onReviewed} />}

      {!ready ? (
        <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-64" />)}
        </div>
      ) : matches.length === 0 ? (
        <p className="py-16 text-center font-serif text-lg italic text-muted">
          No games yet. <Link to="/" className="link not-italic">Import some</Link> and review them to see your patterns.
        </p>
      ) : facts.length === 0 ? (
        <p className="py-16 text-center font-serif text-lg italic text-muted">
          Nothing reviewed yet. Review the games above, or open one from <Link to="/" className="link not-italic">your games</Link>.
        </p>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-x-14 gap-y-14 lg:grid-cols-2">
          <PhaseSection facts={facts} />
          <ClockSection facts={facts} />
          <OpeningSection matches={matches} factsById={factsById} />
          <MotifSection facts={facts} />
        </div>
      )}
    </div>
  );
}
