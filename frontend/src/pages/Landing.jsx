import { Link } from "react-router-dom";
import { useLang } from "../i18n/i18n.jsx";
import logoImg from "../assets/logo.png";
import landImg from "../assets/land.png";

export default function Landing() {
  const { t } = useLang();

  return (
    <div className="landing">
      <div className="landing-hero">
        <img src={logoImg} alt="" className="landing-logo" />
        <h1>{t("appName")}</h1>
        <p className="landing-tagline">{t("tagline")}</p>
      </div>

      <div className="landing-actions">
        <a
          className="btn btn-outline"
          href="https://t.me/kentau_ikomek_bot"
          target="_blank"
          rel="noreferrer"
        >
          ✈️ {t("submitViaTelegram")}
        </a>
        
        <Link className="btn btn-outline" to="/analytics">
          📊 {t("analyticsPanel")}
        </Link>
        <Link className="btn btn-primary" to="/login">
          {t("loginAsEmployee")}
        </Link>
      </div>
    </div>
  );
}