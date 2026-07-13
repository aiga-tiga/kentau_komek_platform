// Sends a status-update DM back to the citizen who filed a complaint via the
// Telegram bot. This doesn't need any account/registration system: the bot
// already captured the person's Telegram chat_id when they submitted the
// complaint (see backend/bot/bot.js), and that's all Telegram requires to
// message someone back. Complaints filed through a channel that didn't
// capture a chat_id (or filed anonymously) are simply skipped.

const MESSAGES = {
  in_progress: {
    ru: (code) => `Ваша жалоба ${code} принята в работу. Мы сообщим, когда она будет выполнена.`,
    kk: (code) => `Сіздің ${code} өтінішіңіз жұмысқа алынды. Орындалған кезде хабарлаймыз.`,
  },
  done: {
    ru: (code) => `Ваша жалоба ${code} выполнена. Спасибо, что сообщили о проблеме!`,
    kk: (code) => `Сіздің ${code} өтінішіңіз орындалды. Хабарлағаныңыз үшін рахмет!`,
  },
};

async function sendTelegramMessage(chatId, text) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
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

// Fire-and-forget: called right after a status update. Never throws, so it
// can't turn a successful status change into a failed API response just
// because Telegram is briefly unreachable.
function notifyStatusChange(complaint) {
  if (!complaint?.telegram_chat_id) return;
  const build = MESSAGES[complaint.status];
  if (!build) return;
  const lang = complaint.telegram_lang === "kk" ? "kk" : "ru";
  sendTelegramMessage(complaint.telegram_chat_id, build[lang](complaint.code));
}

module.exports = { notifyStatusChange };