const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL && !process.env.DB_PASSWORD) {
  throw new Error('Missing database credentials. Set DATABASE_URL or DB_* env vars.');
}

const pool = new Pool(
  process.env.DATABASE_URL 
    ? { 
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    : {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'chess_analyzer',
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT || '5432', 10),
        ssl: process.env.DB_HOST && process.env.DB_HOST.includes('neon') ? { rejectUnauthorized: false } : false
      }
);

module.exports = pool;
