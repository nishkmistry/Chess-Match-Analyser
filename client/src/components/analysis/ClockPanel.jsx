import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { useTheme } from '../../ThemeContext';
import { tooltipTheme } from '../../lib/chart';
import { figurine } from '../../lib/chess';
import { formatClock, formatSpent } from '../../lib/clock';
import { clockGroup } from '../../lib/insights';

const MARK_COLORS = { blunder: '#dc2626', mistake: '#ea580c', inaccuracy: '#d97706' };

// Dashed line where time trouble starts
const thresholdPlugin = {
  id: 'threshold',
  afterDatasetsDraw(chart, _args, opts) {
    const y = chart.scales.y.getPixelForValue(opts.value);
    const { ctx, chartArea } = chart;
    if (y < chartArea.top || y > chartArea.bottom) return;
    ctx.save();
    ctx.strokeStyle = opts.color;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = opts.color;
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('time trouble', chartArea.right, y - 2);
    ctx.restore();
  },
};

const currentPlyPlugin = {
  id: 'currentPly',
  afterDatasetsDraw(chart, _args, opts) {
    const x = chart.scales.x.getPixelForValue(opts.index);
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

// Axis steps that read naturally on a clock: 2:30, 5:00, 7:30 rather than 3:20, 6:40
const CLOCK_STEPS = [5, 10, 15, 20, 30, 60, 90, 120, 150, 180, 300, 600, 900, 1200, 1800, 3600];

const moveLabel = (move) => `${move.before.split(' ')[5]}${move.color === 'w' ? '.' : '…'} ${figurine(move.san)}`;

const PACE = [
  ['pressure', 'in time trouble'],
  ['fast', 'on a quick move with time in hand'],
  ['long', 'after a long think'],
  ['normal', 'at a normal pace'],
];

function errorSentence({ total, groups }) {
  if (total === 0) return 'No mistakes or blunders from you this game.';
  const parts = PACE.filter(([key]) => groups[key].length).map(([key, label]) => [groups[key].length, label]);
  if (total === 1) return `Your one mistake came ${parts[0][1]}.`;
  return `Of your ${total} mistakes and blunders, ${parts.map(([n, label]) => `${n} came ${label}`).join(', ')}.`;
}

function sideStats(clock, moves, side) {
  const mine = clock.times
    .map((t, i) => ({ ...t, ply: i + 1, move: moves[i] }))
    .filter((t) => t.move.color === side);
  if (mine.length === 0) return null;
  const longest = mine.reduce((a, b) => (b.spent > a.spent ? b : a));
  return {
    moves: mine,
    avg: mine.reduce((sum, t) => sum + t.spent, 0) / mine.length,
    longest,
    troubleFrom: mine.find((t) => t.pressure) ?? null,
    left: mine[mine.length - 1].left,
  };
}

export default function ClockPanel({ clock, moves, classifications, currentIndex, onSelect, white, black, you }) {
  const { theme } = useTheme();
  const ui = theme.ui;

  const stats = useMemo(() => ({ w: sideStats(clock, moves, 'w'), b: sideStats(clock, moves, 'b') }), [clock, moves]);

  // Where the tracked player's mistakes and blunders happened on the clock
  const yourErrors = useMemo(() => {
    const s = you && stats[you];
    if (!s || classifications.length === 0) return null;
    const errors = s.moves.filter((t) => classifications[t.ply] === 'mistake' || classifications[t.ply] === 'blunder');
    const groups = { pressure: [], fast: [], long: [], normal: [] };
    for (const t of errors) {
      groups[clockGroup({ moveNo: Number(t.move.before.split(' ')[5]), time: t }, s.avg)].push(t);
    }
    return { total: errors.length, groups };
  }, [stats, you, classifications]);

  const colors = {
    w: you === 'w' ? ui.primary : ui.textMuted,
    b: you === 'b' ? ui.primary : ui.textMuted,
  };

  const series = (side) => [clock.base, ...clock.times.map((t, i) => (moves[i].color === side ? t.left : null))];
  const marks = (side) => [null, ...moves.map((m, i) => (m.color === side ? classifications[i + 1] : null))];

  const datasets = ['w', 'b'].map((side) => {
    const tags = marks(side);
    return {
      data: series(side),
      borderColor: colors[side],
      borderWidth: you === side ? 1.75 : 1.25,
      tension: 0,
      spanGaps: true,
      pointRadius: tags.map((t) => (t === 'blunder' || t === 'mistake' ? 3.5 : 0)),
      pointBackgroundColor: tags.map((t) => MARK_COLORS[t] ?? colors[side]),
      pointBorderWidth: 0,
      pointHoverRadius: 3,
    };
  });

  const top = Math.max(clock.base, ...clock.times.map((t) => t.left));
  const step = CLOCK_STEPS.find((s) => s >= top / 4) ?? 3600;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    layout: { padding: { top: 6 } },
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
    onClick: (_evt, elements) => {
      if (elements[0]) onSelect(elements[0].index);
    },
    onHover: (evt, elements) => {
      evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
    },
    plugins: {
      legend: { display: false },
      threshold: { value: clock.threshold, color: '#c2410c' },
      currentPly: { index: currentIndex, color: '#ea580c' },
      tooltip: {
        ...tooltipTheme(ui),
        callbacks: {
          title: ([item]) => (item.dataIndex === 0 ? 'Start' : moveLabel(moves[item.dataIndex - 1])),
          label: (item) => {
            const t = clock.times[item.dataIndex - 1];
            if (!t) return `${formatClock(clock.base)} each`;
            const tag = classifications[item.dataIndex];
            return `${formatClock(t.left)} left · ${formatSpent(t.spent)} on this move${tag ? ` · ${tag}` : ''}`;
          },
        },
      },
    },
    scales: {
      x: { display: false },
      y: {
        min: 0,
        max: Math.ceil(top / step) * step,
        grid: { color: ui.border, tickBorderDash: [2, 3] },
        border: { display: false },
        ticks: {
          color: ui.textMuted,
          stepSize: step,
          callback: (v) => formatClock(v),
          font: { size: 11, family: "'IBM Plex Mono', monospace" },
        },
      },
    },
  };

  // One label per ply; each side's line has gaps on the other side's plies, bridged by spanGaps
  const data = {
    labels: Array.from({ length: moves.length + 1 }, (_, i) => i),
    datasets,
  };

  const rows = [['w', white], ['b', black]].filter(([side]) => stats[side]);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-2">
        <h2 className="section-title">Clock</h2>
        <span className="flex items-center gap-4 text-xs text-muted">
          {rows.map(([side, name]) => (
            <span key={side} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: colors[side] }} />
              {name}
            </span>
          ))}
        </span>
      </div>

      <div className="relative mt-3 h-36">
        <Line data={data} options={options} plugins={[thresholdPlugin, currentPlyPlugin]} />
      </div>

      <table className="mt-3 w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-muted">
            <th className="py-1.5 text-left font-normal" />
            <th className="py-1.5 text-right font-normal">Per move</th>
            <th className="py-1.5 text-right font-normal">Longest think</th>
            <th className="hidden py-1.5 text-right font-normal sm:table-cell">Time trouble from</th>
            <th className="py-1.5 text-right font-normal">Left</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([side, name]) => {
            const s = stats[side];
            return (
              <tr key={side} className="border-t border-rule">
                <td className="py-2 pr-3">
                  <span className={`block max-w-[9rem] truncate ${you === side ? 'font-semibold text-ink' : 'text-ink'}`} title={name}>{name}</span>
                </td>
                <td className="py-2 text-right font-mono text-muted">{formatSpent(s.avg)}</td>
                <td className="py-2 text-right font-mono">
                  <button type="button" onClick={() => onSelect(s.longest.ply)} className="link fig text-[13px]" title="Show this position">
                    {formatSpent(s.longest.spent)} · {moveLabel(s.longest.move)}
                  </button>
                </td>
                <td className="hidden py-2 text-right font-mono sm:table-cell">
                  {s.troubleFrom ? (
                    <button type="button" onClick={() => onSelect(s.troubleFrom.ply)} className="link fig text-[13px]" title="Show this position">
                      {moveLabel(s.troubleFrom.move)}
                    </button>
                  ) : <span className="text-muted">never</span>}
                </td>
                <td className="py-2 text-right font-mono text-muted">{formatClock(s.left)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {yourErrors && (
        <p className="mt-3 font-serif text-[16px] leading-[1.55] text-ink">{errorSentence(yourErrors)}</p>
      )}
      <p className="mt-2 text-xs text-muted">
        Time trouble starts under {formatClock(clock.threshold)}, a tenth of the starting clock. Dots mark mistakes and blunders; click to jump there.
      </p>
    </section>
  );
}
