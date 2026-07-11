// Storage abstraction for complaint photos (citizen's original photo, and the
// operator's completion photo).
//
// Default: local disk, under UPLOAD_DIR, served statically at /uploads/*.
// Fine for a single server. If you deploy across multiple app instances
// behind a load balancer, or want offsite backups, switch to an S3-compatible
// bucket instead (AWS S3, Yandex Object Storage, or a self-hosted MinIO all
// work) - swap the two functions below for calls to the AWS SDK / MinIO
// client and keep the same { save(buffer, filename) -> url } shape so
// nothing else in the codebase needs to change.

const fs = require("fs");
const path = require("path");
const multer = require("multer");

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
// Historically this was prefixed with PUBLIC_BASE_URL (an absolute URL like
// http://localhost:4000). That broke photos in production whenever
// PUBLIC_BASE_URL wasn't updated to match the real domain - browsers would
// try to load the image from the viewer's own machine instead of the
// server. Relative URLs always resolve correctly against whatever host the
// app is served from (nginx and the API both serve /uploads/* - see
// server.js and frontend/nginx.conf), so we use those instead.

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB per photo
});

function urlFor(filename) {
  return `/uploads/${filename}`;
}

// Used by the Telegram bot, which downloads the photo from Telegram's CDN
// and needs to write it to disk itself (rather than going through multer,
// which expects an incoming HTTP request).
function saveBuffer(buffer, originalName) {
  const ext = path.extname(originalName || "") || ".jpg";
  const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
  return urlFor(name);
}

module.exports = { upload, urlFor, saveBuffer, UPLOAD_DIR };
