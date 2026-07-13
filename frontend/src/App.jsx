import { Routes, Route, Navigate } from "react-router-dom";
import TopBar from "./components/TopBar.jsx";
import Landing from "./pages/Landing.jsx";
import EmployeeLogin from "./pages/EmployeeLogin.jsx";
import EmployeePanel from "./pages/EmployeePanel.jsx";
import ComplaintDetail from "./pages/ComplaintDetail.jsx";
import Analytics from "./pages/Analytics.jsx";
import StatusCheck from "./pages/StatusCheck.jsx";
import { useAuth } from "./auth.jsx";

function RequireAuth({ children }) {
  const { employee } = useAuth();
  if (!employee) return <Navigate to="/login" replace />;
  return children;
}

// The complaints panel is only for the operator account; the analytics
// account gets redirected straight to the dashboard it's meant to see.
function RequireEmployee({ children }) {
  const { employee } = useAuth();
  if (!employee) return <Navigate to="/login" replace />;
  if (employee.role !== "employee") return <Navigate to="/analytics" replace />;
  return children;
}

export default function App() {
  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-content">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/status" element={<StatusCheck />} />
          <Route path="/login" element={<EmployeeLogin />} />
          <Route
            path="/panel"
            element={
              <RequireEmployee>
                <EmployeePanel />
              </RequireEmployee>
            }
          />
          <Route
            path="/panel/complaints/:id"
            element={
              <RequireEmployee>
                <ComplaintDetail />
              </RequireEmployee>
            }
          />
          <Route
            path="/analytics"
            element={
              <RequireAuth>
                <Analytics />
              </RequireAuth>
            }
          />
        </Routes>
      </div>
    </div>
  );
}