const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { STATUSES, CATEGORIES } = require("../constants");

const router = express.Router();

// Trend chart granularity: short ranges are grouped by day so the line has
// enough points to be readable; longer ranges are grouped by week/month so
// it doesn't render hundreds of points.
const TREND_PERIODS = {
  week: { interval: "7 days", trunc: "day" },
  month: { interval: "30 days", trunc: "day" },
  halfyear: { interval: "182 days", trunc: "week" },
  year: { interval: "365 days", trunc: "month" },
};

// All KPIs support an optional ?categories=id1,id2 filter so the dashboard's
// category filter can narrow down everything at once (KPI cards, map, heatmap, trend).
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const list = req.query.categories ? req.query.categories.split(",").filter(Boolean) : [];
    const where = list.length ? "WHERE category = ANY($1)" : "";
    const params = list.length ? [list] : [];

    const statusCounts = await pool.query(
      `SELECT status, COUNT(*)::int AS n FROM complaints ${where} GROUP BY status`,
      params
    );
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const row of statusCounts.rows) byStatus[row.status] = row.n;

    const categoryCounts = await pool.query(
      `SELECT category, COUNT(*)::int AS n FROM complaints ${where} GROUP BY category`,
      params
    );
    const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
    for (const row of categoryCounts.rows) byCategory[row.category] = row.n;

    const total = await pool.query(`SELECT COUNT(*)::int AS n FROM complaints ${where}`, params);

    const overdueWhere = list.length
      ? "WHERE category = ANY($1) AND status = 'in_progress' AND deadline < now()"
      : "WHERE status = 'in_progress' AND deadline < now()";
    const overdue = await pool.query(`SELECT COUNT(*)::int AS n FROM complaints ${overdueWhere}`, params);

    const avgWhere = list.length
      ? "WHERE category = ANY($1) AND completed_at IS NOT NULL"
      : "WHERE completed_at IS NOT NULL";
    const avgResolution = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600.0) AS hours
       FROM complaints ${avgWhere}`,
      params
    );

    // Daily/weekly/monthly complaint volume for the trend chart, range and
    // grouping depend on the requested period (defaults to "month").
    const period = TREND_PERIODS[req.query.period] ? req.query.period : "month";
    const { interval, trunc } = TREND_PERIODS[period];
    const trendWhere = list.length
      ? `WHERE category = ANY($1) AND created_at > now() - interval '${interval}'`
      : `WHERE created_at > now() - interval '${interval}'`;
    const trend = await pool.query(
      `SELECT to_char(date_trunc('${trunc}', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
       FROM complaints ${trendWhere}
       GROUP BY 1 ORDER BY 1`,
      params
    );

    const pointsWhere = list.length
      ? "WHERE category = ANY($1) AND lat IS NOT NULL AND lng IS NOT NULL"
      : "WHERE lat IS NOT NULL AND lng IS NOT NULL";
    const mapPoints = await pool.query(
      `SELECT id, code, status, category, address, lat, lng FROM complaints ${pointsWhere}`,
      params
    );

    res.json({
      total: total.rows[0].n,
      byStatus,
      byCategory,
      overdue: overdue.rows[0].n,
      avgResolutionHours: avgResolution.rows[0].hours ? Number(avgResolution.rows[0].hours) : null,
      trend: trend.rows,
      trendPeriod: period,
      mapPoints: mapPoints.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;