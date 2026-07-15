const { Pool } = require("pg");

// Reads standard PG* env vars / DATABASE_URL. See backend/.env.example.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee'
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      status TEXT NOT NULL DEFAULT 'new',
      category TEXT NOT NULL,
      category_other TEXT,
      description TEXT,
      region TEXT,
      address TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      applicant_name TEXT,
      applicant_phone TEXT,
      source_photo TEXT,
      assigned_employee TEXT,
      started_at TIMESTAMPTZ,
      deadline TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      completion_comment TEXT,
      completion_photo TEXT,
      telegram_chat_id TEXT,
      telegram_lang TEXT,
      access_code TEXT,
      archived BOOLEAN NOT NULL DEFAULT false
    );

    -- Migrations for databases created before these columns existed.
    ALTER TABLE complaints ADD COLUMN IF NOT EXISTS access_code TEXT;
    ALTER TABLE complaints ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

    CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
    CREATE INDEX IF NOT EXISTS idx_complaints_created_at ON complaints(created_at);
    CREATE INDEX IF NOT EXISTS idx_complaints_archived ON complaints(archived);
  `);
}

function generateCode() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const two = letters[Math.floor(Math.random() * 26)] + letters[Math.floor(Math.random() * 26)];
  const five = Math.floor(10000 + Math.random() * 90000);
  return `${two}-${five}`;
}

// Short numeric code sent by SMS/Telegram alongside the complaint code, so a
// citizen can look up their complaint's status without any account/login -
// knowing both codes together is treated as proof it's theirs.
function generateAccessCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

module.exports = { pool, initSchema, generateCode, generateAccessCode };