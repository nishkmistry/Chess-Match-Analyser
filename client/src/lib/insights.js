import { Chess } from 'chess.js';
import { classifyMoves, evalToPawns, moveDrops, winChances } from './evaluation';
import { PHASES, gameFromPgn, gamePhase, openingFamily, openingName, parsePgnHeaders } from './chess';
import { moveTimes } from './clock';
import { playerColor } from './matches';

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ERROR_TAGS = new Set(['mistake', 'blunder']);

export const sideOf = (match) => (playerColor(match) === 'white' ? 'w' : 'b');

const playMove = (fen, uci) => {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
};

export const MOTIFS = {
  'missed-mate': 'Missed a forced mate',
  'allowed-mate': 'Walked into a mating attack',
  'lost-material': 'Let a piece be won',
  'missed-tactic': 'Missed a capture or check that won more',
  quiet: 'Quiet move that gave ground',
};

// What kind of mistake a move was, read from the engine's scores and best moves around it
function mistakeMotif(ply, { fens, evals, best }, side) {
  const me = side === 'w' ? 'white' : 'black';
  const them = side === 'w' ? 'black' : 'white';
  const mates = (e, who) => e?.type === 'mate' && e.winner === who;
  if (mates(evals[ply - 1], me) && !mates(evals[ply], me)) return 'missed-mate';
  if (mates(evals[ply], them) && !mates(evals[ply - 1], them)) return 'allowed-mate';

  const reply = best?.[ply] && playMove(fens[ply], best[ply]);
  if (reply?.captured && PIECE_VALUES[reply.captured] >= 3) return 'lost-material';

  const missed = best?.[ply - 1] && playMove(fens[ply - 1], best[ply - 1]);
  if (missed && ((missed.captured && PIECE_VALUES[missed.captured] >= 3) || /[+#]/.test(missed.san))) return 'missed-tactic';
  return 'quiet';
}

// One reviewed game from the tracked player's side: each of their moves with what it cost,
// the phase it was played in, and the clock
export function reviewFacts(match, analysis) {
  if (!match?.pgn || !match.player_color || !analysis?.evals) return null;
  let game;
  try {
    game = gameFromPgn(match.pgn);
  } catch {
    return null;
  }
  const { moves, fens } = game;
  const { evals, best_moves: best } = analysis;
  if (evals.length !== fens.length) return null;

  const side = sideOf(match);
  const drops = moveDrops(evals, fens);
  const tags = classifyMoves(evals, fens);
  const clock = moveTimes(match.pgn, moves.length);

  const mine = [];
  for (let ply = 1; ply < fens.length; ply++) {
    if (fens[ply - 1].split(' ')[1] !== side) continue;
    mine.push({
      ply,
      san: moves[ply - 1].san,
      moveNo: Number(fens[ply - 1].split(' ')[5]),
      phase: gamePhase(fens[ply - 1]),
      loss: Math.max(0, drops[ply]),
      tag: tags[ply],
      time: clock?.times[ply - 1] ?? null,
      motif: ERROR_TAGS.has(tags[ply]) ? mistakeMotif(ply, { fens, evals, best }, side) : null,
    });
  }

  // How the opening went: the score after move 12, from the player's side, in pawns
  const afterOpening = evals.length > 24 ? evals[24] : null;
  return {
    match,
    side,
    moves: mine,
    hasClock: Boolean(clock),
    openingEval: afterOpening ? evalToPawns(afterOpening) * (side === 'w' ? 1 : -1) : null,
  };
}

// Winning chances run from -1 to 1, so a drop of 0.1 is 5 percentage points of win probability
export const lossPct = (loss) => loss * 50;

export function phaseSummary(facts) {
  const rows = Object.fromEntries(PHASES.map((phase) => [phase, { phase, moves: 0, loss: 0, inaccuracy: 0, mistake: 0, blunder: 0 }]));
  for (const f of facts) {
    for (const m of f.moves) {
      const row = rows[m.phase];
      row.moves++;
      row.loss += m.loss;
      if (m.tag) row[m.tag]++;
    }
  }
  return PHASES.map((p) => ({ ...rows[p], avgLoss: rows[p].moves ? rows[p].loss / rows[p].moves : null }));
}

export const CLOCK_GROUPS = [
  { key: 'pressure', label: 'In time trouble', note: 'under a tenth of the starting clock' },
  { key: 'fast', label: 'Quick moves', note: 'after move 10, under a quarter of your usual time' },
  { key: 'long', label: 'Long thinks', note: 'three times your usual time or more' },
  { key: 'normal', label: 'Everything else', note: '' },
];

// move: { moveNo, time: { pressure, spent } }; avgSpent: the player's average time per move that game
export function clockGroup(move, avgSpent) {
  const { pressure, spent } = move.time;
  if (pressure) return 'pressure';
  if (move.moveNo > 10 && spent < Math.max(1, avgSpent * 0.25)) return 'fast';
  if (spent >= Math.max(10, avgSpent * 3)) return 'long';
  return 'normal';
}

// Mistakes and blunders split by the state of the clock, from games with clock data
export function clockSummary(facts) {
  const timed = facts.filter((f) => f.hasClock);
  const groups = Object.fromEntries(CLOCK_GROUPS.map((g) => [g.key, { ...g, moves: 0, errors: 0 }]));
  let moves = 0;
  let errors = 0;
  for (const f of timed) {
    const avgSpent = f.moves.reduce((sum, m) => sum + m.time.spent, 0) / (f.moves.length || 1);
    for (const m of f.moves) {
      const g = groups[clockGroup(m, avgSpent)];
      const isError = ERROR_TAGS.has(m.tag);
      g.moves++;
      moves++;
      if (isError) {
        g.errors++;
        errors++;
      }
    }
  }
  const rows = CLOCK_GROUPS.map(({ key }) => {
    const g = groups[key];
    return {
      ...g,
      moveShare: moves ? g.moves / moves : 0,
      errorShare: errors ? g.errors / errors : 0,
      rate: g.moves ? (g.errors / g.moves) * 100 : null,
    };
  });
  return { games: timed.length, moves, errors, rows };
}

const resultPoints = (result) => (result === 'Win' ? 1 : result === 'Draw' ? 0.5 : 0);

// Score per opening family and colour over every game, plus how the reviewed ones stood after move 12
export function openingSummary(matches, factsById) {
  const groups = new Map();
  for (const m of matches) {
    if (!m.pgn || !m.player_color) continue;
    const family = openingFamily(openingName(parsePgnHeaders(m.pgn)));
    if (!family) continue;
    const color = playerColor(m);
    const key = `${family}|${color}`;
    const g = groups.get(key) ?? { key, family, color, games: 0, points: 0, evals: [] };
    g.games++;
    g.points += resultPoints(m.result);
    const openingEval = factsById[m.match_id]?.openingEval;
    if (openingEval !== null && openingEval !== undefined) g.evals.push(openingEval);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      score: g.points / g.games,
      avgEval: g.evals.length ? g.evals.reduce((a, b) => a + b, 0) / g.evals.length : null,
    }))
    .sort((a, b) => b.games - a.games || a.family.localeCompare(b.family));
}

export function motifSummary(facts) {
  const rows = Object.fromEntries(Object.entries(MOTIFS).map(([motif, label]) => [motif, { motif, label, count: 0, examples: [] }]));
  for (const f of facts) {
    for (const m of f.moves) {
      if (!m.motif) continue;
      rows[m.motif].count++;
      rows[m.motif].examples.push({ match: f.match, ply: m.ply, san: m.san, moveNo: m.moveNo, side: f.side, loss: m.loss });
    }
  }
  return Object.values(rows)
    .filter((r) => r.count)
    .map((r) => ({ ...r, examples: r.examples.sort((a, b) => b.loss - a.loss).slice(0, 3) }))
    .sort((a, b) => b.count - a.count);
}

// Positions where the tracked player went wrong and the engine knows a better move: the training deck
export function findPuzzles({ moves, fens, evals, best }, side) {
  const drops = moveDrops(evals, fens);
  const sign = side === 'w' ? 1 : -1;
  const out = [];
  for (let ply = 1; ply < fens.length; ply++) {
    const fen = fens[ply - 1];
    const solution = best?.[ply - 1];
    if (fen.split(' ')[1] !== side || drops[ply] < 0.2 || !solution || solution === moves[ply - 1].lan) continue;
    // Already lost before the move: there's nothing left to find
    if (winChances(evals[ply - 1]) * sign < -0.6) continue;
    const move = playMove(fen, solution);
    if (!move) continue;
    out.push({
      ply,
      fen,
      played_san: moves[ply - 1].san,
      solution_uci: solution,
      solution_san: move.san,
      win_chance_loss: Math.round(drops[ply] * 1000) / 1000,
    });
  }
  return out.sort((a, b) => b.win_chance_loss - a.win_chance_loss).slice(0, 8);
}
