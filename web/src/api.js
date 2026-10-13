/* Talking to the server. Every change goes through here, so errors are handled in one place. */

export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body || {};
  }
}

async function request(method, url, body, { passive = false, etag } = {}) {
  const headers = { "X-SMS-Request": "1" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (passive) headers["X-SMS-Passive"] = "1";
  if (etag) headers["If-None-Match"] = etag;
  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: "same-origin" });
  } catch (e) {
    throw new ApiError(0, "Could not reach the server. Check your internet connection and try again.");
  }
  if (res.status === 304) return { notModified: true };
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || `The server answered with an error (${res.status}).`, data);
  return { data, etag: res.headers.get("ETag") };
}

export const api = {
  publicSchool: (code) => request("GET", `/api/public/school/${encodeURIComponent(code)}`).then((r) => r.data),
  login: (schoolCode, username, password) => request("POST", "/api/login", { schoolCode, username, password }),
  logout: () => request("POST", "/api/logout", {}).catch(() => {}),
  data: (opts) => request("GET", "/api/data", undefined, opts),
  action: (name, body) => request("POST", `/api/action/${name}`, body || {}).then((r) => r.data.result || {}),
  changePassword: (current, next) => request("POST", "/api/password", { current, next }),
  snapshots: () => request("GET", "/api/snapshots").then((r) => r.data),

  platformLogin: (username, password) => request("POST", "/api/platform/login", { username, password }),
  platformMe: () => request("GET", "/api/platform/me").then((r) => r.data),
  platformSchools: () => request("GET", "/api/platform/schools").then((r) => r.data),
  platformAudit: () => request("GET", "/api/platform/audit").then((r) => r.data),
  platformCreateSchool: (body) => request("POST", "/api/platform/schools", body).then((r) => r.data),
  platformSetActive: (id, active) => request("POST", `/api/platform/schools/${id}/active`, { active }),
  platformResetProprietor: (id) => request("POST", `/api/platform/schools/${id}/reset-proprietor`, {}).then((r) => r.data),
  platformChangePassword: (current, next) => request("POST", "/api/platform/password", { current, next }),
  platformSystem: () => request("GET", "/api/platform/system").then((r) => r.data),
  platformSettings: () => request("GET", "/api/platform/settings").then((r) => r.data),
  platformSaveSettings: (patch) => request("POST", "/api/platform/settings", { patch }).then((r) => r.data),
  platformAdmins: () => request("GET", "/api/platform/admins").then((r) => r.data),
  platformAddAdmin: (body) => request("POST", "/api/platform/admins", body).then((r) => r.data),
  platformResetAdmin: (id) => request("POST", `/api/platform/admins/${id}/reset`, {}).then((r) => r.data),
  platformRemoveAdmin: (id) => request("POST", `/api/platform/admins/${id}/remove`, {}),
  platformSessions: () => request("GET", "/api/platform/sessions").then((r) => r.data),
  platformSignOutOthers: () => request("POST", "/api/platform/sessions/sign-out-others", {}),
  publicNotice: () => request("GET", "/api/public/notice").then((r) => r.data),
};

/* Read an image file the user picked, shrinking large photos so uploads stay small on slow connections. */
export function readImageFile(file, maxSide = 600) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) return reject(new Error("Please choose a PNG, JPEG, GIF or WebP image."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file does not look like an image."));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        if (scale === 1 && reader.result.length < 400 * 1024) return resolve(reader.result);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(file.type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
