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

// ---------- Grok (xAI) game reports ----------

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';
const XAI_MODEL = process.env.XAI_MODEL || 'grok-4.7';
// grok-4.7 reasons at "high" effort by default, which is too slow for a serverless request.
// Set XAI_REASONING_EFFORT to an empty string when using a non-reasoning model.
const XAI_REASONING_EFFORT = process.env.XAI_REASONING_EFFORT ?? 'low';

const reportSchema = z.object({
  moves: z.array(z.string().min(1).max(12)).max(1000),
  evals: z.array(
    z.object({
      type: z.enum(['cp', 'mate']),
      val: z.number().int(),
      winner: z.enum(['white', 'black']).optional(),
    }).nullable()
  ).max(1001),
});

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

function buildReportPrompt(match, moves, evals) {
  const headers = {};
  for (const [, key, value] of (match.pgn || '').matchAll(/^\[(\w+) "(.*)"\]$/gm)) headers[key] = value;
  const context = ['Event', 'TimeControl', 'ECO', 'Opening', 'ECOUrl', 'Termination']
    .filter((k) => headers[k])
    .map((k) => `${k}: ${headers[k]}`)
    .join('\n');

  const white = match.white_username || 'White';
  const black = match.black_username || 'Black';
  const table = moves.map((san, i) => {
    const moveNo = Math.floor(i / 2) + 1;
    const notation = i % 2 === 0 ? `${moveNo}. ${san}` : `${moveNo}... ${san}`;
    return `ply ${i + 1} | ${notation} | ${formatEvalForPrompt(evals[i + 1])}`;
  }).join('\n');

  return `Review this ${match.source || 'online'} game between ${white} (White, ${match.white_elo || '?'}) and ${black} (Black, ${match.black_elo || '?'}).
The tracked player is ${match.tracked_username || 'unknown'}, who played ${match.player_color || 'unknown'}. Result for them: ${match.result || 'Unknown'}.
${context ? `\nPGN headers:\n${context}\n` : ''}
Every move with the Stockfish evaluation of the position after it. Evaluations are from White's perspective in pawns (positive = White better). "#+N" means White mates in N, "#-N" means Black mates in N.
Starting position: ${formatEvalForPrompt(evals[0])}
${table}

Write a concise coaching review. Refer to moves with standard notation such as "14...Qxd4" or "23. Rf7", and set each "ply" field to that move's ply number from the table. Use null for missed_win if there was no clear missed win.`;
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

    const gamesRes = await fetch(
      `https://lichess.org/api/games/user/${username}?max=${importLimit}&pgnInJson=true`,
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
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI reports are not configured. Set XAI_API_KEY on the server.' });
    }

    const { moves, evals } = reportSchema.parse(parseBody(req.body));

    const { rows } = await pool.query(`
      SELECT
        cm.*,
        wp.username AS white_username,
        bp.username AS black_username
      FROM chess_matches cm
      LEFT JOIN players wp ON cm.white_player_id = wp.player_id
      LEFT JOIN players bp ON cm.black_player_id = bp.player_id
      WHERE cm.match_id = $1
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Match not found' });

    const grokRes = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        ...(XAI_REASONING_EFFORT && { reasoning_effort: XAI_REASONING_EFFORT }),
        messages: [
          { role: 'system', content: 'You are an experienced chess coach who explains games clearly and concretely to club players.' },
          { role: 'user', content: buildReportPrompt(rows[0], moves, evals) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'game_report', schema: REPORT_JSON_SCHEMA, strict: true },
        },
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!grokRes.ok) {
      const errData = await grokRes.json().catch(() => ({}));
      const message = typeof errData.error === 'string' ? errData.error : errData.error?.message;
      console.error('Grok API error:', grokRes.status, errData);
      return res.status(502).json({ error: message || `Grok API returned ${grokRes.status}` });
    }

    const data = await grokRes.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: 'Empty response from Grok' });

    res.json(JSON.parse(content.replace(/```json|```/gi, '').trim()));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.issues });
    }
    if (error.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Grok took too long to respond. Try again.' });
    }
    console.error('POST /api/matches/:id/report error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
