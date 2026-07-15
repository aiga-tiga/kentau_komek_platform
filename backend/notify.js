// Sends a status-update DM back to the citizen who filed a complaint via the
// Telegram bot. No account/registration needed: the bot already captured the
// person's Telegram chat_id when they submitted the complaint (see
// backend/bot/bot.js), and that's all Telegram requires to message someone
// back. When a complaint is closed with a completion photo, that photo is
// attached to the message too (matches the "Ваша заявка исполнена..." +
// photo format used by similar city platforms).

const fs = require("fs");
const path = require("path");
const { UPLOAD_DIR } = require("./storage");

const MESSAGES = {
  in_progress: {
    ru: (code) => `Добрый день.\nВаша заявка ${code} принята в работу.\nМы сообщим, когда она будет выполнена.`,
    kk: (code) => `Қайырлы күн.\nСіздің ${code} өтінішіңіз жұмысқа алынды.\nОрындалған кезде хабарлаймыз.`,
  },
  done: {
    ru: (code) => `Добрый день.\nВаша заявка ${code} исполнена.`,
    kk: (code) => `Қайырлы күн.\nСіздің ${code} өтінішіңіз орындалды.`,
  },
};

const EXECUTOR_COMMENT_LABEL = { ru: "Комментарий от исполнителя:", kk: "Орындаушының пікірі:" };

function buildText(complaint, lang) {
  const build = MESSAGES[complaint.status];
  if (!build) return null;
  let text = build[lang](complaint.code);
  if (complaint.status === "done" && complaint.completion_comment) {
    text += `\n\n${EXECUTOR_COMMENT_LABEL[lang]}\n${complaint.completion_comment}`;
  }
  // Telegram caption limit is 1024 chars; plain messages can be longer, but
  // capping consistently keeps text-only and photo+caption cases in sync.
  return text.length > 1024 ? `${text.slice(0, 1021)}...` : text;
}

async function sendTelegramMessage(chatId, text) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn("TELEGRAM_BOT_TOKEN not set in the backend's environment - notification not sent.");
    return;
  }
  try {
    const resp = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!resp.ok) console.error("Telegram notify failed:", await resp.text());
  } catch (err) {
    console.error("Telegram notify failed:", err);
  }
}

// Uploads the photo bytes straight to Telegram (multipart), instead of
// giving Telegram a URL to fetch. sendPhoto-by-URL turned out to be
// unreliable over plain HTTP (no SSL) - Telegram's fetcher would rather
// treat the link as a webpage than as an image, failing with "wrong type of
// the web page content" even though the URL works fine in a browser/curl.
// Uploading the bytes directly sidesteps that entirely - this process
// already has the file on disk (same UPLOAD_DIR volume as the API server),
// so there's no network fetch on Telegram's end at all.
//
// Returns true on success, false on failure (caller falls back to text-only).
async function sendTelegramPhoto(chatId, relativePhotoUrl, caption) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn("TELEGRAM_BOT_TOKEN not set in the backend's environment - notification not sent.");
    return false;
  }
  const filename = path.basename(relativePhotoUrl);
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`Photo notify: file not found on disk at ${filePath}`);
    return false;
  }
  try {
    const buffer = fs.readFileSync(filePath);
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", caption);
    form.append("photo", new Blob([buffer]), filename);

    const resp = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      body: form,
    });
    const data = await resp.json();
    if (!data.ok) {
      console.error("Telegram photo notify failed:", JSON.stringify(data));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Telegram photo notify failed:", err);
    return false;
  }
}

// Fire-and-forget: called right after a status update. Never throws, so it
// can't turn a successful status change into a failed API response just
// because Telegram is briefly unreachable.
function notifyStatusChange(complaint) {
  if (!complaint?.telegram_chat_id) return;
  const lang = complaint.telegram_lang === "kk" ? "kk" : "ru";
  const text = buildText(complaint, lang);
  if (!text) return;

  const hasPhoto = complaint.status === "done" && complaint.completion_photo;
  if (hasPhoto) {
    sendTelegramPhoto(complaint.telegram_chat_id, complaint.completion_photo, text).then((ok) => {
      if (!ok) sendTelegramMessage(complaint.telegram_chat_id, text);
    });
    return;
  }

  sendTelegramMessage(complaint.telegram_chat_id, text);
}

module.exports = { notifyStatusChange };