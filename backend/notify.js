// Sends a status-update DM back to the citizen who filed a complaint via the
// Telegram bot. No account/registration needed: the bot already captured the
// person's Telegram chat_id when they submitted the complaint (see
// backend/bot/bot.js), and that's all Telegram requires to message someone
// back. When a complaint is closed with a completion photo, that photo is
// attached to the message too (matches the "Ваша заявка исполнена..." +
// photo format used by similar city platforms).

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

// Returns true on success, false on failure (caller falls back to text-only).
async function sendTelegramPhoto(chatId, photoUrl, caption) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn("TELEGRAM_BOT_TOKEN not set in the backend's environment - notification not sent.");
    return false;
  }
  try {
    const resp = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption }),
    });
    if (!resp.ok) {
      console.error("Telegram photo notify failed:", await resp.text());
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

  const appUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const hasPhoto = complaint.status === "done" && complaint.completion_photo;
  const canAttachPhoto = hasPhoto && appUrl && !appUrl.includes("localhost");

  if (hasPhoto && !canAttachPhoto) {
    console.warn(
      `Skipping photo in Telegram notification for ${complaint.code}: ` +
        `PUBLIC_BASE_URL is "${appUrl || "(not set)"}" - needs to be a real public URL, not empty/localhost.`
    );
  }

  if (canAttachPhoto) {
    const photoUrl = `${appUrl}${complaint.completion_photo}`;
    // Telegram's servers fetch the photo themselves, so this URL has to be
    // genuinely public - if it fails (e.g. PUBLIC_BASE_URL misconfigured),
    // fall back to a text-only message instead of losing the notification.
    sendTelegramPhoto(complaint.telegram_chat_id, photoUrl, text).then((ok) => {
      if (!ok) sendTelegramMessage(complaint.telegram_chat_id, text);
    });
    return;
  }

  sendTelegramMessage(complaint.telegram_chat_id, text);
}

module.exports = { notifyStatusChange };