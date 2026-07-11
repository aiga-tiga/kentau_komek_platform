const BASE = "/api";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(resp) {
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${resp.status})`);
  }
  return resp.json();
}

export const api = {
  meta: () => fetch(`${BASE}/meta`).then(handle),

  login: (username, password) =>
    fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(handle),

  listComplaints: (status, categories) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (categories?.length) params.set("categories", categories.join(","));
    return fetch(`${BASE}/complaints?${params}`, { headers: authHeaders() }).then(handle);
  },

  getComplaint: (id) => fetch(`${BASE}/complaints/${id}`, { headers: authHeaders() }).then(handle),

  startComplaint: (id) =>
    fetch(`${BASE}/complaints/${id}/start`, { method: "PATCH", headers: authHeaders() }).then(handle),

  completeComplaint: (id, payload) =>
    fetch(`${BASE}/complaints/${id}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    }).then(handle),

  analytics: (categories) => {
    const params = new URLSearchParams();
    if (categories?.length) params.set("categories", categories.join(","));
    return fetch(`${BASE}/analytics?${params}`, { headers: authHeaders() }).then(handle);
  },

  uploadPhoto: (file) => {
    const form = new FormData();
    form.append("photo", file);
    return fetch(`${BASE}/uploads`, { method: "POST", headers: authHeaders(), body: form }).then(handle);
  },

  // Excel export needs the auth header, so it can't just be a plain <a href>
  // link - fetch the file as a blob and trigger the download ourselves.
  exportExcel: async (status, categories) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (categories?.length) params.set("categories", categories.join(","));
    const resp = await fetch(`${BASE}/complaints/export/xlsx?${params}`, { headers: authHeaders() });
    if (!resp.ok) throw new Error("Export failed");
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "complaints.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
