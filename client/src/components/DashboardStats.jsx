import React, { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { format } from 'date-fns';
import { useTheme } from '../ThemeContext';
import { tooltipTheme } from '../lib/chart';
import {
  RESULT_HEX, accountKey, opponentName, opponentRating, playerColor, playerRating, points, scorePct, sourceLabel, tallyResults,
} from '../lib/matches';

function Signed({ value }) {
  if (!value) return <span>±0</span>;
  return (
    <span className={value > 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
      {value > 0 ? `+${value}` : `−${Math.abs(value)}`}
    </span>
  );
}

// "+23 =7 −12", the usual way to write a win/draw/loss record
export function Record({ tally }) {
  return (
    <span className="font-mono text-[13px] tabular-nums">
      +{tally.Win} ={tally.Draw} −{tally.Loss}
    </span>
  );
}

export function StatStrip({ matches, loading }) {
  const stats = useMemo(() => {
    const tally = tallyResults(matches);
    const latest = matches[0];
    const account = latest ? matches.filter((m) => accountKey(m) === accountKey(latest) && playerRating(m)) : [];
    const current = latest ? playerRating(latest) : null;
    const lookback = account.slice(0, 10);
    const past = lookback.length > 1 ? playerRating(lookback[lookback.length - 1]) : null;
    const bestWin = matches
      .filter((m) => m.result === 'Win' && opponentRating(m))
      .reduce((best, m) => (!best || opponentRating(m) > opponentRating(best) ? m : best), null);
    const lichess = matches.filter((m) => m.source === 'lichess').length;
    return {
      tally, latest, current, bestWin, lichess,
      delta: current && past ? current - past : null,
      lookback: lookback.length,
      chessCom: matches.length - lichess,
    };
  }, [matches]);

  const { tally, latest, current, bestWin, delta, lookback, chessCom, lichess } = stats;

  const items = [
    {
      label: 'Games',
      value: tally.total,
      sub: `${chessCom} Chess.com, ${lichess} Lichess`,
    },
    {
      label: 'Score',
      value: <>{points(tally)}<span className="text-2xl text-muted">/{tally.total}</span></>,
      sub: <><Record tally={tally} /> · {scorePct(tally)}%</>,
    },
    {
      label: 'Rating',
      value: current ?? '—',
      sub: !latest
        ? 'No games yet'
        : delta === null
          ? `${sourceLabel(latest.source)}`
          : <><Signed value={delta} /> over the last {lookback} games</>,
    },
    {
      label: 'Best win',
      value: bestWin ? opponentRating(bestWin) : '—',
      sub: bestWin ? `${opponentName(bestWin)}, ${format(new Date(bestWin.played_at), 'd MMM yyyy')}` : 'No wins yet',
    },
  ];

  return (
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
          <dd className="mt-1 font-serif text-[2.6rem] font-medium leading-none tracking-[-0.02em] text-ink tabular-nums">
            {loading ? <span className="skeleton inline-block h-9 w-20" /> : item.value}
          </dd>
          <dd className="mt-2 text-sm text-muted md:truncate">
            {loading ? <span className="skeleton inline-block h-3.5 w-28" /> : item.sub}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const RANGES = [
  { value: 30, label: 'Last 30' },
  { value: 100, label: '100' },
  { value: 0, label: 'All' },
];

// Prints the latest rating at the end of the line
const endLabelPlugin = {
  id: 'endLabel',
  afterDatasetsDraw(chart, _args, opts) {
    const points = chart.getDatasetMeta(0).data;
    const last = points[points.length - 1];
    if (!last) return;
    const { ctx } = chart;
    ctx.save();
    ctx.fillStyle = opts.color;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "600 12px 'IBM Plex Mono', monospace";
    ctx.textBaseline = 'middle';
    ctx.fillText(chart.data.datasets[0].data[points.length - 1], last.x + 8, last.y);
    ctx.restore();
  },
};

export function RatingChart({ matches, loading }) {
  const { theme } = useTheme();
  const ui = theme.ui;
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [range, setRange] = useState(30);

  const accounts = useMemo(() => {
    const seen = new Map();
    for (const m of matches) {
      const key = accountKey(m);
      if (!seen.has(key)) seen.set(key, { key, label: `${m.tracked_username || 'Unknown'} on ${sourceLabel(m.source)}` });
    }
    return [...seen.values()];
  }, [matches]);

  const activeKey = accounts.some((a) => a.key === selectedAccount) ? selectedAccount : accounts[0]?.key;

  const series = useMemo(() => {
    const games = matches.filter((m) => accountKey(m) === activeKey && playerRating(m));
    return (range ? games.slice(0, range) : games).reverse();
  }, [matches, activeKey, range]);

  const ratings = series.map(playerRating);
  const peak = ratings.length ? Math.max(...ratings) : null;
  const low = ratings.length ? Math.min(...ratings) : null;

  const data = {
    labels: series.map((m) => format(new Date(m.played_at), 'd MMM')),
    datasets: [{
      data: ratings,
      borderColor: ui.primary,
      borderWidth: 1.75,
      tension: 0.15,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBackgroundColor: series.map((m) => RESULT_HEX[m.result] ?? ui.primary),
      pointHoverBorderWidth: 0,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { right: 44, top: 8 } },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      endLabel: { color: ui.text },
      tooltip: {
        ...tooltipTheme(ui),
        callbacks: {
          title: ([item]) => {
            const m = series[item.dataIndex];
            return `${m.result} vs ${opponentName(m)}${opponentRating(m) ? ` (${opponentRating(m)})` : ''}`;
          },
          label: (item) => `${item.raw} · ${format(new Date(series[item.dataIndex].played_at), 'd MMM yyyy')}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: ui.border },
        ticks: { color: ui.textMuted, maxTicksLimit: 6, maxRotation: 0, font: { size: 11, family: "'IBM Plex Mono', monospace" } },
      },
      y: {
        position: 'left',
        grid: { color: ui.border, tickBorderDash: [2, 3] },
        border: { display: false, dash: [2, 3] },
        ticks: { color: ui.textMuted, maxTicksLimit: 5, precision: 0, font: { size: 11, family: "'IBM Plex Mono', monospace" } },
      },
    },
  };

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 border-b border-rule pb-3">
        <h2 className="section-title">Rating</h2>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
          {accounts.length > 1 && (
            <select
              value={activeKey}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="cursor-pointer border-none bg-transparent p-0 text-sm text-ink outline-none focus-visible:underline"
              aria-label="Account"
            >
              {accounts.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          )}
          <div className="tabs" role="group" aria-label="Number of games">
            {RANGES.map((r) => (
              <button key={r.label} type="button" aria-pressed={range === r.value} onClick={() => setRange(r.value)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {series.length > 1 && (
        <p className="mt-3 font-mono text-[13px] text-muted tabular-nums">
          high {peak} · low {low} · <Signed value={ratings[ratings.length - 1] - ratings[0]} /> across {series.length} games
        </p>
      )}

      <div className="relative mt-4 h-64">
        {loading ? (
          <div className="skeleton absolute inset-0" />
        ) : series.length < 2 ? (
          <p className="pt-16 text-center text-sm text-muted">A rating line appears once there are at least two rated games.</p>
        ) : (
          <Line data={data} options={options} plugins={[endLabelPlugin]} />
        )}
      </div>
    </section>
  );
}

export function ResultsByColor({ matches, loading }) {
  const rows = ['white', 'black'].map((color) => ({
    color,
    tally: tallyResults(matches.filter((m) => playerColor(m) === color)),
  }));

  return (
    <section>
      <h2 className="section-title border-b border-rule pb-3">By colour</h2>
      <table className="mt-1 w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-2.5 font-normal" />
            <th className="py-2.5 text-right font-normal">Games</th>
            <th className="py-2.5 text-right font-normal">Record</th>
            <th className="py-2.5 text-right font-normal">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ color, tally }) => (
            <React.Fragment key={color}>
              <tr className="border-t border-rule">
                <td className="pt-3 font-medium text-ink">
                  <span className="flex items-center gap-2">
                    <span className={`size-3 border ${color === 'white' ? 'border-stone-400 bg-white' : 'border-stone-900 bg-stone-900 dark:border-stone-500'}`} />
                    {color === 'white' ? 'White' : 'Black'}
                  </span>
                </td>
                <td className="pt-3 text-right text-muted">{loading ? '…' : tally.total}</td>
                <td className="pt-3 text-right text-muted">{loading ? '…' : <Record tally={tally} />}</td>
                <td className="pt-3 text-right font-semibold text-ink">{loading ? '…' : `${scorePct(tally)}%`}</td>
              </tr>
              <tr>
                <td colSpan={4} className="pb-3 pt-2">
                  <div className="flex h-1 gap-px bg-wash">
                    {tally.total > 0 && ['Win', 'Draw', 'Loss'].map((r) => (
                      <div key={r} style={{ width: `${(tally[r] / tally.total) * 100}%`, background: RESULT_HEX[r] }} />
                    ))}
                  </div>
                </td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Score counts a draw as half a point. The bar shows wins, draws and losses in that order.
      </p>
    </section>
  );
}
