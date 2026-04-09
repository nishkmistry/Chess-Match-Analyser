const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'chess_analyzer',
  password: process.env.DB_PASSWORD || 'nishk',
  port: process.env.DB_PORT || 5432,
});

module.exports = pool;
