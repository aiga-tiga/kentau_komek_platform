const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    req.employee = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Restricts a route to specific roles, e.g. requireRole("employee").
// Must run after requireAuth (needs req.employee to be set).
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.employee || !roles.includes(req.employee.role)) {
      return res.status(403).json({ error: "Not allowed for this account" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
