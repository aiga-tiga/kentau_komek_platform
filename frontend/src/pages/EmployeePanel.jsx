import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../i18n/i18n.jsx";
import { api } from "../api.js";

const TABS = [
  { key: "new", labelKey: "tabNew" },
  { key: "in_progress", labelKey: "tabInProgress" },
  { key: "done", labelKey: "tabDone" },
  { key: "archived", labelKey: "tabArchived" },
];

export default function EmployeePanel() {
  const { t, lang } = useLang();
  const [tab, setTab] = useState("new");
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ categories: [], statusLabels: {} });
  const [sortByDate, setSortByDate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);

  const isArchiveView = tab === "archived";

  useEffect(() => {
    api.meta().then(setMeta);
  }, []);

  function load() {
    setLoading(true);
    const statusFilter = isArchiveView ? undefined : tab;
    api
      .listComplaints(statusFilter, undefined, isArchiveView)
      .then((data) => {
        const sorted =
          sortByDate && tab === "done" ? [...data].sort((a, b) => (a.deadline || "").localeCompare(b.deadline || "")) : data;
        setRows(sorted);
      })
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [tab, sortByDate]);

  function categoryLabel(row) {
    if (row.category === "other") return `${t("tabOther") || "Другое"}: ${row.category_other || ""}`;
    const c = meta.categories.find((c) => c.id === row.category);
    return c ? c[lang] : row.category;
  }

  function statusLabel(status) {
    return meta.statusLabels[status] ? meta.statusLabels[status][lang] : status;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU") + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  async function toggleArchive(row) {
    if (isArchiveView) {
      await api.unarchiveComplaint(row.id);
    } else {
      if (!window.confirm(t("archiveConfirm"))) return;
      await api.archiveComplaint(row.id);
    }
    load();
  }

  return (
    <div className="panel-page">
      <div className="panel-header">
        <h1>{t("complaints")}</h1>
        <button className="btn btn-secondary" onClick={() => api.exportExcel(isArchiveView ? undefined : tab, undefined, isArchiveView)}>
          {t("exportExcel")}
        </button>
      </div>

      <div className="tabs">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            className={tab === tb.key ? "tab active" : "tab"}
            onClick={() => setTab(tb.key)}
          >
            {t(tb.labelKey)}
          </button>
        ))}
        {tab === "done" && (
          <label className="sort-checkbox">
            <input type="checkbox" checked={sortByDate} onChange={(e) => setSortByDate(e.target.checked)} />
            {t("sortByCompletionDate")}
          </label>
        )}
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>{t("colCode")}</th>
            <th>{t("colDate")}</th>
            <th>{t("colStatus")}</th>
            <th>{t("colRegion")}</th>
            <th>{t("colAddress")}</th>
            <th>{t("colCategory")}</th>
            <th>{t("colDescription")}</th>
            <th>{t("colApplicant")}</th>
            <th>{t("colPhoto")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={10} className="empty-cell">
                {t("noData")}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link to={`/panel/complaints/${r.id}`}>{r.code}</Link>
              </td>
              <td>{fmtDate(r.created_at)}</td>
              <td>
                <span className={`status-pill status-${r.status}`}>{statusLabel(r.status)}</span>
              </td>
              <td>{r.region || "—"}</td>
              <td>{r.address}</td>
              <td>{categoryLabel(r)}</td>
              <td>{r.description}</td>
              <td>{r.applicant_name}<br />{r.applicant_phone}</td>
              <td>
                {r.source_photo || r.completion_photo ? (
                  <img
                    className="thumb thumb-clickable"
                    src={r.completion_photo || r.source_photo}
                    alt=""
                    onClick={() => setLightbox(r.completion_photo || r.source_photo)}
                  />
                ) : (
                  "—"
                )}
              </td>
              <td>
                <button className="link-btn small-link-btn" onClick={() => toggleArchive(r)}>
                  {isArchiveView ? t("unarchiveBtn") : t("archiveBtn")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <img className="lightbox-image" src={lightbox} alt="" onClick={(e) => e.stopPropagation()} />
          <button className="lightbox-close" onClick={() => setLightbox(null)} aria-label={t("cancel")}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}