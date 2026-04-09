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
    notes TEXT
);
