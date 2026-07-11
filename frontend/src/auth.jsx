import { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [employee, setEmployee] = useState(() => {
    const raw = localStorage.getItem("employee");
    return raw ? JSON.parse(raw) : null;
  });

  function login(token, employeeData) {
    localStorage.setItem("token", token);
    localStorage.setItem("employee", JSON.stringify(employeeData));
    setEmployee(employeeData);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("employee");
    setEmployee(null);
  }

  return <AuthContext.Provider value={{ employee, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
