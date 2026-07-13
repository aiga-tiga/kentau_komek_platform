import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLang } from "../i18n/i18n.jsx";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";

export default function EmployeeLogin() {
  const { t } = useLang();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const { token, employee } = await api.login(username, password);
      login(token, employee);
      navigate(employee.role === "analyst" ? "/analytics" : "/panel");
    } catch (err) {
      setError(t("loginError"));
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h2>{t("login")}</h2>
        <label>
          {t("username")}
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          {t("password")}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary" type="submit">
          {t("loginButton")}
        </button>
       
      </form>
    </div>
  );
}
