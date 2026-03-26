#!/usr/bin/env node
/**
 * Create the first admin user.
 * Usage:
 *   node scripts/seed-admin.js --email admin@example.com --password secret123 --name "Admin"
 * Or via env:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... node scripts/seed-admin.js
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import db from '../src/server/db.js';

function arg(flag, envVar) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : process.env[envVar];
}

const email = arg('--email', 'ADMIN_EMAIL');
const password = arg('--password', 'ADMIN_PASSWORD');
const name = arg('--name', 'ADMIN_NAME') || 'Admin';

if (!email || !password) {
  console.error('Usage: node scripts/seed-admin.js --email <email> --password <password> [--name <name>]');
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
if (existing) {
  console.log(`User ${email} already exists (id=${existing.id}). Nothing to do.`);
  process.exit(0);
}

const hash = await bcrypt.hash(password, 12);
const result = db.prepare(
  'INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)'
).run(email.toLowerCase(), hash, name, 'admin');

console.log(`✓ Admin created: ${name} <${email}> (id=${result.lastInsertRowid})`);
