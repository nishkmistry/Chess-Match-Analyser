export const playerColor = (m) => (m.player_color === 'black' ? 'black' : 'white');
export const opponentColor = (m) => (playerColor(m) === 'white' ? 'black' : 'white');

export const playerRating = (m) => m[`${playerColor(m)}_elo`] || null;
export const opponentRating = (m) => m[`${opponentColor(m)}_elo`] || null;
export const opponentName = (m) => m[`${opponentColor(m)}_username`] || 'Unknown';

export const sourceLabel = (source) => (source === 'lichess' ? 'Lichess' : 'Chess.com');

// Ratings only make sense within one account on one platform
export const accountKey = (m) => `${m.source || 'chess.com'}:${(m.tracked_username || '').toLowerCase()}`;

// Every imported account, most games first
export function listAccounts(matches) {
  const accounts = new Map();
  for (const m of matches) {
    if (!m.tracked_username) continue;
    const key = accountKey(m);
    const a = accounts.get(key) ?? { key, username: m.tracked_username, source: m.source || 'chess.com', label: `${m.tracked_username} on ${sourceLabel(m.source)}`, games: 0 };
    a.games++;
    accounts.set(key, a);
  }
  return [...accounts.values()].sort((a, b) => b.games - a.games);
}

// The account a page is about: the chosen one if it still exists, else the one with most games
export function resolveAccount(accounts, chosen) {
  if (chosen === 'all') return 'all';
  return accounts.find((a) => a.key === chosen)?.key ?? accounts[0]?.key ?? 'all';
}

export const inAccount = (matches, key) => (key === 'all' ? matches : matches.filter((m) => accountKey(m) === key));

// Colour for the tracked player's outcome
export const RESULT_TEXT = {
  Win: 'text-green-700 dark:text-green-400',
  Draw: 'text-muted',
  Loss: 'text-red-700 dark:text-red-400',
};

export const RESULT_HEX = { Win: '#15803d', Draw: '#a8a29e', Loss: '#b91c1c' };

// The game result as printed on a scoresheet: 1–0, ½–½, 0–1
export function scoreLine(m) {
  if (m.result === 'Draw') return '½–½';
  if (m.result !== 'Win' && m.result !== 'Loss') return '–';
  const whiteWon = (m.result === 'Win') === (playerColor(m) === 'white');
  return whiteWon ? '1–0' : '0–1';
}

export function tallyResults(matches) {
  const tally = { Win: 0, Draw: 0, Loss: 0, total: matches.length };
  for (const m of matches) if (tally[m.result] !== undefined) tally[m.result]++;
  return tally;
}

// Chess scoring: a draw is half a point. 26.5 -> "26½"
export function points(tally) {
  const p = tally.Win + tally.Draw / 2;
  const whole = Math.floor(p);
  return p % 1 ? `${whole || ''}½` : `${whole}`;
}

export const scorePct = (tally) => (tally.total ? Math.round(((tally.Win + tally.Draw / 2) / tally.total) * 100) : 0);
