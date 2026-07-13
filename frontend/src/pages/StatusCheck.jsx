import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLang } from "../i18n/i18n.jsx";
import { api } from "../api.js";

export default function StatusCheck() {
  const { t, lang } = useLang();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") || "");
  const [accessCode, setAccessCode] = useState("");
  const [meta, setMeta] = useState({ categories: [], statusLabels: {} });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.meta().then(setMeta);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const data = await api.lookupComplaint(code.trim(), accessCode.trim());
      setResult(data);
    } catch (err) {
      setError(err.message || t("lookupNotFound"));
    } finally {
      setLoading(false);
    }
  }

  const categoryLabel =
    result &&
    (result.category === "other"
      ? `${meta.categories.find((c) => c.id === "other")?.[lang] || "Другое"}: ${result.category_other || ""}`
      : meta.categories.find((c) => c.id === result.category)?.[lang] || result.category);
  const statusLabel = result && (meta.statusLabels[result.status]?.[lang] || result.status);

  return (
    <div className="status-check-page">
      <h1>{t("statusCheckTitle")}</h1>
      <p className="landing-tagline">{t("statusCheckHint")}</p>

      <form className="login-card status-check-form" onSubmit={handleSubmit}>
        <label>
          {t("complaintCodeLabel")}
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AB-12345" required />
        </label>
        <label>
          {t("accessCodeLabel")}
          <input
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            placeholder="123456"
            required
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "…" : t("checkStatusBtn")}
        </button>
      </form>

      {result && (
        <div className="detail-info status-check-result">
          <Row label={t("statusLabel")}>
            <span className={`status-pill status-${result.status}`}>{statusLabel}</span>
          </Row>
          <Row label={t("categoryLabel")}>{categoryLabel}</Row>
          <Row label={t("addressLabel")}>{result.address || "—"}</Row>
          {result.description && <Row label={t("descriptionLabel")}>{result.description}</Row>}
          {result.deadline && (
            <Row label={t("deadlineLabel")}>{new Date(result.deadline).toLocaleDateString("ru-RU")}</Row>
          )}
          {result.completion_comment && <Row label={t("commentLabel")}>{result.completion_comment}</Row>}
          {result.completion_photo && (
            <Row label={t("photosFromExecutor")}>
              <img className="detail-photo" src={result.completion_photo} alt="" />
            </Row>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="detail-row">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{children}</div>
    </div>
  );
}