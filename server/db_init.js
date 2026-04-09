const { Client } = require('pg');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function initializeDB() {
    const defaultClient = new Client({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: 'postgres',
        password: process.env.DB_PASSWORD || 'nishk',
        port: process.env.DB_PORT || 5432,
    });

    try {
        console.log("Connecting to default postgres database...");
        await defaultClient.connect();

        
        const res = await defaultClient.query("SELECT datname FROM pg_catalog.pg_database WHERE datname = 'chess_analyzer'");
        if (res.rowCount === 0) {
            console.log("Creating database chess_analyzer...");
            await defaultClient.query('CREATE DATABASE chess_analyzer');
            console.log("Database created successfully.");
        } else {
            console.log("Database chess_analyzer already exists.");
        }
    } catch (err) {
        console.error("Error creating database:", err);
    } finally {
        await defaultClient.end();
    }

    
    const targetClient = new Client({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'chess_analyzer',
        password: process.env.DB_PASSWORD || 'nishk',
        port: process.env.DB_PORT || 5432,
    });

    try {
        console.log("Connecting to chess_analyzer database...");
        await targetClient.connect();

        const schemaPath = path.join(__dirname, '..', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        console.log("Applying schema.sql...");
        await targetClient.query(schema);
        console.log("Schema applied successfully.");
        
        
        const { rows } = await targetClient.query('SELECT * FROM chess_matches');
        console.log(`Seeded matching rows: ${rows.length}`);
    } catch (err) {
        console.error("Error running schema:", err);
    } finally {
        await targetClient.end();
    }
}

initializeDB();
