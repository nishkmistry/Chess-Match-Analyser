import { Chess } from 'chess.js';

export function parsePgnHeaders(pgn = '') {
  const headers = {};
  for (const [, key, value] of pgn.matchAll(/^\[(\w+) "(.*)"\]$/gm)) headers[key] = value;
  return headers;
}

// Lichess provides [Opening]; Chess.com only provides an [ECOUrl] slug
export function openingName(headers) {
  if (headers.Opening) return headers.Opening;
  const slug = headers.ECOUrl?.split('/').pop();
  if (!slug) return null;
  return decodeURIComponent(slug).replace(/-/g, ' ').replace(/\s+(\d+\.)/, ': $1');
}

// Groups variations under their family, so Chess.com's "Ruy Lopez Opening Morphy Defense Closed..."
// and Lichess' "Ruy Lopez: Morphy Defense" can be counted together
const FAMILY_ENDS = new Set(['Opening', 'Defense', 'Defence', 'Game', 'Attack', 'System', 'Gambit']);
export function openingFamily(name) {
  if (!name) return null;
  const words = name.split(':')[0].replace(/['’]/g, '').trim().split(/\s+/);
  const end = words.findIndex((w, i) => i > 0 && FAMILY_ENDS.has(w));
  if (end === -1) return words.slice(0, 3).join(' ');
  const next = words[end + 1];
  return words.slice(0, end + (next === 'Accepted' || next === 'Declined' ? 2 : 1)).join(' ');
}

// All SAN moves straight from the movetext, without replaying the game
export function sanMoves(pgn = '') {
  return pgn
    .replace(/^\[.*\]\s*$/gm, '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !/^\d+\.+$/.test(t) && !/^\$\d+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}

// Verbose moves plus the FEN before the first move and after every move
export function gameFromPgn(pgn) {
  const game = new Chess();
  game.loadPgn(pgn);
  const moves = game.history({ verbose: true });
  // `before`/`after` FENs also handle games that start from a custom position
  const fens = moves.length ? [moves[0].before, ...moves.map((m) => m.after)] : [game.fen()];
  return { moves, fens };
}

// Endgame once the pieces (not pawns) on the board are worth 26 or less, e.g. a rook and two minors each
const PIECE_POINTS = { n: 3, b: 3, r: 5, q: 9 };
export const PHASES = ['opening', 'middlegame', 'endgame'];
export function gamePhase(fen) {
  const [board, , , , , fullmove] = fen.split(' ');
  let material = 0;
  for (const ch of board) material += PIECE_POINTS[ch.toLowerCase()] ?? 0;
  if (material <= 26) return 'endgame';
  return Number(fullmove) <= 12 ? 'opening' : 'middlegame';
}

// "600" -> "10 min", "180+2" -> "3+2", "1/86400" -> "1 day"
export function formatTimeControl(tc) {
  if (!tc || tc === '-') return null;
  if (tc.includes('/')) {
    const days = Math.round(parseInt(tc.split('/')[1], 10) / 86400);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  const [base, inc] = tc.split('+').map(Number);
  if (Number.isNaN(base)) return tc;
  const minutes = base / 60;
  const label = Number.isInteger(minutes) ? minutes : minutes.toFixed(1);
  return inc ? `${label}+${inc}` : `${label} min`;
}

// Number of full moves in a PGN's movetext (ignores headers and {comments})
export function moveCount(pgn = '') {
  const movetext = pgn.replace(/^\[.*\]$/gm, '').replace(/\{[^}]*\}/g, '');
  let max = 0;
  for (const [, n] of movetext.matchAll(/(\d+)\./g)) max = Math.max(max, Number(n));
  return max;
}

// Book-style figurine notation: Nf3 -> ♘f3
const FIGURINES = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };
export const figurine = (san = '') => san.replace(/[KQRBN]/g, (c) => FIGURINES[c]);

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Positive = White is up material
export function materialBalance(fen) {
  let balance = 0;
  for (const ch of fen.split(' ')[0]) {
    const value = PIECE_VALUES[ch.toLowerCase()];
    if (value === undefined) continue;
    balance += ch === ch.toUpperCase() ? value : -value;
  }
  return balance;
}

// Convert a UCI principal variation into SAN moves, stopping at the first illegal move
export function pvToSan(fen, pv, max = 8) {
  const game = new Chess(fen);
  const out = [];
  for (const uci of pv.slice(0, max)) {
    try {
      out.push(game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }));
    } catch {
      break;
    }
  }
  return out;
}

// "14. ♘f3 ♘c6 15. d4" / "14… ♘c6 15. d4"
export function formatLine(moves) {
  return moves.map((m, i) => {
    const moveNo = m.before.split(' ')[5];
    if (m.color === 'w') return `${moveNo}. ${figurine(m.san)}`;
    return i === 0 ? `${moveNo}… ${figurine(m.san)}` : figurine(m.san);
  }).join(' ');
}

export function gameStatus(fen) {
  const game = new Chess(fen);
  if (game.isCheckmate()) return game.turn() === 'w' ? 'Checkmate · Black wins' : 'Checkmate · White wins';
  if (game.isStalemate()) return 'Stalemate';
  if (game.isInsufficientMaterial()) return 'Draw · insufficient material';
  return null;
}
