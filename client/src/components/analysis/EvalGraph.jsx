import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { useTheme } from '../../ThemeContext';
import { tooltipTheme } from '../../lib/chart';
import { evalToPawns, formatEval } from '../../lib/evaluation';
import { figurine } from '../../lib/chess';

const MARK_COLORS = { blunder: '#dc2626', mistake: '#ea580c', inaccuracy: '#d97706' };

// Vertical line at the ply currently shown on the board
const currentPlyPlugin = {
  id: 'currentPly',
  afterDatasetsDraw(chart, _args, opts) {
    const point = chart.getDatasetMeta(0).data[opts.index];
    if (!point) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(point.x, chartArea.top);
    ctx.lineTo(point.x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

export default function EvalGraph({ evals, classifications, moves, currentIndex, onSelect }) {
  const { theme } = useTheme();

  const data = useMemo(() => ({
    labels: evals.map((_, i) => i),
    datasets: [{
      data: evals.map((e) => evalToPawns(e)),
      borderColor: '#a8a29e',
      borderWidth: 1,
      tension: 0.2,
      fill: { target: 'origin', above: '#f4f2ee', below: 'transparent' },
      pointRadius: classifications.map((c) => (c === 'blunder' || c === 'mistake' ? 3 : 0)),
      pointBackgroundColor: classifications.map((c) => MARK_COLORS[c] ?? '#a8a29e'),
      pointBorderWidth: 0,
      pointHoverRadius: 4,
      spanGaps: true,
    }],
  }), [evals, classifications]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    onClick: (_evt, elements) => {
      if (elements[0]) onSelect(elements[0].index);
    },
    onHover: (evt, elements) => {
      evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
    },
    plugins: {
      legend: { display: false },
      currentPly: { index: currentIndex, color: '#ea580c' },
      tooltip: {
        ...tooltipTheme(theme.ui),
        callbacks: {
          title: ([item]) => {
            const ply = item.dataIndex;
            if (ply === 0) return 'Starting position';
            const move = moves[ply - 1];
            const moveNo = move.before.split(' ')[5];
            return `${moveNo}${move.color === 'w' ? '.' : '…'} ${figurine(move.san)}`;
          },
          label: (item) => {
            const tag = classifications[item.dataIndex];
            return `${formatEval(evals[item.dataIndex])}${tag ? `, ${tag}` : ''}`;
          },
        },
      },
    },
    scales: {
      x: { display: false },
      y: { display: false, min: -8, max: 8 },
    },
  };

  return (
    <div className="relative h-24 bg-[#3a3633]">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[#78716c]" />
      <Line data={data} options={options} plugins={[currentPlyPlugin]} />
    </div>
  );
}
