import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { useLang } from "../i18n/i18n.jsx";
import { api } from "../api.js";

export default function ComplaintDetail() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const [complaint, setComplaint] = useState(null);
  const [meta, setMeta] = useState({ categories: [], statusLabels: {} });
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [comment, setComment] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [lightbox, setLightbox] = useState(null);

  function refresh() {
    api.getComplaint(id).then(setComplaint);
  }

  useEffect(() => {
    api.meta().then(setMeta);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!complaint) return <div className="panel-page">…</div>;

  const categoryLabel =
    complaint.category === "other"
      ? `${meta.categories.find((c) => c.id === "other")?.[lang] || "Другое"}: ${complaint.category_other || ""}`
      : meta.categories.find((c) => c.id === complaint.category)?.[lang] || complaint.category;
  const statusLabel = meta.statusLabels[complaint.status]?.[lang] || complaint.status;

  async function handleStart() {
    await api.startComplaint(id);
    refresh();
  }

  async function handleComplete(e) {
    e.preventDefault();
    setUploadError("");
    setUploading(true);
    try {
      let completion_photo;
      if (photoFile) {
        const { url } = await api.uploadPhoto(photoFile);
        completion_photo = url;
      }
      await api.completeComplaint(id, { completion_comment: comment, completion_photo });
      setShowCloseForm(false);
      refresh();
    } catch (err) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="panel-page">
      <Link className="back-link" to="/panel">
        ← {t("back")}
      </Link>
      <h1>
        {t("complaintTitle")} {complaint.code}
      </h1>
      <p className="complaint-date">{new Date(complaint.created_at).toLocaleString("ru-RU")}</p>

      <div className="detail-grid">
        <div className="detail-map">
          {complaint.lat && complaint.lng ? (
            <MapContainer center={[complaint.lat, complaint.lng]} zoom={14} style={{ height: "360px", borderRadius: 8 }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors'
              />
              <Marker position={[complaint.lat, complaint.lng]}>
                <Popup>{complaint.address}</Popup>
              </Marker>
            </MapContainer>
          ) : (
            <div className="no-map">No coordinates for this complaint</div>
          )}
        </div>

        <div className="detail-info">
          <Row label={t("statusLabel")}>
            <span className={`status-pill status-${complaint.status}`}>{statusLabel}</span>
          </Row>
          <Row label={t("regionLabel")}>{complaint.region || "—"}</Row>
          <Row label={t("deadlineLabel")}>
            {complaint.deadline ? new Date(complaint.deadline).toLocaleString("ru-RU") : t("notAssigned")}
          </Row>
          <Row label={t("applicantLabel")}>
            {complaint.applicant_name}
            <br />
            {complaint.applicant_phone}
          </Row>
          <Row label={t("addressLabel")}>{complaint.address}</Row>
          <Row label={t("categoryLabel")}>{categoryLabel}</Row>
          <Row label={t("descriptionLabel")}>{complaint.description}</Row>

          {complaint.source_photo && (
            <Row label={t("sourcePhotoLabel")}>
              <img
                className="detail-photo detail-photo-clickable"
                src={complaint.source_photo}
                alt=""
                onClick={() => setLightbox(complaint.source_photo)}
              />
            </Row>
          )}

          {complaint.completion_comment && <Row label={t("commentLabel")}>{complaint.completion_comment}</Row>}
          {complaint.completion_photo && (
            <Row label={t("photosFromExecutor")}>
              <img
                className="detail-photo detail-photo-clickable"
                src={complaint.completion_photo}
                alt=""
                onClick={() => setLightbox(complaint.completion_photo)}
              />
            </Row>
          )}

          <div className="detail-actions">
            {complaint.status === "new" && (
              <button className="btn btn-primary" onClick={handleStart}>
                {t("startWork")}
              </button>
            )}
            {complaint.status === "in_progress" && !showCloseForm && (
              <button className="btn btn-primary" onClick={() => setShowCloseForm(true)}>
                {t("closeComplaint")}
              </button>
            )}
          </div>

          {showCloseForm && (
            <form className="close-form" onSubmit={handleComplete}>
              <label>
                {t("completionComment")}
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
              </label>
              <label>
                {t("completionPhotoUrl")} <span className="optional-hint">({t("optionalHint")})</span>
                <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
              </label>
              {uploadError && <div className="form-error">{uploadError}</div>}
              <div className="detail-actions">
                <button className="btn btn-primary" type="submit" disabled={uploading}>
                  {uploading ? "…" : t("confirmClose")}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowCloseForm(false)}>
                  {t("cancel")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

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

function Row({ label, children }) {
  return (
    <div className="detail-row">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{children}</div>
    </div>
  );
}