import { figurine, openingFamily, openingName, parsePgnHeaders, sanMoves } from './chess';
import { moveTimes } from './clock';

const resultPoints = (result) => (result === 'Win' ? 1 : result === 'Draw' ? 0.5 : 0);
const pct = (x) => `${Math.round(x * 100)}%`;

export function tally(games) {
  const t = { games: games.length, points: 0, Win: 0, Draw: 0, Loss: 0 };
  for (const g of games) {
    t.points += resultPoints(g.result);
    t[g.result]++;
  }
  return { ...t, score: t.games ? t.points / t.games : null };
}

function tallyBy(games, keyFn) {
  const groups = new Map();
  for (const g of games) {
    const key = keyFn(g);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), g]);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, ...tally(list) }))
    .sort((a, b) => b.games - a.games || b.score - a.score);
}

const isBlacksChoice = (family) => /\b(Defense|Defence|Accepted|Declined)$/.test(family);

const mostCommon = (values) => tallyBy(values.map((v) => ({ v, result: 'Draw' })), (x) => x.v)[0]?.key ?? null;

export const ENDINGS = [
  { key: 'checkmate', label: 'Checkmate' },
  { key: 'resignation', label: 'Resignation' },
  { key: 'time', label: 'On time' },
  { key: 'abandoned', label: 'Abandoned' },
  { key: 'draw', label: 'Drawn' },
  { key: 'other', label: 'Other' },
];

// Short, data-backed preparation advice. Each note needs enough games behind it to mean something.
function prepNotes(r) {
  const notes = [];
  const { white, black } = r.byColor;

  const top = r.whiteFirstMoves[0];
  if (top && white.games >= 3) {
    notes.push(`Opens 1.${figurine(top.key)} in ${pct(top.games / white.games)} of their White games (${top.games} of ${white.games}).`);
  }

  const openings = [
    ...r.whiteOpenings.map((o) => ({ ...o, color: 'white' })),
    ...r.blackOpenings.map((o) => ({ ...o, color: 'black' })),
  ].filter((o) => o.games >= 3);

  // An opening's name describes the game, not the scouted player's choice: a "Defense" (or an
  // accepted/declined gambit) is picked by Black, most other names by White
  const theirChoice = (o) => isBlacksChoice(o.key) === (o.color === 'black');
  const record = (o) => `${pct(o.score)} from ${o.games} games`;

  const weak = openings
    .filter((o) => o.score <= Math.min(0.45, r.overall.score - 0.1))
    .sort((a, b) => a.score - b.score || b.games - a.games)[0];
  if (weak) {
    if (!theirChoice(weak)) {
      notes.push(`They struggle against the ${weak.key}: ${record(weak)}. Steer for it when you have ${weak.color === 'white' ? 'Black' : 'White'}.`);
    } else if (weak.color === 'black') {
      const lead = mostCommon(r.games.filter((g) => g.color === 'black' && g.family === weak.key).map((g) => g.first));
      notes.push(`Their ${weak.key} hasn’t held up: ${record(weak)}.${lead ? ` Their opponents got there with 1.${figurine(lead)}.` : ''}`);
    } else {
      notes.push(`Their ${weak.key} hasn’t worked for them: ${record(weak)}. Expect it when you have Black, and know the critical line.`);
    }
  }

  const strong = openings
    .filter((o) => o.key !== weak?.key && o.score >= Math.max(0.65, r.overall.score + 0.1))
    .sort((a, b) => b.games - a.games || b.score - a.score)[0];
  if (strong) {
    notes.push(theirChoice(strong)
      ? `Their best weapon is the ${strong.key} as ${strong.color === 'white' ? 'White' : 'Black'}: ${record(strong)}. Have something ready for it.`
      : `Avoid the ${strong.key} when you have ${strong.color === 'white' ? 'Black' : 'White'}: they score ${record(strong)} against it.`);
  }

  if (white.games >= 5 && black.games >= 5 && Math.abs(white.score - black.score) >= 0.15) {
    const [better, worse] = white.score > black.score ? [['White', white], ['Black', black]] : [['Black', black], ['White', white]];
    notes.push(`Much stronger with ${better[0]} (${pct(better[1].score)}) than with ${worse[0]} (${pct(worse[1].score)}).`);
  }

  const { timed, trouble, lossesOnTime, losses } = r.clock;
  if (timed >= 5 && trouble / timed >= 0.3) {
    notes.push(`Got into time trouble in ${pct(trouble / timed)} of games with a clock${lossesOnTime ? `, and lost ${lossesOnTime} of ${losses} on time` : ''}. Keep the position complicated and let their clock run.`);
  } else if (losses >= 4 && lossesOnTime / losses >= 0.3) {
    notes.push(`${lossesOnTime} of their ${losses} losses were on time. A long, tense game suits you.`);
  }

  return notes;
}

// Everything the scouting page shows, computed from the opponent's raw games
export function scoutReport(rawGames) {
  const games = rawGames.map((g) => {
    const sans = sanMoves(g.pgn);
    const clock = moveTimes(g.pgn, sans.length);
    const theirs = clock?.times.filter((_, i) => (i % 2 === 0) === (g.color === 'white'));
    return {
      ...g,
      family: openingFamily(openingName(parsePgnHeaders(g.pgn))),
      first: sans[0] ?? null,
      reply: sans[1] ?? null,
      timeTrouble: theirs?.length ? theirs.some((t) => t.pressure) : null,
    };
  });

  const asWhite = games.filter((g) => g.color === 'white');
  const asBlack = games.filter((g) => g.color === 'black');
  const losses = games.filter((g) => g.result === 'Loss');
  const timed = games.filter((g) => g.timeTrouble !== null);
  const ratings = games.map((g) => g.rating).filter(Boolean);

  const report = {
    games,
    overall: tally(games),
    byColor: { white: tally(asWhite), black: tally(asBlack) },
    whiteFirstMoves: tallyBy(asWhite, (g) => g.first),
    whiteOpenings: tallyBy(asWhite, (g) => g.family),
    blackOpenings: tallyBy(asBlack, (g) => g.family),
    replies: {
      e4: tallyBy(asBlack.filter((g) => g.first === 'e4'), (g) => g.reply),
      d4: tallyBy(asBlack.filter((g) => g.first === 'd4'), (g) => g.reply),
      other: tally(asBlack.filter((g) => g.first && g.first !== 'e4' && g.first !== 'd4')),
    },
    endings: ENDINGS.map(({ key, label }) => ({
      key,
      label,
      wins: games.filter((g) => g.result === 'Win' && g.ending === key).length,
      losses: games.filter((g) => g.result === 'Loss' && g.ending === key).length,
      draws: games.filter((g) => g.result === 'Draw' && g.ending === key).length,
    })).filter((e) => e.wins || e.losses || e.draws),
    clock: {
      timed: timed.length,
      trouble: timed.filter((g) => g.timeTrouble).length,
      losses: losses.length,
      lossesOnTime: losses.filter((g) => g.ending === 'time').length,
    },
    speeds: tallyBy(games, (g) => g.speed),
    rating: ratings.length ? { latest: ratings[0], low: Math.min(...ratings), high: Math.max(...ratings) } : null,
  };
  return { ...report, notes: prepNotes(report) };
}
