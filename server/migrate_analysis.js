const pool = require('./db');

// Adds the tables for saved engine reviews, coach's notes and training puzzles.
// Only creates what's missing, so it's safe to run more than once.
const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS game_analysis (
        match_id INTEGER PRIMARY KEY REFERENCES chess_matches(match_id) ON DELETE CASCADE,
        evals JSONB NOT NULL,
        best_moves JSONB,
        report JSONB,
        analysed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reported_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS puzzles (
        puzzle_id SERIAL PRIMARY KEY,
        match_id INTEGER NOT NULL REFERENCES chess_matches(match_id) ON DELETE CASCADE,
        ply INTEGER NOT NULL,
        fen TEXT NOT NULL,
        played_san VARCHAR(12) NOT NULL,
        solution_uci VARCHAR(5) NOT NULL,
        solution_san VARCHAR(12) NOT NULL,
        win_chance_loss REAL NOT NULL,
        ease REAL NOT NULL DEFAULT 2.5,
        interval_days REAL NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        solves INTEGER NOT NULL DEFAULT 0,
        due_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_attempt_at TIMESTAMPTZ,
        UNIQUE (match_id, ply)
      );
    `);

    await client.query('CREATE INDEX IF NOT EXISTS puzzles_due_at_idx ON puzzles (due_at);');

    await client.query('COMMIT');
    console.log('Migration successful!');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
