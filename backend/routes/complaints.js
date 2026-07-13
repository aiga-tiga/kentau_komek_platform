const express = require("express");
const { pool, generateCode, generateAccessCode } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { DEFAULT_DEADLINE_DAYS, CATEGORIES, STATUS_LABELS } = require("../constants");
const { notifyStatusChange } = require("../notify");

// Excel export always uses Russian labels, regardless of the UI language the
// person exporting happens to have selected - it's an internal/back-office
// document, not something citizens see.
const EXPORT_LANG = "ru";

function categoryLabelFor(row) {
  if (row.category === "other") {
    const otherLabel = CATEGORIES.find((c) => c.id === "other")?.[EXPORT_LANG] || "Другое";
    return row.category_other ? `${otherLabel}: ${row.category_other}` : otherLabel;
  }
  const found = CATEGORIES.find((c) => c.id === row.category);
  return found ? found[EXPORT_LANG] : row.category;
}

function statusLabelFor(row) {
  return STATUS_LABELS[row.status]?.[EXPORT_LANG] || row.status;
}

const router = express.Router();

// Create a complaint. Called by the Telegram bot (or any intake channel).
// Protected by a shared secret instead of employee JWT, since the bot isn't a logged-in employee.
router.post("/", async (req, res, next) => {
  try {
    const botSecret = req.headers["x-bot-secret"];
    if (process.env.BOT_SHARED_SECRET && botSecret !== process.env.BOT_SHARED_SECRET) {
      return res.status(401).json({ error: "Invalid bot secret" });
    }

    const {
      category,
      category_other,
      description,
      region,
      address,
      lat,
      lng,
      applicant_name,
      applicant_phone,
      source_photo,
      telegram_chat_id,
      telegram_lang,
    } = req.body || {};

    if (!category || !address) {
      return res.status(400).json({ error: "category and address are required" });
    }

    let code;
    let exists = true;
    while (exists) {
      code = generateCode();
      const check = await pool.query("SELECT 1 FROM complaints WHERE code = $1", [code]);
      exists = check.rows.length > 0;
    }
    const access_code = generateAccessCode();

    const { rows } = await pool.query(
      `INSERT INTO complaints
       (code, status, category, category_other, description, region, address, lat, lng,
        applicant_name, applicant_phone, source_photo, telegram_chat_id, telegram_lang, access_code)
       VALUES ($1, 'new', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        code,
        category,
        category_other || null,
        description || null,
        region || null,
        address,
        lat ?? null,
        lng ?? null,
        applicant_name || null,
        applicant_phone || null,
        source_photo || null,
        telegram_chat_id || null,
        telegram_lang || null,
        access_code,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// List complaints, optionally filtered by status/category. Employee-only (the
// analytics account doesn't need to browse individual complaints).
router.get("/", requireAuth, requireRole("employee"), async (req, res, next) => {
  try {
    const { status, sort, categories } = req.query;
    let sql = "SELECT * FROM complaints";
    const params = [];
    const clauses = [];
    if (status) {
      params.push(status);
      clauses.push(`status = $${params.length}`);
    }
    if (categories) {
      const list = categories.split(",").filter(Boolean);
      if (list.length) {
        params.push(list);
        clauses.push(`category = ANY($${params.length})`);
      }
    }
    if (clauses.length) sql += " WHERE " + clauses.join(" AND ");
    sql += sort === "deadline" ? " ORDER BY deadline ASC NULLS LAST" : " ORDER BY created_at DESC";

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Public status lookup for citizens - no login, just the complaint code +
// the access code they got via Telegram when they filed it. Deliberately
// returns only citizen-facing fields (no phone, no internal id, no access
// code) even though both codes already proved it's theirs.
router.get("/lookup", async (req, res, next) => {
  try {
    const { code, access_code } = req.query;
    if (!code || !access_code) {
      return res.status(400).json({ error: "code and access_code are required" });
    }

    const { rows } = await pool.query(
      "SELECT * FROM complaints WHERE code = $1 AND access_code = $2",
      [String(code).trim().toUpperCase(), String(access_code).trim()]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Жалоба не найдена. Проверьте номер и код доступа." });
    }

    const c = rows[0];
    res.json({
      code: c.code,
      status: c.status,
      category: c.category,
      category_other: c.category_other,
      description: c.description,
      address: c.address,
      created_at: c.created_at,
      deadline: c.deadline,
      completion_comment: c.completion_comment,
      completion_photo: c.completion_photo,
      completed_at: c.completed_at,
    });
  } catch (err) {
    next(err);
  }
});

// Lets the bot answer "/my" - list of a citizen's own complaints straight
// from their Telegram chat, no codes to type. Only the bot itself calls this
// (protected the same way complaint creation is, with a shared secret) -
// a bare chat_id isn't proof of identity the way code+access_code is, so
// this must stay a server-to-server call, never a public endpoint.
router.get("/by-chat/:chatId", async (req, res, next) => {
  try {
    const botSecret = req.headers["x-bot-secret"];
    if (process.env.BOT_SHARED_SECRET && botSecret !== process.env.BOT_SHARED_SECRET) {
      return res.status(401).json({ error: "Invalid bot secret" });
    }

    const { rows } = await pool.query(
      `SELECT code, status, category, category_other, address, created_at, completion_comment
       FROM complaints WHERE telegram_chat_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.params.chatId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Single complaint detail.
router.get("/:id", requireAuth, requireRole("employee"), async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM complaints WHERE id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Operator moves a complaint to "in_progress" -> sets the 7-day deadline clock running.
router.patch("/:id/start", requireAuth, requireRole("employee"), async (req, res, next) => {
  try {
    const existing = await pool.query("SELECT * FROM complaints WHERE id = $1", [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: "Not found" });

    const deadline = new Date(Date.now() + DEFAULT_DEADLINE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { rows } = await pool.query(
      `UPDATE complaints
       SET status = 'in_progress', started_at = now(), deadline = $1
       WHERE id = $2 RETURNING *`,
      [deadline, req.params.id]
    );
    notifyStatusChange(rows[0]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Operator closes a complaint out with a confirmation photo + comment.
router.patch("/:id/complete", requireAuth, requireRole("employee"), async (req, res, next) => {
  try {
    const existing = await pool.query("SELECT * FROM complaints WHERE id = $1", [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: "Not found" });

    const { completion_comment, completion_photo } = req.body || {};

    const { rows } = await pool.query(
      `UPDATE complaints
       SET status = 'done', completion_comment = $1, completion_photo = $2, completed_at = now()
       WHERE id = $3 RETURNING *`,
      [completion_comment || null, completion_photo || null, req.params.id]
    );
    notifyStatusChange(rows[0]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Excel export for both the analytics dashboard and the employee desk.
// Either account role can export (employee or analyst).
router.get("/export/xlsx", requireAuth, async (req, res, next) => {
  try {
    const { status, categories } = req.query;
    let sql = "SELECT * FROM complaints";
    const params = [];
    const clauses = [];
    if (status) {
      params.push(status);
      clauses.push(`status = $${params.length}`);
    }
    if (categories) {
      const list = categories.split(",").filter(Boolean);
      if (list.length) {
        params.push(list);
        clauses.push(`category = ANY($${params.length})`);
      }
    }
    if (clauses.length) sql += " WHERE " + clauses.join(" AND ");
    sql += " ORDER BY created_at DESC";

    const { rows } = await pool.query(sql, params);

    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Complaints");

    sheet.columns = [
      { header: "Код", key: "code", width: 12 },
      { header: "Дата", key: "created_at", width: 20 },
      { header: "Статус", key: "status", width: 16 },
      { header: "Категория", key: "category", width: 30 },
      { header: "Регион", key: "region", width: 14 },
      { header: "Адрес", key: "address", width: 28 },
      { header: "Широта", key: "lat", width: 12 },
      { header: "Долгота", key: "lng", width: 12 },
      { header: "Заявитель", key: "applicant_name", width: 22 },
      { header: "Телефон", key: "applicant_phone", width: 16 },
      { header: "Срок", key: "deadline", width: 20 },
      { header: "Комментарий", key: "completion_comment", width: 30 },
    ];
    sheet.getRow(1).font = { bold: true };

    // Category and status are stored as stable internal IDs (e.g. "water",
    // "done") - translate them to Russian display labels for this export
    // instead of dumping the raw IDs. "Категория" now also folds in the
    // free-text "Другое" (Other) description, so that column is dropped.
    for (const r of rows) {
      sheet.addRow({
        ...r,
        status: statusLabelFor(r),
        category: categoryLabelFor(r),
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=complaints.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;