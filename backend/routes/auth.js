const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");

const router = express.Router();

router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const { rows } = await pool.query("SELECT * FROM employees WHERE username = $1", [username]);
    const employee = rows[0];
    if (!employee || !bcrypt.compareSync(password, employee.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: employee.id, username: employee.username, fullName: employee.full_name, role: employee.role },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: "12h" }
    );

    res.json({
      token,
      employee: { id: employee.id, username: employee.username, fullName: employee.full_name, role: employee.role },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
