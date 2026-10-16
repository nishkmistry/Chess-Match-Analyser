import { parsePgnHeaders } from './chess';

// Clock data comes from the PGN's [%clk h:mm:ss] comments: Chess.com always includes them,
// Lichess when games are exported with clocks.

// "600" -> { base: 600, inc: 0 }, "180+2" -> { base: 180, inc: 2 }. Daily games ("1/86400") have no
// running clock worth analysing, so they return null.
export function parseTimeControl(tc) {
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tc || '');
  return m ? { base: Number(m[1]), inc: Number(m[2] || 0) } : null;
}

// Seconds on the mover's clock after each ply, or null unless every move has a clock comment
export function parseClocks(pgn, plies) {
  const movetext = (pgn || '').replace(/^\[.*\]\s*$/gm, '');
  const clocks = [...movetext.matchAll(/\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/g)]
    .map(([, h, m, s]) => Number(h) * 3600 + Number(m) * 60 + Number(s));
  return plies > 0 && clocks.length === plies ? clocks : null;
}

// Under a tenth of the starting clock counts as time trouble: 1:00 in a 10 minute game,
// never less than 10 seconds or more than 3 minutes
export const pressureThreshold = (base) => Math.min(180, Math.max(10, base * 0.1));

// Per ply: { left, spent, before, pressure }, where before is the mover's clock when they started
// thinking. Returns null for games without usable clock data.
export function moveTimes(pgn, plies) {
  const tc = parseTimeControl(parsePgnHeaders(pgn).TimeControl);
  const clocks = tc && parseClocks(pgn, plies);
  if (!clocks) return null;
  const threshold = pressureThreshold(tc.base);
  const times = clocks.map((left, i) => {
    const before = i >= 2 ? clocks[i - 2] : tc.base;
    return { left, before, spent: Math.max(0, before - left + tc.inc), pressure: before < threshold };
  });
  return { ...tc, threshold, times };
}

// 75 -> "1:15", 4.2 -> "4s", 3725 -> "1:02:05"
export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export function formatSpent(seconds) {
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1).replace(/\.0$/, '') : Math.round(seconds)}s`;
  return formatClock(seconds);
}
