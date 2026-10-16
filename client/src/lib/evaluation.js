import { Chess } from 'chess.js';

// Stockfish reports scores from the side to move's point of view.
// Everything in the UI works with scores normalised to White's point of view:
//   { type: 'cp', val }              centipawns, positive = White better
//   { type: 'mate', val, winner }    val > 0 = White mates in val, val = 0 = checkmate on the board

// Aspiration-window fail lines ("lowerbound"/"upperbound") are not real evaluations
export const isExactScore = (line) => line.startsWith('info') && line.includes(' score ') && !/ (lower|upper)bound/.test(line);

export function parseScore(line) {
  const m = line.match(/score (cp|mate) (-?\d+)/);
  return m ? { type: m[1], val: parseInt(m[2], 10) } : null;
}

export function toWhitePov(score, fen) {
  if (!score) return null;
  const blackToMove = fen.split(' ')[1] === 'b';
  if (score.type === 'mate' && score.val === 0) {
    // The side to move has been checkmated
    return { type: 'mate', val: 0, winner: blackToMove ? 'white' : 'black' };
  }
  const val = blackToMove ? -score.val : score.val;
  if (score.type === 'mate') return { type: 'mate', val, winner: val > 0 ? 'white' : 'black' };
  return { type: 'cp', val };
}

// Lichess' winning-chances curve, in [-1, 1] from White's point of view
export function winChances(e) {
  if (!e) return 0;
  if (e.type === 'mate') return e.winner === 'white' ? 1 : -1;
  const cp = Math.max(-1000, Math.min(1000, e.val));
  return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
}

export function formatEval(e) {
  if (!e) return '–';
  if (e.type === 'mate') {
    if (e.val === 0) return e.winner === 'white' ? '1-0' : '0-1';
    return e.val > 0 ? `M${e.val}` : `-M${-e.val}`;
  }
  const pawns = e.val / 100;
  if (Math.abs(pawns) < 0.005) return '0.00';
  return pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
}

// Pawn value clamped for charting (mates pinned to the edge)
export function evalToPawns(e, cap = 8) {
  if (!e) return null;
  if (e.type === 'mate') return e.winner === 'white' ? cap : -cap;
  return Math.max(-cap, Math.min(cap, e.val / 100));
}

export const CLASSIFICATIONS = {
  blunder: { symbol: '??', label: 'Blunders', className: 'text-red-700 dark:text-red-400' },
  mistake: { symbol: '?', label: 'Mistakes', className: 'text-orange-700 dark:text-orange-400' },
  inaccuracy: { symbol: '?!', label: 'Inaccuracies', className: 'text-amber-700 dark:text-amber-400' },
};

// How much each move cost the player who made it, in winning chances. Indexed by ply.
export function moveDrops(evals, fens) {
  return evals.map((cur, ply) => {
    const prev = evals[ply - 1];
    if (ply === 0 || !prev || !cur) return 0;
    const whiteMoved = fens[ply - 1].split(' ')[1] === 'w';
    return whiteMoved ? winChances(prev) - winChances(cur) : winChances(cur) - winChances(prev);
  });
}

// Lichess-style move judgements based on the drop in the mover's winning chances.
// Returns an array indexed by ply (index 0 = starting position, always null).
export function classifyMoves(evals, fens) {
  return moveDrops(evals, fens).map((drop) => {
    if (drop >= 0.3) return 'blunder';
    if (drop >= 0.2) return 'mistake';
    if (drop >= 0.1) return 'inaccuracy';
    return null;
  });
}

// Shallow searches flatter the side to move (an odd/even "tempo" effect): with this engine the
// starting position reads about +1 with White to move and +0.4 a ply later. Consecutive quiet
// positions should score the same, so half their side-to-move sum estimates the bias.
function estimateTempoBias(evals, fens) {
  const samples = [];
  for (let i = 0; i + 1 < evals.length; i++) {
    const a = evals[i];
    const b = evals[i + 1];
    if (a?.type !== 'cp' || b?.type !== 'cp' || Math.abs(a.val) > 300 || Math.abs(b.val) > 300) continue;
    const stm = (e, fen) => (fen.split(' ')[1] === 'w' ? e.val : -e.val);
    samples.push((stm(a, fens[i]) + stm(b, fens[i + 1])) / 2);
  }
  if (samples.length < 6) return 0;
  samples.sort((x, y) => x - y);
  return Math.max(0, Math.min(100, samples[Math.floor(samples.length / 2)]));
}

function removeTempoBias(evals, fens, bias) {
  if (!bias) return evals;
  return evals.map((e, i) => {
    if (e?.type !== 'cp') return e;
    return { type: 'cp', val: Math.round(e.val + (fens[i].split(' ')[1] === 'w' ? -bias : bias)) };
  });
}

// Full-game analysis: a quick pass over every position, then deeper searches on the moves that
// look like mistakes, since a shallow search often misjudges sharp tactics.
// onProgress receives { phase: 'scan' | 'verify', done, total }.
// Resolves to { evals, best }: a White-POV score and the engine's best move (UCI) per position.
export async function analyseGame(fens, { onProgress, signal } = {}) {
  const { scores: raw, best } = await evaluatePositions(fens, {
    depth: 12,
    movetime: 800,
    signal,
    onProgress: (done, total) => onProgress?.({ phase: 'scan', done, total }),
  });
  const bias = estimateTempoBias(raw, fens);
  const verified = new Set();

  // Two rounds: a deeper eval can expose a new suspect move right next to a checked one
  for (const limit of [5, 3]) {
    const evals = removeTempoBias(raw, fens, bias);
    const suspects = moveDrops(evals, fens)
      .map((drop, ply) => ({ drop, ply }))
      .filter(({ drop, ply }) => drop >= 0.2 && !(verified.has(ply - 1) && verified.has(ply)))
      .sort((a, b) => b.drop - a.drop)
      .slice(0, limit);
    const indexes = [...new Set(suspects.flatMap(({ ply }) => [ply - 1, ply]))].filter((i) => !verified.has(i));
    if (indexes.length === 0) break;

    const deep = await evaluatePositions(indexes.map((i) => fens[i]), {
      depth: 18,
      movetime: 2500,
      signal,
      onProgress: (done, total) => onProgress?.({ phase: 'verify', done, total }),
    });
    indexes.forEach((i, k) => {
      if (deep.scores[k]) raw[i] = deep.scores[k];
      if (deep.best[k]) best[i] = deep.best[k];
      verified.add(i);
    });
  }

  return { evals: removeTempoBias(raw, fens, bias), best };
}

// This Stockfish build never answers `go` with `bestmove` when the game is already over,
// so terminal positions are scored here instead of being sent to the engine.
function terminalScore(fen) {
  const game = new Chess(fen);
  if (game.isCheckmate()) return { type: 'mate', val: 0, winner: game.turn() === 'w' ? 'black' : 'white' };
  if (game.isStalemate()) return { type: 'cp', val: 0 };
  return null;
}

// Evaluate every position on a dedicated Stockfish worker so live analysis is never disturbed.
// Resolves to { scores, best }, one entry per position (best is null where the game is over).
export function evaluatePositions(fens, { depth = 12, movetime = 800, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/stockfish.js');
    const results = new Array(fens.length).fill(null);
    const best = new Array(fens.length).fill(null);
    let idx = 0;
    let latest = null;

    const finish = (fn) => {
      worker.terminate();
      fn();
    };

    signal?.addEventListener('abort', () => finish(() => reject(new DOMException('Aborted', 'AbortError'))));

    const evalNext = () => {
      for (let terminal; idx < fens.length && (terminal = terminalScore(fens[idx])); idx++) {
        results[idx] = terminal;
      }
      if (idx >= fens.length) return finish(() => resolve({ scores: results, best }));
      onProgress?.(idx, fens.length);
      latest = null;
      worker.postMessage(`position fen ${fens[idx]}`);
      // Whichever limit is hit first ends the search, so long games stay quick
      worker.postMessage(`go depth ${depth} movetime ${movetime}`);
    };

    worker.onmessage = ({ data: line }) => {
      if (typeof line !== 'string') return;
      if (line === 'readyok') return evalNext();
      if (isExactScore(line)) {
        latest = parseScore(line);
      } else if (line.startsWith('bestmove')) {
        results[idx] = toWhitePov(latest, fens[idx]);
        const move = line.split(' ')[1];
        if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) best[idx] = move;
        idx++;
        evalNext();
      }
    };
    worker.onerror = (err) => finish(() => reject(err));

    worker.postMessage('uci');
    worker.postMessage('isready');
  });
}
