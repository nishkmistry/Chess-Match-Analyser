-- Create Enum Type for results (if not exists)
DO $$ BEGIN
    CREATE TYPE match_result AS ENUM ('Win', 'Loss', 'Draw');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS players (
    player_id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS chess_matches (
    match_id SERIAL PRIMARY KEY,
    white_player_id INTEGER REFERENCES players(player_id),
    black_player_id INTEGER REFERENCES players(player_id),
    white_elo INTEGER NOT NULL CHECK (white_elo > 0),
    black_elo INTEGER NOT NULL CHECK (black_elo > 0),
    result match_result NOT NULL,
    game_hash TEXT UNIQUE NOT NULL,
    pgn TEXT,
    played_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    player_color VARCHAR(5) CHECK (player_color IN ('white', 'black')),
    tracked_username VARCHAR(100),
    source VARCHAR(20) DEFAULT 'chess.com'
);

-- Stockfish review of a game, saved so it never has to run twice, plus the AI coach's notes
CREATE TABLE IF NOT EXISTS game_analysis (
    match_id INTEGER PRIMARY KEY REFERENCES chess_matches(match_id) ON DELETE CASCADE,
    evals JSONB NOT NULL,          -- one White-POV score per position
    best_moves JSONB,              -- engine's best move (UCI) per position
    report JSONB,
    analysed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reported_at TIMESTAMPTZ
);

-- Positions where the tracked player went wrong, replayed on a spaced-repetition schedule
CREATE TABLE IF NOT EXISTS puzzles (
    puzzle_id SERIAL PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES chess_matches(match_id) ON DELETE CASCADE,
    ply INTEGER NOT NULL,                  -- the mistake's ply; fen is the position before it
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

CREATE INDEX IF NOT EXISTS puzzles_due_at_idx ON puzzles (due_at);
