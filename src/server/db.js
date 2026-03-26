import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'data.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema (idempotent — all statements use CREATE TABLE IF NOT EXISTS)
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

export default db;
