const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { upload, urlFor } = require("../storage");

const router = express.Router();

// Employee panel uses this to upload the "completion photo" when closing a
// complaint. Returns a URL that's then passed to PATCH /complaints/:id/complete.
router.post("/", requireAuth, upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded (field name must be 'photo')" });
  res.status(201).json({ url: urlFor(req.file.filename) });
});

// Separate, bot-only upload endpoint: the Telegram bot isn't a logged-in
// employee, so it authenticates with the shared secret instead of a JWT.
router.post("/bot", upload.single("photo"), (req, res) => {
  const botSecret = req.headers["x-bot-secret"];
  if (process.env.BOT_SHARED_SECRET && botSecret !== process.env.BOT_SHARED_SECRET) {
    return res.status(401).json({ error: "Invalid bot secret" });
  }
  if (!req.file) return res.status(400).json({ error: "No file uploaded (field name must be 'photo')" });
  res.status(201).json({ url: urlFor(req.file.filename) });
});

module.exports = router;
