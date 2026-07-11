require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { initSchema } = require("./db");
const { UPLOAD_DIR } = require("./storage");
const authRoutes = require("./routes/auth");
const complaintsRoutes = require("./routes/complaints");
const analyticsRoutes = require("./routes/analytics");
const uploadsRoutes = require("./routes/uploads");
const { CATEGORIES, STATUS_LABELS } = require("./constants");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.get("/api/meta", (req, res) => res.json({ categories: CATEGORIES, statusLabels: STATUS_LABELS }));

app.use("/api/auth", authRoutes);
app.use("/api/complaints", complaintsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/uploads", uploadsRoutes);

// Central error handler so route handlers can just call next(err).
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;

initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
