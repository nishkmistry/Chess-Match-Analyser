const express = require('express');
const cors = require('cors');
const { z } = require('zod');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const fetchSchema = z.object({
  username: z.string().min(1, "Chess.com username is required")
});

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
    res.status(500).json({ error: "Internal server error" });
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
    res.status(500).json({ error: "Internal server error" });
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

app.post('/api/matches/fetch', async (req, res) => {
  try {
    const { username } = fetchSchema.parse(req.body);

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
                (white_player_id, black_player_id, white_elo, black_elo, result, game_hash, pgn, played_at)
              VALUES 
                ($1, $2, $3, $4, $5, $6, $7, $8)
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
                playedAt
            ];
            
            const { rows } = await pool.query(query, values);
            const newMatch = rows[0];
            newMatch.white_username = game.white.username;
            newMatch.black_username = game.black.username;
            newMatches.push(newMatch);

            if (newMatches.length >= 5) break;
        }
        if (newMatches.length >= 5) break;
    }

    res.status(200).json({ fetched: newMatches.length, matches: newMatches });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    console.error("POST /api/matches/fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
