const pool = require('./db');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create players table
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        player_id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL
      );
    `);

    // 2. Add new columns to chess_matches
    await client.query(`
      ALTER TABLE chess_matches
      ADD COLUMN IF NOT EXISTS white_player_id INT REFERENCES players(player_id),
      ADD COLUMN IF NOT EXISTS black_player_id INT REFERENCES players(player_id),
      ADD COLUMN IF NOT EXISTS white_elo INT,
      ADD COLUMN IF NOT EXISTS black_elo INT;
    `);

    // 3. Insert unique names into players
    await client.query(`
      INSERT INTO players (username)
      SELECT DISTINCT white_name FROM chess_matches WHERE white_name IS NOT NULL
      ON CONFLICT (username) DO NOTHING;
    `);
    await client.query(`
      INSERT INTO players (username)
      SELECT DISTINCT black_name FROM chess_matches WHERE black_name IS NOT NULL
      ON CONFLICT (username) DO NOTHING;
    `);

    // 4. Update chess_matches with player ids
    await client.query(`
      UPDATE chess_matches cm
      SET white_player_id = p.player_id
      FROM players p
      WHERE cm.white_name = p.username;
    `);
    
    await client.query(`
      UPDATE chess_matches cm
      SET black_player_id = p.player_id
      FROM players p
      WHERE cm.black_name = p.username;
    `);

    // 5. Update Elos from PGN or fallback
    await client.query(`
      UPDATE chess_matches
      SET white_elo = CAST(NULLIF(SUBSTRING(pgn FROM '\\[WhiteElo \"([0-9]+)\"\\]'), '') AS INT),
          black_elo = CAST(NULLIF(SUBSTRING(pgn FROM '\\[BlackElo \"([0-9]+)\"\\]'), '') AS INT)
      WHERE pgn IS NOT NULL
      AND SUBSTRING(pgn FROM '\\[WhiteElo \"([0-9]+)\"\\]') ~ '^[0-9]+$'
      AND SUBSTRING(pgn FROM '\\[BlackElo \"([0-9]+)\"\\]') ~ '^[0-9]+$';
    `);

    await client.query(`
      UPDATE chess_matches
      SET white_elo = player_elo,
          black_elo = opponent_elo
      WHERE white_elo IS NULL OR black_elo IS NULL;
    `);

    // 6. Drop old columns
    await client.query(`
      ALTER TABLE chess_matches
      DROP COLUMN IF EXISTS white_name,
      DROP COLUMN IF EXISTS black_name,
      DROP COLUMN IF EXISTS player_elo,
      DROP COLUMN IF EXISTS opponent_elo;
    `);

    await client.query('COMMIT');
    console.log("Migration successful!");
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Migration failed:", error);
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
