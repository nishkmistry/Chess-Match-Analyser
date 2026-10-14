import { useEffect, useMemo, useRef } from 'react';
import { CLASSIFICATIONS } from '../../lib/evaluation';
import { figurine } from '../../lib/chess';

export default function MoveList({ moves, classifications, currentIndex, onSelect }) {
  const containerRef = useRef(null);
  const activeRef = useRef(null);

  const rows = useMemo(() => {
    const out = [];
    moves.forEach((m, i) => {
      if (m.color === 'w' || out.length === 0) out.push({ num: m.before.split(' ')[5], white: null, black: null });
      out[out.length - 1][m.color === 'w' ? 'white' : 'black'] = { san: m.san, ply: i + 1 };
    });
    return out;
  }, [moves]);

  // Keep the current move visible without scrolling the whole page
  useEffect(() => {
    const box = containerRef.current;
    const el = activeRef.current;
    if (!box || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < box.scrollTop + 4) box.scrollTo({ top: top - 32, behavior: 'smooth' });
    else if (bottom > box.scrollTop + box.clientHeight - 4) box.scrollTo({ top: bottom - box.clientHeight + 32, behavior: 'smooth' });
  }, [currentIndex]);

  const renderMove = (move) => {
    if (!move) return <span className="px-2 text-muted">…</span>;
    const active = move.ply === currentIndex;
    const tag = CLASSIFICATIONS[classifications[move.ply]];
    return (
      <button
        ref={active ? activeRef : undefined}
        type="button"
        onClick={() => onSelect(move.ply)}
        className={`fig flex items-baseline gap-0.5 rounded-[2px] px-2 py-[3px] text-left transition cursor-pointer
          ${active ? 'bg-ink text-paper' : 'text-ink hover:bg-wash'}`}
      >
        {figurine(move.san)}
        {tag && <span className={`text-[13px] font-semibold ${active ? '' : tag.className}`}>{tag.symbol}</span>}
      </button>
    );
  };

  if (moves.length === 0) return <p className="py-4 text-sm text-muted">No moves in this game.</p>;

  return (
    <div ref={containerRef} className="scroll-thin relative max-h-80 overflow-y-auto">
      <div className="grid grid-cols-[2.5rem_1fr_1fr] text-[14px]">
        {rows.map((row) => (
          <div key={row.num} className="contents">
            <span className="mr-1 bg-wash py-[3px] pr-2 text-right font-mono text-xs leading-6 text-muted tabular-nums">{row.num}</span>
            {renderMove(row.white)}
            {renderMove(row.black)}
          </div>
        ))}
      </div>
    </div>
  );
}
