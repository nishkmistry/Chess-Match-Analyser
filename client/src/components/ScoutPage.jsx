import { useMemo, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { LoaderCircle } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { figurine } from '../lib/chess';
import { RESULT_TEXT, sourceLabel } from '../lib/matches';
import { scoutReport } from '../lib/scout';
import { Record } from './DashboardStats';

const PLATFORMS = [
  { id: 'chess.com', label: 'Chess.com' },
  { id: 'lichess', label: 'Lichess' },
];

const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);

function ScoutForm({ onScout, busy }) {
  const [username, setUsername] = useState('');
  const [platform, setPlatform] = useState('chess.com');
  const [limit, setLimit] = useState(50);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (username.trim()) onScout({ platform, username: username.trim(), limit });
      }}
      className="w-full shrink-0 lg:w-auto"
    >
      <div className="mb-2.5 flex items-baseline gap-4">
        <span className="text-sm text-muted">Opponent on</span>
        <div className="tabs" role="group" aria-label="Platform">
          {PLATFORMS.map((p) => (
            <button key={p.id} type="button" aria-pressed={platform === p.id} onClick={() => setPlatform(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <input
          required
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="field min-w-0 flex-1 lg:w-48 lg:flex-none"
          placeholder="Their username"
          aria-label="Opponent's username"
        />
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="field w-auto pr-8" aria-label="Games to look at">
          <option value={25}>25 games</option>
          <option value={50}>50 games</option>
          <option value={100}>100 games</option>
        </select>
        <button type="submit" disabled={busy} className="btn btn-ink">
          {busy ? <><LoaderCircle size={15} className="animate-spin" /> Scouting</> : 'Scout'}
        </button>
      </div>
    </form>
  );
}

function SectionHead({ title, children }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-rule pb-2">
      <h2 className="section-title">{title}</h2>
      {children && <span className="text-xs text-muted">{children}</span>}
    </div>
  );
}

// Moves or openings with how often they came up and how the opponent scored
function TallyTable({ rows, label, render = (key) => key, limit = 6, empty = 'No games.' }) {
  if (rows.length === 0) return <p className="py-3 text-sm text-muted">{empty}</p>;
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="text-xs text-muted">
          <th className="py-2 text-left font-normal">{label}</th>
          <th className="py-2 text-right font-normal">Games</th>
          <th className="py-2 text-right font-normal">Record</th>
          <th className="py-2 text-right font-normal">Score</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, limit).map((r) => (
          <tr key={r.key} className="border-t border-rule">
            <td className="max-w-[13rem] truncate py-2 pr-3 text-ink" title={r.key}>{render(r.key)}</td>
            <td className="py-2 text-right font-mono text-muted">{r.games}</td>
            <td className="py-2 text-right text-muted"><Record tally={r} /></td>
            <td className={`py-2 text-right font-mono font-semibold ${r.score >= 0.6 ? 'text-red-700 dark:text-red-400' : r.score <= 0.4 ? 'text-green-700 dark:text-green-400' : 'text-ink'}`}>
              {pct(r.score)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const moveCell = (prefix) => (san) => <span className="fig">{prefix}{figurine(san)}</span>;

function Report({ report: r }) {
  const { overall, byColor } = r;

  const items = [
    {
      label: 'Games',
      value: overall.games,
      sub: r.speeds.map((s) => `${s.games} ${s.key}`).join(', '),
    },
    { label: 'Their score', value: pct(overall.score), sub: <Record tally={overall} /> },
    { label: 'With White', value: pct(byColor.white.score), sub: <>{byColor.white.games} games · <Record tally={byColor.white} /></> },
    { label: 'With Black', value: pct(byColor.black.score), sub: <>{byColor.black.games} games · <Record tally={byColor.black} /></> },
  ];

  return (
    <>
      <dl className="grid grid-cols-2 border-y border-rule md:grid-cols-4">
        {items.map((item, i) => (
          <div
            key={item.label}
            className={`min-w-0 py-5 md:px-6 md:first:pl-0
              ${i % 2 === 1 ? 'border-l border-rule pl-5' : 'pr-5'}
              ${i >= 2 ? 'border-t border-rule md:border-t-0' : ''}
              ${i === 2 ? 'md:border-l' : ''}`}
          >
            <dt className="text-sm text-muted">{item.label}</dt>
            <dd className="mt-1 font-serif text-[2.6rem] font-medium leading-none tracking-[-0.02em] text-ink tabular-nums">{item.value}</dd>
            <dd className="mt-2 text-sm text-muted md:truncate">{item.sub}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-12">
        <SectionHead title="Preparation notes">from their last {overall.games} games</SectionHead>
        {r.notes.length === 0 ? (
          <p className="mt-3 font-serif text-[17px] italic text-muted">No clear patterns in this sample. Try more games.</p>
        ) : (
          <ol className="mt-3 max-w-3xl space-y-2">
            {r.notes.map((note, i) => (
              <li key={i} className="flex gap-3 font-serif text-[17px] leading-[1.55] text-ink">
                <span className="font-mono text-sm leading-[1.75] text-muted">{i + 1}</span>
                <span>{note}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="mt-14 grid grid-cols-1 gap-x-14 gap-y-12 lg:grid-cols-2">
        <section>
          <SectionHead title="With White">{byColor.white.games} games</SectionHead>
          <TallyTable rows={r.whiteFirstMoves} label="First move" render={moveCell('1.')} limit={4} />
          <div className="mt-5">
            <TallyTable rows={r.whiteOpenings} label="Opening" empty="No opening names in these games." />
          </div>
          <p className="mt-2 text-xs text-muted">Scores are theirs: red where they do well, green where they struggle.</p>
        </section>

        <section>
          <SectionHead title="With Black">{byColor.black.games} games</SectionHead>
          <p className="mt-3 text-sm font-medium text-ink">Against <span className="fig">1.e4</span></p>
          <TallyTable rows={r.replies.e4} label="Reply" render={moveCell('1…')} limit={4} empty="Never faced it here." />
          <p className="mt-5 text-sm font-medium text-ink">Against <span className="fig">1.d4</span></p>
          <TallyTable rows={r.replies.d4} label="Reply" render={moveCell('1…')} limit={4} empty="Never faced it here." />
          {r.replies.other.games > 0 && (
            <p className="mt-3 text-sm text-muted">
              Against anything else: {r.replies.other.games} games, {pct(r.replies.other.score)}.
            </p>
          )}
          <div className="mt-5">
            <TallyTable rows={r.blackOpenings} label="Opening" empty="No opening names in these games." />
          </div>
        </section>

        <section>
          <SectionHead title="How their games end" />
          <table className="mt-1 w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-muted">
                <th className="py-2 text-left font-normal" />
                <th className="py-2 text-right font-normal">They won</th>
                <th className="py-2 text-right font-normal">They lost</th>
                <th className="py-2 text-right font-normal">Drawn</th>
              </tr>
            </thead>
            <tbody>
              {r.endings.map((e) => (
                <tr key={e.key} className="border-t border-rule">
                  <td className="py-2 text-ink">{e.label}</td>
                  <td className="py-2 text-right font-mono text-muted">{e.wins || '·'}</td>
                  <td className="py-2 text-right font-mono text-ink">{e.losses || '·'}</td>
                  <td className="py-2 text-right font-mono text-muted">{e.draws || '·'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {r.clock.timed > 0
              ? `They got into time trouble in ${r.clock.trouble} of ${r.clock.timed} games with clock times (under a tenth of the starting clock).`
              : 'No clock times in these games.'}
            {r.clock.losses > 0 && ` ${r.clock.lossesOnTime} of ${r.clock.losses} losses were on time.`}
          </p>
        </section>

        <section>
          <SectionHead title="Recent games" />
          <table className="mt-1 w-full text-sm">
            <tbody>
              {r.games.slice(0, 10).map((g) => (
                <tr key={g.url} className="border-t border-rule first:border-t-0">
                  <td className="whitespace-nowrap py-2 pr-3 text-muted tabular-nums">{format(new Date(g.played_at), 'd MMM')}</td>
                  <td className="py-2 pr-3">
                    <span className={`mr-1.5 inline-block size-2.5 border align-middle ${g.color === 'white' ? 'border-stone-400 bg-white' : 'border-stone-900 bg-stone-900 dark:border-stone-500'}`} />
                    <span className="text-ink">vs {g.opponent}</span>
                    {g.opponent_rating ? <span className="ml-1.5 font-mono text-xs text-muted">{g.opponent_rating}</span> : null}
                  </td>
                  <td className={`py-2 pr-3 font-mono font-semibold ${RESULT_TEXT[g.result]}`}>{g.result === 'Win' ? 'W' : g.result === 'Loss' ? 'L' : 'D'}</td>
                  <td className="hidden max-w-[12rem] truncate py-2 pr-3 text-muted sm:table-cell" title={g.family ?? ''}>{g.family ?? '—'}</td>
                  <td className="py-2 text-right">
                    <a href={g.url} target="_blank" rel="noreferrer" className="link">View ↗</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Results are from their side.</p>
        </section>
      </div>
    </>
  );
}

export default function ScoutPage() {
  const [state, setState] = useState({ status: 'idle' });   // idle | loading | done | error

  const scout = async ({ platform, username, limit }) => {
    setState((s) => ({ ...s, status: 'loading', request: { platform, username } }));
    try {
      const res = await axios.get(`${API_BASE}/scout`, { params: { platform, username, limit } });
      setState({ status: 'done', data: res.data });
    } catch (err) {
      setState({ status: 'error', error: err.response?.data?.error || 'Could not reach the server.' });
    }
  };

  const data = state.status === 'done' ? state.data : null;
  const report = useMemo(() => (data?.games.length ? scoutReport(data.games) : null), [data]);
  const rating = report?.rating;

  return (
    <div>
      <div className="flex flex-col gap-8 pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-serif text-4xl font-semibold tracking-[-0.02em] text-ink md:text-5xl">
            {data ? data.username : 'Scout an opponent'}
          </h1>
          <p className="mt-2 text-muted">
            {data
              ? `${sourceLabel(data.platform)}${rating ? `, rated ${rating.latest} (${rating.low}–${rating.high} over these games)` : ''}. Nothing here is saved.`
              : 'See what someone plays and where they drop points before you face them. Their games are only looked at, never saved.'}
          </p>
        </div>
        <ScoutForm onScout={scout} busy={state.status === 'loading'} />
      </div>

      {state.status === 'error' && (
        <p className="border-l-2 border-red-600 pl-3 text-sm text-red-700 dark:text-red-400" role="alert">{state.error}</p>
      )}

      {state.status === 'loading' && (
        <div className="space-y-4 border-t border-rule pt-8" aria-live="polite">
          <p className="font-serif italic text-muted">Fetching {state.request.username}’s games from {sourceLabel(state.request.platform)}…</p>
          <div className="skeleton h-24" />
          <div className="skeleton h-48" />
        </div>
      )}

      {data && (report
        ? <Report report={report} />
        : <p className="py-16 text-center font-serif text-lg italic text-muted">No standard games found for {data.username}.</p>)}
    </div>
  );
}
