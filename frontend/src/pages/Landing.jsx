import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useLang } from "../i18n/i18n.jsx";

const STAGES = [
  { key: "new", color: "red", icon: "!" },
  { key: "progress", color: "amber", icon: "…" },
  { key: "done", color: "green", icon: "✓" },
];

export default function Landing() {
  const { t } = useLang();
  const [stage, setStage] = useState(0);
  const prefersReducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    if (prefersReducedMotion.current) return;
    const id = setInterval(() => {
      setStage((s) => (s + 1) % STAGES.length);
    }, 2600);
    return () => clearInterval(id);
  }, []);

  const current = STAGES[stage];

  return (
    <div className="landing">
      <div className="landing-hero">
        <div className="landing-hero-text">
          <div className="landing-eyebrow">{t("landingEyebrow")}</div>
          <h1>{t("appName")}</h1>
          <p className="landing-tagline">{t("tagline")}</p>

          <div className="landing-actions">
            <a
              className="btn btn-primary"
              href="https://t.me/kentau_ikomek_bot"
              target="_blank"
              rel="noreferrer"
            >
              ✈️ {t("submitViaTelegram")}
            </a>
            <Link className="btn btn-outline" to="/analytics">
              📊 {t("analyticsPanel")}
            </Link>
            <Link className="btn btn-outline" to="/login">
              {t("loginAsEmployee")}
            </Link>
          </div>
        </div>

        <div className="landing-hero-visual" aria-hidden="true">
          <div className="ticket-card">
            <div className="ticket-card-top">
              <span className="ticket-code">KNT-2481</span>
              <span className={`ticket-pill ticket-pill-${current.color}`}>
                {t(`landingStage_${current.key}`)}
              </span>
            </div>

            <div className="ticket-icon-wrap">
              <span key={`ring-${stage}`} className={`ticket-ring ticket-ring-${current.color}`} />
              <span key={`icon-${stage}`} className={`ticket-icon ticket-icon-${current.color}`}>
                {current.icon}
              </span>
            </div>

            <div className="ticket-progress-track">
              <span
                className={`ticket-progress-fill ticket-progress-${current.color}`}
                style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }}
              />
            </div>
            <div className="ticket-caption">{t(`landingCaption_${current.key}`)}</div>
          </div>
        </div>
      </div>

      <div className="landing-steps">
        <div className="landing-step">
          <span className="landing-step-num">01</span>
          <h3>{t("landingStep1Title")}</h3>
          <p>{t("landingStep1Body")}</p>
        </div>
        <div className="landing-step">
          <span className="landing-step-num">02</span>
          <h3>{t("landingStep2Title")}</h3>
          <p>{t("landingStep2Body")}</p>
        </div>
        <div className="landing-step">
          <span className="landing-step-num">03</span>
          <h3>{t("landingStep3Title")}</h3>
          <p>{t("landingStep3Body")}</p>
        </div>
      </div>
    </div>
  );
}