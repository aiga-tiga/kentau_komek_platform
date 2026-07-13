import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useLang } from "../i18n/i18n.jsx";
import { api } from "../api.js";
import { categoryColor } from "../categoryColors.js";
import HeatmapLayer from "../components/HeatmapLayer.jsx";

// Map markers are colored by status (not category) so it's obvious at a
// glance what still needs attention: new complaints in blue, ones being
// worked on in yellow, resolved ones in green.
const STATUS_COLORS = { new: "#2563eb", in_progress: "#eab308", done: "#16a34a" };
const ALL_STATUSES = ["new", "in_progress", "done"];
const TREND_PERIODS = ["week", "month", "halfyear", "year"];

const EMPTY_STATS = {
  total: 0,
  byStatus: { new: 0, in_progress: 0, done: 0 },
  byCategory: {},
  overdue: 0,
  avgResolutionHours: null,
  trend: [],
  mapPoints: [],
};

export default function Analytics() {
  const { t, lang } = useLang();
  const [meta, setMeta] = useState({ categories: [], statusLabels: {} });
  const [included, setIncluded] = useState(null); // null = "all categories", set once meta loads
  const [includedStatuses, setIncludedStatuses] = useState(ALL_STATUSES);
  const [trendPeriod, setTrendPeriod] = useState("month");
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("points");
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    api.meta().then((m) => {
      setMeta(m);
      setIncluded(m.categories.map((c) => c.id));
    });
  }, []);

  const allSelected = meta.categories.length > 0 && included?.length === meta.categories.length;

  function load() {
    if (!included) return;
    setLoading(true);
    if (included.length === 0) {
      setData(EMPTY_STATS);
      setLoading(false);
      return;
    }
    const filter = allSelected ? undefined : included;
    api
      .analytics(filter, trendPeriod)
      .then(setData)
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [included, trendPeriod]);

  function toggleCategory(id) {
    setIncluded((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // keep at least one selected
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }

  function toggleStatus(status) {
    setIncludedStatuses((prev) => {
      if (prev.includes(status)) {
        if (prev.length === 1) return prev; // keep at least one selected
        return prev.filter((x) => x !== status);
      }
      return [...prev, status];
    });
  }

  const filteredMapPoints = useMemo(
    () => (data ? data.mapPoints.filter((p) => includedStatuses.includes(p.status)) : []),
    [data, includedStatuses]
  );

  const center = useMemo(() => {
    if (data?.mapPoints?.length) return [data.mapPoints[0].lat, data.mapPoints[0].lng];
    return [43.222, 76.8512]; // fallback: Almaty
  }, [data]);

  function formatTrendLabel(day) {
    const d = new Date(day);
    if (trendPeriod === "year") {
      return d.toLocaleDateString(lang === "kk" ? "kk-KZ" : "ru-RU", { month: "short", year: "2-digit" });
    }
    return d.toLocaleDateString(lang === "kk" ? "kk-KZ" : "ru-RU", { day: "2-digit", month: "2-digit" });
  }

  if (!data) return <div className="panel-page">…</div>;

  const resolvedPercent = data.total > 0 ? Math.round((data.byStatus.done / data.total) * 100) : 0;

  return (
    <div className="panel-page analytics-page">
      <div className="panel-header">
        <h1>{t("dashboardTitle")}</h1>
        <div className="header-actions">
          <button className="btn btn-outline" onClick={() => setShowFilters((v) => !v)}>
            {t("filterByCategory")}
          </button>
          <button className="btn btn-outline" onClick={load}>
            ⟳ {t("refresh")}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => api.exportExcel(undefined, allSelected ? undefined : included)}
          >
            {t("exportExcel")}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="filter-panel">
          <div className="filter-panel-actions">
            <button className="link-btn" onClick={() => setIncluded(meta.categories.map((c) => c.id))}>
              {t("selectAll")}
            </button>
            <button className="link-btn" onClick={() => setIncluded([meta.categories[0]?.id].filter(Boolean))}>
              {t("clearAll")}
            </button>
          </div>
          <div className="filter-chips">
            {meta.categories.map((c) => {
              const active = included?.includes(c.id);
              const color = categoryColor(c.id, meta.categories);
              return (
                <button
                  key={c.id}
                  className={active ? "chip chip-active" : "chip"}
                  style={active ? { borderColor: color, color } : {}}
                  onClick={() => toggleCategory(c.id)}
                >
                  <span className="chip-dot" style={{ background: color }} />
                  {c[lang]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="analytics-grid">
        <div className="analytics-map-col">
          <div className="tabs">
            <button className={tab === "points" ? "tab active" : "tab"} onClick={() => setTab("points")}>
              {t("tabPoints")}
            </button>
            <button className={tab === "heatmap" ? "tab active" : "tab"} onClick={() => setTab("heatmap")}>
              {t("tabHeatmap")}
            </button>
          </div>

          <div className="filter-chips status-filter-chips">
            {ALL_STATUSES.map((status) => {
              const active = includedStatuses.includes(status);
              const color = STATUS_COLORS[status];
              const label = meta.statusLabels[status]?.[lang] || status;
              return (
                <button
                  key={status}
                  className={active ? "chip chip-active" : "chip"}
                  style={active ? { borderColor: color, color } : {}}
                  onClick={() => toggleStatus(status)}
                >
                  <span className="chip-dot" style={{ background: color }} />
                  {label}
                </button>
              );
            })}
          </div>

          <MapContainer center={center} zoom={12} style={{ height: "520px", borderRadius: 12 }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            {tab === "points" &&
              filteredMapPoints.map((p) => (
                <CircleMarker
                  key={p.id}
                  center={[p.lat, p.lng]}
                  radius={8}
                  pathOptions={{
                    color: "#fff",
                    weight: 2,
                    fillColor: STATUS_COLORS[p.status] || "#999",
                    fillOpacity: 0.9,
                  }}
                >
                  <Popup>
                    {p.code} — {p.address}
                  </Popup>
                </CircleMarker>
              ))}
            {tab === "heatmap" && <HeatmapLayer points={filteredMapPoints} />}
          </MapContainer>
        </div>

        <div className="analytics-sidebar">
          <h2 className="sidebar-title">{t("kpiTitle")}</h2>

          <div className="kpi-grid-2x2">
            <div className="kpi-card">
              <div className="kpi-value kpi-blue">{data.total}</div>
              <div className="kpi-label">{t("total")}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value kpi-red">{data.byStatus.new}</div>
              <div className="kpi-label">{t("kpiNew")}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value kpi-purple">{data.byStatus.in_progress}</div>
              <div className="kpi-label">{t("kpiInProgress")}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value kpi-green">{data.byStatus.done}</div>
              <div className="kpi-label">{t("kpiDone")}</div>
            </div>
          </div>

          <div className="resolved-block">
            <div className="resolved-header">
              <span>{t("resolvedPercent")}</span>
              <span>{resolvedPercent}%</span>
            </div>
            <div className="resolved-track">
              <div className="resolved-fill" style={{ width: `${resolvedPercent}%` }} />
            </div>
          </div>

          <div className="avg-resolution-line">
            {t("avgResolutionHours")}:{" "}
            <strong>{data.avgResolutionHours != null ? `${data.avgResolutionHours.toFixed(1)}h` : "—"}</strong>
          </div>

          {data.overdue > 0 && (
            <div className="overdue-line">
              {t("overdue")}: <strong>{data.overdue}</strong>
            </div>
          )}

          <h2 className="sidebar-title">{t("byCategory")}</h2>
          <div className="category-bars">
            {meta.categories
              .filter((c) => included?.includes(c.id))
              .map((c) => {
                const n = data.byCategory[c.id] || 0;
                const max = Math.max(1, ...Object.values(data.byCategory));
                const color = categoryColor(c.id, meta.categories);
                return (
                  <div className="category-bar-row" key={c.id}>
                    <div className="category-bar-label">{c[lang]}</div>
                    <div className="category-bar-track">
                      <div className="category-bar-fill" style={{ width: `${(n / max) * 100}%`, background: color }} />
                    </div>
                    <div className="category-bar-value">{n}</div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div className="trend-card">
        <div className="trend-header">
          <h2 className="sidebar-title">{t("trendTitle")}</h2>
          <div className="filter-chips">
            {TREND_PERIODS.map((p) => (
              <button
                key={p}
                className={trendPeriod === p ? "chip chip-active" : "chip"}
                onClick={() => setTrendPeriod(p)}
              >
                {t(`period${p === "halfyear" ? "HalfYear" : p[0].toUpperCase() + p.slice(1)}`)}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data.trend} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0ee" />
            <XAxis dataKey="day" tickFormatter={formatTrendLabel} tick={{ fontSize: 12, fill: "#6b7570" }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7570" }} />
            <Tooltip
              labelFormatter={formatTrendLabel}
              formatter={(value) => [value, t("trendCountLabel")]}
            />
            <Line type="monotone" dataKey="n" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}