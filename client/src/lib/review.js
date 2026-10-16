import axios from 'axios';
import { API_URL } from './api';
import { gameFromPgn } from './chess';
import { analyseGame } from './evaluation';
import { findPuzzles, sideOf } from './insights';

// Saves a finished review. The server keeps it, so the game never has to be analysed again,
// and the tracked player's mistakes become training puzzles.
export function saveReview(match, { moves, fens, evals, best }) {
  const puzzles = match.player_color ? findPuzzles({ moves, fens, evals, best }, sideOf(match)) : [];
  return axios.put(`${API_URL}/${match.match_id}/analysis`, { evals, best_moves: best, puzzles });
}

export async function reviewGame(match, { signal, onProgress } = {}) {
  const game = gameFromPgn(match.pgn);
  const { evals, best } = await analyseGame(game.fens, { signal, onProgress });
  await saveReview(match, { ...game, evals, best });
  return { match_id: match.match_id, evals, best_moves: best };
}
