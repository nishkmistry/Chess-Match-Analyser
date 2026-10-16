const express = require('express');
const cors = require('cors');
const { z } = require('zod');
const pool = require('./db');

const app = express();
app.use(cors());

app.use((req, res, next) => {
  express.json({ limit: '1mb' })(req, res, (err) => {
    if (err) return next(err);
    next();
  });
});
app.use(express.urlencoded({ extended: true }));

const fetchSchema = z.object({
  username: z.string().min(1, "Chess.com username is required")
});

// Ultimate safeguard against weird Serverless String formats
function parseBody(body) {
  let payload = body;
  if (Buffer.isBuffer(payload) || (payload && payload.type === 'Buffer' && Array.isArray(payload.data))) {
    try { payload = JSON.parse(Buffer.from(payload.data || payload).toString('utf8')); } catch(e){}
  }
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch(e){}
  }
  return payload;
}

const parseMatchId = (raw) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// ---------- AI game reports (Groq) ----------

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Must be a model with strict structured-output support on Groq (gpt-oss or qwen3 models).
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
// gpt-oss reasons before answering; "low" keeps reports quick and well inside the free tier's
// tokens-per-minute limit. Set GROQ_REASONING_EFFORT to an empty string for non-reasoning models.
const GROQ_REASONING_EFFORT = process.env.GROQ_REASONING_EFFORT ?? 'low';

const scoreSchema = z.object({
  type: z.enum(['cp', 'mate']),
  val: z.number().int(),
  winner: z.enum(['white', 'black']).optional(),
});

const reportSchema = z.object({
  moves: z.array(z.string().min(1).max(12)).max(1000),
  evals: z.array(scoreSchema.nullable()).max(1001),
  // One entry per ply: clock left after the move, time spent on it, and whether it was played in time trouble
  clocks: z.array(
    z.object({
      left: z.number().min(0).max(1e7),
      spent: z.number().min(0).max(1e7),
      pressure: z.boolean(),
    }).nullable()
  ).max(1000).optional(),
});

// Lichess' winning-chances curve, in [-1, 1] from White's point of view (same formula as the client)
function winChances(e) {
  if (!e) return 0;
  if (e.type === 'mate') return (e.winner ? e.winner === 'white' : e.val > 0) ? 1 : -1;
  const cp = Math.max(-1000, Math.min(1000, e.val));
  return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
}

// How much each move cost the player who made it, in winning chances. Indexed by ply (0 = start).
function moveDrops(evals, whiteFirst) {
  return evals.map((cur, ply) => {
    const prev = evals[ply - 1];
    if (ply === 0 || !prev || !cur) return 0;
    const whiteMoved = (ply % 2 === 1) === whiteFirst;
    return whiteMoved ? winChances(prev) - winChances(cur) : winChances(cur) - winChances(prev);
  });
}

const moveTag = (drop) => (drop >= 0.3 ? 'blunder' : drop >= 0.2 ? 'mistake' : drop >= 0.1 ? 'inaccuracy' : null);

const momentSchema = (description) => ({
  type: 'object',
  properties: {
    ply: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: 'The ply number (from the move table) of the move being described, or null if not applicable',
    },
    text: { type: 'string', description },
  },
  required: ['ply', 'text'],
  additionalProperties: false,
});

const REPORT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    opening: {
      type: 'string',
      description: 'Name of the opening or defence, and one sentence on how each side handled the opening phase',
    },
    turning_point: momentSchema('The move where the evaluation shifted most dramatically, in notation like 14...Qxd4, and why it mattered'),
    blunder: momentSchema('The single biggest mistake: the move played, what was better, and a short explanation of why it was losing'),
    missed_win: {
      anyOf: [
        momentSchema('The most significant missed opportunity: what should have been played and the idea behind it'),
        { type: 'null' },
      ],
    },
    summary: { type: 'string', description: 'One sentence describing how the game was ultimately decided' },
    lessons: {
      type: 'array',
      items: { type: 'string' },
      description: 'Two or three short, concrete, actionable takeaways for the tracked player',
    },
  },
  required: ['opening', 'turning_point', 'blunder', 'missed_win', 'summary', 'lessons'],
  additionalProperties: false,
};

function formatEvalForPrompt(e) {
  if (!e) return '?';
  if (e.type === 'mate') {
    if (e.val === 0) return `checkmate (${e.winner} wins)`;
    return e.val > 0 ? `#+${e.val}` : `#${e.val}`;
  }
  const pawns = e.val / 100;
  return pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
}

function parsePgnHeaders(pgn) {
  const headers = {};
  for (const [, key, value] of (pgn || '').matchAll(/^\[(\w+) "(.*)"\]$/gm)) headers[key] = value;
  return headers;
}

// Games set up from a position can start with Black to move
const whiteMovesFirst = (headers) => !(headers.FEN && headers.FEN.split(' ')[1] === 'b');

function formatClock(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

const notationFor = (moves, ply, whiteFirst) => {
  const offset = whiteFirst ? 0 : 1;
  const moveNo = Math.floor((ply - 1 + offset) / 2) + 1;
  return (ply - 1 + offset) % 2 === 0 ? `${moveNo}. ${moves[ply - 1]}` : `${moveNo}... ${moves[ply - 1]}`;
};

// The moves the engine says lost ground, biggest first. These are the only moves the coach may cite.
function flaggedMoves(moves, evals, whiteFirst) {
  return moveDrops(evals, whiteFirst)
    .map((drop, ply) => ({ ply, drop, tag: moveTag(drop) }))
    .filter(({ ply, tag }) => ply > 0 && tag)
    .sort((a, b) => b.drop - a.drop)
    .slice(0, 10);
}

function buildReportPrompt(match, moves, evals, clocks, flagged) {
  const headers = parsePgnHeaders(match.pgn);
  const whiteFirst = whiteMovesFirst(headers);
  const context = ['Event', 'TimeControl', 'ECO', 'Opening', 'ECOUrl', 'Termination']
    .filter((k) => headers[k])
    .map((k) => `${k}: ${headers[k]}`)
    .join('\n');

  const white = match.white_username || 'White';
  const black = match.black_username || 'Black';
  const moverName = (ply) => (((ply % 2 === 1) === whiteFirst) ? `${white} (White)` : `${black} (Black)`);
  const clockNote = (ply) => {
    const c = clocks?.[ply - 1];
    return c ? ` | ${formatClock(c.left)} left, ${Math.round(c.spent)}s spent${c.pressure ? ', time trouble' : ''}` : '';
  };

  const table = moves.map((_, i) => `ply ${i + 1} | ${notationFor(moves, i + 1, whiteFirst)} | ${formatEvalForPrompt(evals[i + 1])}${clockNote(i + 1)}`).join('\n');

  // Precomputed so the model never has to add up the clock column itself
  const clockFacts = clocks && [true, false].map((isWhite) => {
    const plies = clocks.map((c, i) => ({ ...c, ply: i + 1 })).filter(({ ply }) => ((ply % 2 === 1) === whiteFirst) === isWhite);
    if (plies.length === 0) return null;
    const longest = plies.reduce((a, b) => (b.spent > a.spent ? b : a));
    const trouble = plies.find((c) => c.pressure);
    const name = isWhite ? `${white} (White)` : `${black} (Black)`;
    return `- ${name}:${Math.round(plies.reduce((s, c) => s + c.spent, 0) / plies.length)}s per move on average; longest think ${Math.round(longest.spent)}s on ${notationFor(moves, longest.ply, whiteFirst)}; ${trouble ? `in time trouble from ${notationFor(moves, trouble.ply, whiteFirst)}` : 'never in time trouble'}; ${formatClock(plies[plies.length - 1].left)} left at the end`;
  }).filter(Boolean).join('\n');
  const flaggedList = flagged.length
    ? flagged.map(({ ply, drop, tag }) => `- ply ${ply} | ${notationFor(moves, ply, whiteFirst)} | ${moverName(ply)} | ${tag}, cost ${Math.round(drop * 50)}% winning chances${clockNote(ply)}`).join('\n')
    : '(none: the engine found no inaccuracies, mistakes or blunders)';

  return `Review this ${match.source || 'online'} game between ${white} (White, ${match.white_elo || '?'}) and ${black} (Black, ${match.black_elo || '?'}).
The tracked player is ${match.tracked_username || 'unknown'}, who played ${match.player_color || 'unknown'}. Result for them: ${match.result || 'Unknown'}.
${context ? `\nPGN headers:\n${context}\n` : ''}
Every move with the Stockfish evaluation of the position after it${clocks ? ', then the mover\'s clock after the move and the time they spent on it' : ''}. Evaluations are from White's perspective in pawns (positive = White better). "#+N" means White mates in N, "#-N" means Black mates in N.
Starting position: ${formatEvalForPrompt(evals[0])}
${table}

Engine-flagged moves, biggest loss first:
${flaggedList}
${clockFacts ? `\nClock summary:\n${clockFacts}\n` : ''}
Write a concise coaching review. Refer to moves with standard notation such as "14...Qxd4" or "23. Rf7", and set each "ply" field to that move's ply number. Mark mistakes with ? or ??, never with !.
Ground every claim in the engine data: turning_point, blunder and missed_win must each cite a ply from the engine-flagged list, or null if the list has nothing suitable. Never call a move a mistake unless it is flagged. Use null for missed_win if there was no clear missed win.${clocks ? ' Take clock facts only from the clock column and the clock summary. Only say a move was played in time trouble if its row says "time trouble". Where a flagged move came in time trouble or after very little thought, say so and make time management one of the lessons.' : ''}`;
}

// Every moment the coach points to must be a move the engine flagged
function checkReport(report, flagged) {
  const plies = new Set(flagged.map((f) => f.ply));
  const ok = (moment) => !moment || moment.ply === null || plies.has(moment.ply);
  return {
    turning_point: ok(report.turning_point),
    blunder: ok(report.blunder),
    missed_win: ok(report.missed_win),
  };
}

class GroqError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function callGroq(apiKey, messages, timeoutMs) {
  const aiRes = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      ...(GROQ_REASONING_EFFORT && { reasoning_effort: GROQ_REASONING_EFFORT, include_reasoning: false }),
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'game_report', schema: REPORT_JSON_SCHEMA, strict: true },
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!aiRes.ok) {
    const errData = await aiRes.json().catch(() => ({}));
    const message = typeof errData.error === 'string' ? errData.error : errData.error?.message;
    console.error('Groq API error:', aiRes.status, errData);
    if (aiRes.status === 429) throw new GroqError(429, 'Groq rate limit reached (free tier). Wait a minute and try again.');
    throw new GroqError(502, message || `Groq API returned ${aiRes.status}`);
  }

  const data = await aiRes.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new GroqError(502, 'Empty response from Groq');
  return { content, report: JSON.parse(content.replace(/```json|```/gi, '').trim()) };
}

app.get('/api/matches', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        cm.*, 
        wp.username AS white_username, 
        bp.username AS black_username
      FROM chess_matches cm
      LEFT JOIN players wp ON cm.white_player_id = wp.player_id
      LEFT JOIN players bp ON cm.black_player_id = bp.player_id
      ORDER BY cm.played_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error("GET /api/matches error:", error);
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

app.get('/api/matches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT 
        cm.*, 
        wp.username AS white_username, 
        bp.username AS black_username
      FROM chess_matches cm
      LEFT JOIN players wp ON cm.white_player_id = wp.player_id
      LEFT JOIN players bp ON cm.black_player_id = bp.player_id
      WHERE cm.match_id = $1
    `, [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Match not found" });
    res.json(rows[0]);
  } catch (error) {
    console.error("GET /api/matches/:id error:", error);
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

app.delete('/api/matches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM chess_matches WHERE match_id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: "Match not found" });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("DELETE /api/matches/:id error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.patch('/api/matches/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    if (typeof notes !== 'string') return res.status(400).json({ error: 'notes must be a string' });

    const { rows, rowCount } = await pool.query(
      'UPDATE chess_matches SET notes = $1 WHERE match_id = $2 RETURNING notes',
      [notes.slice(0, 1000), id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Match not found' });
    res.json({ notes: rows[0].notes });
  } catch (error) {
    console.error("PATCH /api/matches/:id/notes error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/matches/fetch', async (req, res) => {
  try {
    const { username } = fetchSchema.parse(parseBody(req.body));
    const importLimit = Math.min(parseInt(req.query.limit || '20', 10), 100);

    const archivesRes = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`);
    if (!archivesRes.ok) {
      if(archivesRes.status === 404) return res.status(404).json({ error: "Username not found" });
      throw new Error(`Chess.com API error: ${archivesRes.status}`);
    }
    const archivesData = await archivesRes.json();
    const archives = archivesData.archives;
    if (!archives || archives.length === 0) {
      return res.status(404).json({ error: "No games found for this user" });
    }

    let newMatches = [];
    
    for (let i = archives.length - 1; i >= 0; i--) {
        const gamesRes = await fetch(archives[i]);
        const gamesData = await gamesRes.json();
        const games = gamesData.games.reverse();
        
        for (const game of games) {
          
            const existsRes = await pool.query('SELECT 1 FROM chess_matches WHERE game_hash = $1', [game.url]);
            if (existsRes.rowCount > 0) continue;
            
            
            const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
            const playerDetails = isWhite ? game.white : game.black;

            let result = 'Draw';
            if (playerDetails.result === 'win') result = 'Win';
            else if (['checkmated', 'resigned', 'timeout', 'abandoned', 'lose'].includes(playerDetails.result)) result = 'Loss';

            // Insert or ensure players exist
            await pool.query(`
                INSERT INTO players (username) VALUES ($1), ($2)
                ON CONFLICT (username) DO NOTHING;
            `, [game.white.username, game.black.username]);

            const playerIdsRes = await pool.query(`
                SELECT player_id, username FROM players WHERE username IN ($1, $2);
            `, [game.white.username, game.black.username]);

            const playerIdsMap = {};
            playerIdsRes.rows.forEach(r => {
                playerIdsMap[r.username] = r.player_id;
            });

            const whitePlayerId = playerIdsMap[game.white.username];
            const blackPlayerId = playerIdsMap[game.black.username];
            
            const query = `
              INSERT INTO chess_matches 
                (white_player_id, black_player_id, white_elo, black_elo, result,
                 game_hash, pgn, played_at, player_color, tracked_username, source)
              VALUES 
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              RETURNING *;
            `;
            const playedAt = game.end_time ? new Date(game.end_time * 1000).toISOString() : new Date().toISOString();

            const values = [
                whitePlayerId,
                blackPlayerId,
                game.white.rating || 0,
                game.black.rating || 0,
                result,
                game.url,
                game.pgn || null,
                playedAt,
                isWhite ? 'white' : 'black',
                username,
                'chess.com'
            ];
            
            const { rows } = await pool.query(query, values);
            const newMatch = rows[0];
            newMatch.white_username = game.white.username;
            newMatch.black_username = game.black.username;
            newMatches.push(newMatch);

            if (newMatches.length >= importLimit) break;
        }
        if (newMatches.length >= importLimit) break;
    }

    res.status(200).json({ fetched: newMatches.length, matches: newMatches });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors, debugBody: req.body });
    }
    console.error("POST /api/matches/fetch error:", error);
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

app.post('/api/matches/fetch-lichess', async (req, res) => {
  try {
    const { username } = fetchSchema.parse(parseBody(req.body));
    const importLimit = Math.min(parseInt(req.query.limit || '20', 10), 100);

    // clocks: per-move [%clk] times for the clock analysis; opening: the [Opening] name tag
    const gamesRes = await fetch(
      `https://lichess.org/api/games/user/${username}?max=${importLimit}&pgnInJson=true&clocks=true&opening=true`,
      { headers: { Accept: 'application/x-ndjson' } }
    );
    if (!gamesRes.ok) {
      if (gamesRes.status === 404) return res.status(404).json({ error: 'User not found on Lichess' });
      throw new Error(`Lichess API error: ${gamesRes.status}`);
    }

    const text = await gamesRes.text();
    const games = text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));

    let newMatches = [];
    for (const game of games) {
      const gameUrl = `https://lichess.org/${game.id}`;
      const exists = await pool.query('SELECT 1 FROM chess_matches WHERE game_hash = $1', [gameUrl]);
      if (exists.rowCount > 0) continue;

      const isWhite = game.players.white.user?.name?.toLowerCase() === username.toLowerCase();

      let result = 'Draw';
      const winner = game.winner;
      if (winner === 'white' && isWhite) result = 'Win';
      else if (winner === 'black' && !isWhite) result = 'Win';
      else if (winner) result = 'Loss';

      const whiteUser = game.players.white.user?.name || 'Anonymous';
      const blackUser = game.players.black.user?.name || 'Anonymous';

      await pool.query(
        `INSERT INTO players (username) VALUES ($1), ($2) ON CONFLICT (username) DO NOTHING`,
        [whiteUser, blackUser]
      );
      const playerIdsRes = await pool.query(
        `SELECT player_id, username FROM players WHERE username IN ($1, $2)`,
        [whiteUser, blackUser]
      );
      const pidMap = {};
      playerIdsRes.rows.forEach(r => { pidMap[r.username] = r.player_id; });

      const { rows } = await pool.query(`
        INSERT INTO chess_matches
          (white_player_id, black_player_id, white_elo, black_elo, result,
           game_hash, pgn, played_at, player_color, tracked_username, source)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *`,
        [pidMap[whiteUser], pidMap[blackUser],
         game.players.white.rating || 0, game.players.black.rating || 0,
         result, gameUrl, game.pgn || null,
         game.lastMoveAt ? new Date(game.lastMoveAt).toISOString() : new Date().toISOString(),
         isWhite ? 'white' : 'black', username, 'lichess']
      );
      const m = rows[0];
      m.white_username = whiteUser;
      m.black_username = blackUser;
      newMatches.push(m);
    }

    res.status(200).json({ fetched: newMatches.length, matches: newMatches });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('POST /api/matches/fetch-lichess error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.post('/api/matches/:id/report', async (req, res) => {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI reports are not configured. Set GROQ_API_KEY on the server.' });
    }

    const matchId = parseMatchId(req.params.id);
    if (!matchId) return res.status(400).json({ error: 'Invalid match id' });
    const { moves, evals, clocks } = reportSchema.parse(parseBody(req.body));

    // Without the engine's numbers the model guesses, and guesses confidently
    if (evals.length !== moves.length + 1) {
      return res.status(400).json({ error: 'Send one evaluation per position (moves + 1).' });
    }
    if (evals.filter(Boolean).length < evals.length * 0.9) {
      return res.status(400).json({ error: 'Run the engine review first. The coach needs Stockfish\'s evaluation of every position.' });
    }

    const { rows } = await pool.query(`
      SELECT
        cm.*,
        wp.username AS white_username,
        bp.username AS black_username
      FROM chess_matches cm
      LEFT JOIN players wp ON cm.white_player_id = wp.player_id
      LEFT JOIN players bp ON cm.black_player_id = bp.player_id
      WHERE cm.match_id = $1
    `, [matchId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Match not found' });

    const match = rows[0];
    const flagged = flaggedMoves(moves, evals, whiteMovesFirst(parsePgnHeaders(match.pgn)));
    const messages = [
      { role: 'system', content: 'You are an experienced chess coach who explains games clearly and concretely to club players. You only make claims the engine data supports.' },
      { role: 'user', content: buildReportPrompt(match, moves, evals, clocks?.length === moves.length ? clocks : null, flagged) },
    ];

    const deadline = Date.now() + 25000;
    let { content, report } = await callGroq(apiKey, messages, 25000);
    let checks = checkReport(report, flagged);

    // One correction round if it cited a move the engine didn't flag, while there's time left
    const bad = Object.keys(checks).filter((k) => !checks[k]);
    if (bad.length && deadline - Date.now() > 8000) {
      const allowed = flagged.map((f) => f.ply).join(', ') || 'none';
      messages.push(
        { role: 'assistant', content },
        { role: 'user', content: `${bad.map((k) => `${k} cites ply ${report[k].ply}`).join('; ')}, but the engine didn't flag ${bad.length > 1 ? 'those moves' : 'that move'}. Rewrite the review citing only flagged plies (${allowed}), or null.` },
      );
      try {
        ({ report } = await callGroq(apiKey, messages, deadline - Date.now()));
        checks = checkReport(report, flagged);
      } catch (retryError) {
        console.error('Report correction failed, keeping the first answer:', retryError.message);
      }
    }

    const saved = { ...report, checks };
    const { rows: savedRows } = await pool.query(`
      INSERT INTO game_analysis (match_id, evals, report, reported_at)
      VALUES ($1, $2::jsonb, $3::jsonb, NOW())
      ON CONFLICT (match_id) DO UPDATE SET report = EXCLUDED.report, reported_at = NOW()
      RETURNING reported_at
    `, [matchId, JSON.stringify(evals), JSON.stringify(saved)]);

    res.json({ ...saved, reported_at: savedRows[0].reported_at });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    if (error instanceof GroqError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error.name === 'TimeoutError') {
      return res.status(504).json({ error: 'The AI took too long to respond. Try again.' });
    }
    console.error('POST /api/matches/:id/report error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// ---------- Saved engine reviews ----------

const uciSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/);

const analysisSchema = z.object({
  evals: z.array(scoreSchema.nullable()).min(1).max(1001),
  best_moves: z.array(uciSchema.nullable()).max(1001),
  puzzles: z.array(z.object({
    ply: z.number().int().min(1).max(1000),
    fen: z.string().min(20).max(100),
    played_san: z.string().min(1).max(12),
    solution_uci: uciSchema,
    solution_san: z.string().min(1).max(12),
    win_chance_loss: z.number().min(0).max(2),
  })).max(100),
});

app.get('/api/matches/:id/analysis', async (req, res) => {
  try {
    const matchId = parseMatchId(req.params.id);
    if (!matchId) return res.status(400).json({ error: 'Invalid match id' });
    const { rows } = await pool.query(
      'SELECT evals, best_moves, report, analysed_at, reported_at FROM game_analysis WHERE match_id = $1',
      [matchId]
    );
    // null rather than 404: "not reviewed yet" is a normal state, not an error
    res.json(rows[0] ?? null);
  } catch (error) {
    console.error('GET /api/matches/:id/analysis error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Saves a review and syncs the game's training puzzles, keeping the schedule of puzzles that survive
app.put('/api/matches/:id/analysis', async (req, res) => {
  const matchId = parseMatchId(req.params.id);
  if (!matchId) return res.status(400).json({ error: 'Invalid match id' });

  let parsed;
  try {
    parsed = analysisSchema.parse(parseBody(req.body));
  } catch (error) {
    return res.status(400).json({ error: 'Validation failed', details: error.issues });
  }
  const { evals, best_moves, puzzles } = parsed;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT 1 FROM chess_matches WHERE match_id = $1', [matchId]);
    if (exists.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Match not found' });
    }

    const { rows } = await client.query(`
      INSERT INTO game_analysis (match_id, evals, best_moves, analysed_at)
      VALUES ($1, $2::jsonb, $3::jsonb, NOW())
      ON CONFLICT (match_id) DO UPDATE SET evals = EXCLUDED.evals, best_moves = EXCLUDED.best_moves, analysed_at = NOW()
      RETURNING analysed_at
    `, [matchId, JSON.stringify(evals), JSON.stringify(best_moves)]);

    await client.query(
      'DELETE FROM puzzles WHERE match_id = $1 AND NOT (ply = ANY($2::int[]))',
      [matchId, puzzles.map((p) => p.ply)]
    );
    for (const p of puzzles) {
      await client.query(`
        INSERT INTO puzzles (match_id, ply, fen, played_san, solution_uci, solution_san, win_chance_loss)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (match_id, ply) DO UPDATE SET
          fen = EXCLUDED.fen, played_san = EXCLUDED.played_san, solution_uci = EXCLUDED.solution_uci,
          solution_san = EXCLUDED.solution_san, win_chance_loss = EXCLUDED.win_chance_loss
      `, [matchId, p.ply, p.fen, p.played_san, p.solution_uci, p.solution_san, p.win_chance_loss]);
    }

    await client.query('COMMIT');
    res.json({ analysed_at: rows[0].analysed_at, puzzles: puzzles.length });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PUT /api/matches/:id/analysis error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  } finally {
    client.release();
  }
});

// Every saved review, for the cross-game insights
app.get('/api/analyses', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT match_id, evals, best_moves, analysed_at FROM game_analysis');
    res.json(rows);
  } catch (error) {
    console.error('GET /api/analyses error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// ---------- Training puzzles (spaced repetition) ----------

const RETRY_AFTER_MISS_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// SM-2 style: each solve stretches the gap (1 day, 3 days, then x ease); a miss brings it back in 10 minutes
function nextSchedule({ ease, interval_days, streak }, solved) {
  if (!solved) {
    return { ease: Math.max(1.3, ease - 0.2), interval_days: 0, streak: 0, wait_ms: RETRY_AFTER_MISS_MS };
  }
  const nextStreak = streak + 1;
  const interval = nextStreak === 1 ? 1 : nextStreak === 2 ? 3 : Math.round(Math.max(interval_days, 1) * ease);
  return { ease: Math.min(3, ease + 0.05), interval_days: interval, streak: nextStreak, wait_ms: interval * DAY_MS };
}

// ?username=&source= narrows the deck to one imported account
const puzzleQuerySchema = z.object({
  all: z.literal('1').optional(),
  username: z.string().trim().min(1).max(100).optional(),
  source: z.enum(['chess.com', 'lichess']).optional(),
});

// SQL condition for one account, with its placeholders numbered from `first`
const accountFilter = (username, source, first) => (username
  ? {
    sql: `AND LOWER(cm.tracked_username) = LOWER($${first}) AND COALESCE(cm.source, 'chess.com') = $${first + 1}`,
    params: [username, source || 'chess.com'],
  }
  : { sql: '', params: [] });

app.get('/api/puzzles', async (req, res) => {
  try {
    const { all, username, source } = puzzleQuerySchema.parse(req.query);
    const account = accountFilter(username, source, 2);
    const countAccount = accountFilter(username, source, 1);

    const { rows: puzzles } = await pool.query(`
      SELECT
        p.puzzle_id, p.match_id, p.ply, p.fen, p.played_san, p.solution_uci, p.solution_san, p.win_chance_loss,
        p.streak, p.attempts, p.solves, p.interval_days, p.due_at,
        cm.played_at, cm.player_color, cm.source, cm.result,
        wp.username AS white_username, bp.username AS black_username
      FROM puzzles p
      JOIN chess_matches cm ON cm.match_id = p.match_id
      LEFT JOIN players wp ON cm.white_player_id = wp.player_id
      LEFT JOIN players bp ON cm.black_player_id = bp.player_id
      WHERE ($1 OR p.due_at <= NOW()) ${account.sql}
      ORDER BY p.due_at, p.win_chance_loss DESC
      LIMIT 50
    `, [all === '1', ...account.params]);

    const { rows: [counts] } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        (COUNT(*) FILTER (WHERE p.due_at <= NOW()))::int AS due,
        (COUNT(*) FILTER (WHERE p.streak >= 3))::int AS learned,
        MIN(p.due_at) FILTER (WHERE p.due_at > NOW()) AS next_due_at
      FROM puzzles p
      JOIN chess_matches cm ON cm.match_id = p.match_id
      WHERE TRUE ${countAccount.sql}
    `, countAccount.params);

    res.json({ puzzles, ...counts });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    console.error('GET /api/puzzles error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.post('/api/puzzles/:id/attempt', async (req, res) => {
  try {
    const puzzleId = parseMatchId(req.params.id);
    if (!puzzleId) return res.status(400).json({ error: 'Invalid puzzle id' });
    const { solved } = z.object({ solved: z.boolean() }).parse(parseBody(req.body));

    const { rows } = await pool.query('SELECT ease, interval_days, streak FROM puzzles WHERE puzzle_id = $1', [puzzleId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Puzzle not found' });

    const next = nextSchedule(rows[0], solved);
    const { rows: updated } = await pool.query(`
      UPDATE puzzles SET
        ease = $2, interval_days = $3, streak = $4,
        attempts = attempts + 1, solves = solves + $5,
        due_at = NOW() + make_interval(secs => $6), last_attempt_at = NOW()
      WHERE puzzle_id = $1
      RETURNING puzzle_id, streak, attempts, solves, interval_days, due_at
    `, [puzzleId, next.ease, next.interval_days, next.streak, solved ? 1 : 0, next.wait_ms / 1000]);

    res.json(updated[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    console.error('POST /api/puzzles/:id/attempt error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// ---------- Opponent scouting ----------
// Pulls an opponent's recent games for preparation. Nothing is saved, so their games never mix with yours.

const scoutSchema = z.object({
  platform: z.enum(['chess.com', 'lichess']),
  username: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9_-]+$/, 'Usernames only contain letters, digits, _ and -'),
  limit: z.coerce.number().int().min(5).max(100).default(50),
});

const CHESSCOM_LOSSES = { checkmated: 'checkmate', resigned: 'resignation', timeout: 'time', abandoned: 'abandoned' };
const CHESSCOM_DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);
const LICHESS_ENDINGS = {
  mate: 'checkmate', resign: 'resignation', outoftime: 'time', timeout: 'abandoned',
  draw: 'draw', stalemate: 'draw', insufficientMaterialClaim: 'draw',
};

function scoutChessComGame(game, username) {
  const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
  const [me, them] = isWhite ? [game.white, game.black] : [game.black, game.white];
  let result = 'Loss';
  let ending = CHESSCOM_LOSSES[me.result] ?? 'other';
  if (me.result === 'win') {
    result = 'Win';
    ending = CHESSCOM_LOSSES[them.result] ?? 'other';
  } else if (CHESSCOM_DRAWS.has(me.result)) {
    result = 'Draw';
    ending = 'draw';
  }
  return {
    url: game.url,
    played_at: new Date(game.end_time * 1000).toISOString(),
    color: isWhite ? 'white' : 'black',
    result,
    ending,
    rating: me.rating ?? null,
    opponent: them.username,
    opponent_rating: them.rating ?? null,
    speed: game.time_class,
    pgn: game.pgn || '',
  };
}

function scoutLichessGame(game, username) {
  const isWhite = game.players.white.user?.id === username.toLowerCase();
  const color = isWhite ? 'white' : 'black';
  const [me, them] = isWhite ? [game.players.white, game.players.black] : [game.players.black, game.players.white];
  return {
    url: `https://lichess.org/${game.id}`,
    played_at: new Date(game.lastMoveAt || game.createdAt).toISOString(),
    color,
    result: !game.winner ? 'Draw' : game.winner === color ? 'Win' : 'Loss',
    ending: LICHESS_ENDINGS[game.status] ?? 'other',
    rating: me.rating ?? null,
    opponent: them.user?.name || 'Anonymous',
    opponent_rating: them.rating ?? null,
    speed: game.speed,
    pgn: game.pgn || '',
  };
}

async function scoutChessCom(username, limit) {
  const archivesRes = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`);
  if (archivesRes.status === 404) return null;
  if (!archivesRes.ok) throw new Error(`Chess.com API error: ${archivesRes.status}`);
  const { archives = [] } = await archivesRes.json();

  const games = [];
  for (let i = archives.length - 1; i >= 0 && games.length < limit; i--) {
    const monthRes = await fetch(archives[i]);
    if (!monthRes.ok) continue;
    const { games: month = [] } = await monthRes.json();
    for (const game of month.reverse()) {
      if (game.rules !== 'chess' || !game.pgn) continue;
      games.push(scoutChessComGame(game, username));
      if (games.length >= limit) break;
    }
  }
  return games;
}

async function scoutLichess(username, limit) {
  const gamesRes = await fetch(
    `https://lichess.org/api/games/user/${username}?max=${limit}&pgnInJson=true&clocks=true&opening=true&perfType=ultraBullet,bullet,blitz,rapid,classical,correspondence`,
    { headers: { Accept: 'application/x-ndjson' } }
  );
  if (gamesRes.status === 404) return null;
  if (!gamesRes.ok) throw new Error(`Lichess API error: ${gamesRes.status}`);
  const text = await gamesRes.text();
  return text.trim().split('\n').filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((game) => game.variant === 'standard' && game.pgn && !['aborted', 'noStart'].includes(game.status))
    .map((game) => scoutLichessGame(game, username));
}

app.get('/api/scout', async (req, res) => {
  try {
    const { platform, username, limit } = scoutSchema.parse(req.query);
    const games = platform === 'lichess' ? await scoutLichess(username, limit) : await scoutChessCom(username, limit);
    if (games === null) return res.status(404).json({ error: `No ${platform === 'lichess' ? 'Lichess' : 'Chess.com'} player called ${username}` });
    res.json({ platform, username, games });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message || 'Validation failed', details: error.issues });
    }
    console.error('GET /api/scout error:', error);
    res.status(502).json({ error: 'Could not fetch games from that site right now.', message: error.message });
  }
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
