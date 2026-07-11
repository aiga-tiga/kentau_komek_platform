import { Link } from "react-router-dom";
import { useLang } from "../i18n/i18n.jsx";
import { useAuth } from "../auth.jsx";

export default function TopBar() {
  const { lang, setLang, t } = useLang();
  const { employee, logout } = useAuth();

  return (
    <header className="topbar">
      <Link to="/" className="topbar-brand">
        <span className="topbar-logo">🌿</span>
      </Link>

      <div className="topbar-lang">
        <button className={lang === "ru" ? "lang-btn active" : "lang-btn"} onClick={() => setLang("ru")}>
          RU
        </button>
        <button className={lang === "kk" ? "lang-btn active" : "lang-btn"} onClick={() => setLang("kk")}>
          KK
        </button>
      </div>

      <div className="topbar-right">
        {employee && (
          <>
            <span className="topbar-name">{t(employee.role === "analyst" ? "roleAnalyst" : "roleEmployee")}</span>
            <button className="link-btn" onClick={logout}>
              {t("logout")}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
