const pool = require('./db');
const runMigration = async () => {
    try {
        await pool.query(`
            ALTER TABLE chess_matches
            ADD COLUMN IF NOT EXISTS white_name VARCHAR(100),
            ADD COLUMN IF NOT EXISTS black_name VARCHAR(100);
        `);
        
        await pool.query(`
            UPDATE chess_matches
            SET white_name = SUBSTRING(pgn FROM '\\[White \"([^\"]+)\"\\]'),
                black_name = SUBSTRING(pgn FROM '\\[Black \"([^\"]+)\"\\]')
            WHERE pgn IS NOT NULL AND white_name IS NULL;
        `);

        await pool.query(`
             ALTER TABLE chess_matches
             DROP COLUMN IF EXISTS opponent_name,
             DROP COLUMN IF EXISTS opening_name;
        `);
        console.log("Migration successful");
    } catch(e) {
        console.error(e);
    } finally {
        pool.end();
    }
};
runMigration();
