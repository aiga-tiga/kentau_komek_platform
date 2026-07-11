// Run once with `npm run seed` to set up tables and create the two demo logins:
// one for the operator (employee panel), one shared for the analytics panel.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool, initSchema } = require("./db");

const ACCOUNTS = [
  { username: "operator", password: "operator123", full_name: "Оператор", role: "employee" },
  { username: "analyst", password: "analyst123", full_name: "Аналитика", role: "analyst" },
];

async function main() {
  await initSchema();

  for (const acc of ACCOUNTS) {
    const existing = await pool.query("SELECT id FROM employees WHERE username = $1", [acc.username]);
    if (existing.rows[0]) {
      console.log(`"${acc.username}" already exists (id ${existing.rows[0].id}).`);
      continue;
    }
    const hash = bcrypt.hashSync(acc.password, 10);
    await pool.query(
      "INSERT INTO employees (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4)",
      [acc.username, hash, acc.full_name, acc.role]
    );
    console.log(`Created "${acc.username}" / "${acc.password}" (role: ${acc.role}).`);
  }

  console.log("Seed complete. operator/operator123 -> employee panel, analyst/analyst123 -> analytics panel.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
