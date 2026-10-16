const pool = require('./db');

// Backfills player_color and tracked_username on games imported before those columns existed.
// The stored result is from the tracked player's side, so comparing it with the PGN's Result
// tells us which colour they played. Draws can't be decided that way, so they take whichever
// player the decisive games of the same source point to.
// Dry run by default; pass --apply to write.
const apply = process.argv.includes('--apply');

const pgnTag = (pgn, tag) => {
  const line = (pgn || '').split('\n').find((l) => l.startsWith(`[${tag} "`));
  return line ? line.slice(tag.length + 3, line.lastIndexOf('"')) : null;
};

const colorFromResult = (result, pgnResult) => {
  const whiteWon = pgnResult === '1-0';
  const blackWon = pgnResult === '0-1';
  if (!whiteWon && !blackWon) return null;
  if (result === 'Win') return whiteWon ? 'white' : 'black';
  if (result === 'Loss') return whiteWon ? 'black' : 'white';
  return null;
};

const migrate = async () => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT cm.match_id, cm.result, cm.pgn, cm.source,
             wp.username AS white_username, bp.username AS black_username
      FROM chess_matches cm
      LEFT JOIN players wp ON cm.white_player_id = wp.player_id
      LEFT JOIN players bp ON cm.black_player_id = bp.player_id
      WHERE cm.player_color IS NULL OR cm.tracked_username IS NULL
      ORDER BY cm.match_id;
    `);
    if (rows.length === 0) {
      console.log('Nothing to backfill.');
      return;
    }

    const updates = [];
    const undecided = [];
    const votes = {};
    for (const m of rows) {
      const color = colorFromResult(m.result, pgnTag(m.pgn, 'Result'));
      if (!color) { undecided.push(m); continue; }
      const username = m[`${color}_username`];
      const source = m.source || 'chess.com';
      votes[source] = votes[source] || {};
      votes[source][username] = (votes[source][username] || 0) + 1;
      updates.push({ match: m, color, username });
    }

    // A decisive game that disagrees with the majority means the stored result can't be trusted
    const majority = {};
    for (const [source, counts] of Object.entries(votes)) {
      majority[source] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    }
    const skipped = [];
    const confirmed = updates.filter((u) => {
      if (u.username === majority[u.match.source || 'chess.com']) return true;
      skipped.push({ match: u.match, reason: `result points to ${u.username}, majority is ${majority[u.match.source || 'chess.com']}` });
      return false;
    });

    for (const m of undecided) {
      const you = majority[m.source || 'chess.com'];
      if (you && m.white_username === you) confirmed.push({ match: m, color: 'white', username: you });
      else if (you && m.black_username === you) confirmed.push({ match: m, color: 'black', username: you });
      else skipped.push({ match: m, reason: 'no decisive game to identify the tracked player' });
    }

    confirmed.sort((a, b) => a.match.match_id - b.match.match_id);
    for (const u of confirmed) {
      const m = u.match;
      console.log(`#${m.match_id} ${m.white_username} vs ${m.black_username} (${m.result}) -> ${u.username} as ${u.color}`);
    }
    for (const s of skipped) {
      console.log(`#${s.match.match_id} skipped: ${s.reason}`);
    }

    if (!apply) {
      console.log(`\nDry run: ${confirmed.length} to update, ${skipped.length} skipped. Re-run with --apply to write.`);
      return;
    }

    await client.query('BEGIN');
    for (const u of confirmed) {
      await client.query(
        'UPDATE chess_matches SET player_color = $1, tracked_username = $2 WHERE match_id = $3',
        [u.color, u.username, u.match.match_id]
      );
    }
    await client.query('COMMIT');
    console.log(`\nUpdated ${confirmed.length} games, skipped ${skipped.length}.`);
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
