// Run with: npm run bot   (after setting TELEGRAM_BOT_TOKEN in .env)
//
// This process is intentionally separate from the API server so the bot can be
// deployed/restarted independently. It talks to the REST API over HTTP, the same
// way any other client would.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const TelegramBot = require("node-telegram-bot-api");
const { CATEGORIES, STATUS_LABELS } = require("../constants");
const { STRINGS } = require("./strings");
const { geocodeAddress } = require("../geocode");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is not set. Add it to backend/.env before running the bot.");
  process.exit(1);
}

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:4000/api";
const bot = new TelegramBot(TOKEN, { polling: true });

// In-memory per-chat wizard state. Fine for a single bot instance / low volume;
// swap for a DB-backed session store if you scale this out to multiple workers.
const sessions = new Map();

// This bot only serves Кентау right now, so the region is fixed rather than
// asked as a wizard step - one less question for the person filing a
// complaint, and it means geocoding/exports always have a region to work with.
const DEFAULT_REGION = "Кентау";

// Accepts the common ways people type a KZ mobile number - with/without +7,
// with 8 instead of +7, with spaces/dashes/parens - and normalizes them all
// to the same "+7XXXXXXXXXX" form stored in the DB. Returns null if the text
// genuinely isn't a valid KZ number, so the bot can ask again instead of
// silently saving garbage.
function normalizePhone(raw) {
  const digitsAndPlus = raw.replace(/[^\d+]/g, "");
  const match = digitsAndPlus.match(/^(?:\+7|8|7)(\d{10})$/);
  if (!match) return null;
  return `+7${match[1]}`;
}

function resetSession(chatId) {
  sessions.set(chatId, { step: "language", data: { region: DEFAULT_REGION }, lang: "ru" });
}

function s(session) {
  return STRINGS[session.lang] || STRINGS.ru;
}

// The linear order of wizard steps, used for "⬅️ Назад" navigation.
// category_other only exists in the order when "other" was picked, so a
// citizen who picked a normal category skips straight over it both ways.
function stepOrder(session) {
  const order = ["language", "category"];
  if (session.data.category === "other") order.push("category_other");
  order.push("description", "address", "location", "photo", "name", "phone");
  return order;
}

function previousStep(session) {
  const order = stepOrder(session);
  const idx = order.indexOf(session.step);
  return idx > 0 ? order[idx - 1] : null;
}

function languageKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🇷🇺 Русский", callback_data: "lang_ru" },
          { text: "🇰🇿 Қазақша", callback_data: "lang_kk" },
        ],
        [{ text: "📋 Мои жалобы / Менің өтінімдерім", callback_data: "mycomplaints" }],
      ],
    },
  };
}

function categoryKeyboard(session) {
  return {
    reply_markup: {
      inline_keyboard: [
        ...CATEGORIES.map((c) => [{ text: c[session.lang], callback_data: `cat_${c.id}` }]),
        [{ text: s(session).backBtn, callback_data: "back" }],
      ],
    },
  };
}

// Used for steps where the reply is free-text (description, address, name,
// phone, category_other) - "⬅️ Назад" rides along as an inline button under
// the prompt, separate from whatever the person types next.
function backInlineKeyboard(session) {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: s(session).backBtn, callback_data: "back" }]],
    },
  };
}

function locationKeyboard(session) {
  return {
    reply_markup: {
      keyboard: [
        [{ text: s(session).sendLocationBtn, request_location: true }],
        [{ text: s(session).skipBtn }],
        [{ text: s(session).backBtn }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
}

function skipKeyboard(session) {
  return {
    reply_markup: {
      keyboard: [[{ text: s(session).skipBtn }], [{ text: s(session).backBtn }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
}

function restartKeyboard(session) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: s(session).newComplaintBtn, callback_data: "restart" }],
        [{ text: s(session).myComplaintsBtn, callback_data: "mycomplaints" }],
      ],
    },
  };
}

// Sends the prompt for a given step. Used both for moving forward through
// the wizard and for "⬅️ Назад" - either way, showing a step's prompt is the
// exact same message, so there's one place that builds it.
function showStep(chatId, session, step) {
  session.step = step;
  const str = s(session);

  switch (step) {
    case "language":
      bot.sendMessage(chatId, STRINGS.ru.chooseLanguage, languageKeyboard());
      break;
    case "category":
      bot.sendMessage(chatId, str.welcome, categoryKeyboard(session));
      break;
    case "category_other":
      bot.sendMessage(chatId, str.askOtherCategory, backInlineKeyboard(session));
      break;
    case "description": {
      const category = CATEGORIES.find((c) => c.id === session.data.category);
      const label = session.data.category === "other" ? session.data.category_other : category?.[session.lang];
      bot.sendMessage(chatId, str.askDescription(label), backInlineKeyboard(session));
      break;
    }
    case "address":
      bot.sendMessage(chatId, str.askAddress, backInlineKeyboard(session));
      break;
    case "location":
      bot.sendMessage(chatId, str.askLocation, locationKeyboard(session));
      break;
    case "photo":
      bot.sendMessage(chatId, str.askPhoto, skipKeyboard(session));
      break;
    case "name": {
      const hint = session.lang === "kk" ? `\n\n(${str.backBtn} үшін "артқа" деп жазыңыз)` : `\n\n(напишите "назад", чтобы вернуться)`;
      bot.sendMessage(chatId, str.askName + hint, { reply_markup: { remove_keyboard: true } });
      break;
    }
    case "phone":
      bot.sendMessage(chatId, str.askPhone, backInlineKeyboard(session));
      break;
    default:
      break;
  }
}

function goBack(chatId, session) {
  const prev = previousStep(session);
  if (!prev) return; // already at the first step, nothing to go back to
  showStep(chatId, session, prev);
}

function formatComplaintLine(c, lang) {
  const category = CATEGORIES.find((cat) => cat.id === c.category);
  const categoryLabel =
    c.category === "other" ? `${category?.[lang] || "Другое"}: ${c.category_other || ""}` : category?.[lang] || c.category;
  const statusLabel = STATUS_LABELS[c.status]?.[lang] || c.status;
  const date = new Date(c.created_at).toLocaleDateString(lang === "kk" ? "kk-KZ" : "ru-RU");
  let line = `${c.code} — ${categoryLabel}\n${date} · ${c.address}\n${statusLabel}`;
  if (c.completion_comment) {
    const label = lang === "kk" ? "Орындаушының пікірі" : "Комментарий от исполнителя";
    line += `\n${label}: ${c.completion_comment}`;
  }
  return line;
}

async function showMyComplaints(chatId, lang) {
  const str = STRINGS[lang] || STRINGS.ru;
  try {
    const resp = await fetch(`${API_BASE_URL}/complaints/by-chat/${chatId}`, {
      headers: process.env.BOT_SHARED_SECRET ? { "x-bot-secret": process.env.BOT_SHARED_SECRET } : {},
    });
    const list = await resp.json();
    if (!resp.ok || !Array.isArray(list) || list.length === 0) {
      return bot.sendMessage(chatId, str.noComplaints);
    }
    const body = list.map((c) => formatComplaintLine(c, lang)).join("\n\n");
    await bot.sendMessage(chatId, `${str.myComplaintsTitle}\n\n${body}`);

    // Photos don't fit in a single text message, so send each one that
    // exists as a quick follow-up, captioned with its complaint code.
    const appUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
    if (!appUrl || appUrl.includes("localhost")) return; // can't build a public photo URL yet

    for (const c of list) {
      if (!c.completion_photo) continue;
      try {
        await bot.sendPhoto(chatId, `${appUrl}${c.completion_photo}`, { caption: c.code });
      } catch (err) {
        console.error(`Failed to send photo for ${c.code}:`, err.message);
      }
    }
  } catch (err) {
    console.error("Fetching complaints failed:", err);
    bot.sendMessage(chatId, str.error);
  }
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  resetSession(chatId);
  bot.sendMessage(chatId, STRINGS.ru.chooseLanguage, languageKeyboard());
});

bot.onText(/\/my/, (msg) => {
  const chatId = msg.chat.id;
  const lang = sessions.get(chatId)?.lang || "ru";
  showMyComplaints(chatId, lang);
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  bot.answerCallbackQuery(query.id);

  if (query.data === "restart") {
    resetSession(chatId);
    bot.sendMessage(chatId, STRINGS.ru.chooseLanguage, languageKeyboard());
    return;
  }

  if (query.data === "mycomplaints") {
    const lang = sessions.get(chatId)?.lang || "ru";
    showMyComplaints(chatId, lang);
    return;
  }

  const session = sessions.get(chatId);
  if (!session) return;

  if (query.data === "back") {
    goBack(chatId, session);
    return;
  }

  if (session.step === "language" && query.data.startsWith("lang_")) {
    session.lang = query.data === "lang_kk" ? "kk" : "ru";
    showStep(chatId, session, "category");
    return;
  }

  if (session.step === "category" && query.data.startsWith("cat_")) {
    const categoryId = query.data.replace("cat_", "");
    const category = CATEGORIES.find((c) => c.id === categoryId);
    if (!category) return;

    session.data.category = category.id;
    if (category.id !== "other") delete session.data.category_other;

    showStep(chatId, session, category.id === "other" ? "category_other" : "description");
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  if (msg.text && msg.text.startsWith("/")) return; // commands handled elsewhere
  const session = sessions.get(chatId);
  if (!session) return;
  const str = s(session);
  const isSkip = msg.text && msg.text.trim().toLowerCase() === str.skipBtn.toLowerCase();
  const isBack = msg.text && msg.text.trim().toLowerCase() === str.backBtn.toLowerCase();

  if (isBack) {
    goBack(chatId, session);
    return;
  }

  switch (session.step) {
    case "category_other": {
      if (!msg.text) return bot.sendMessage(chatId, str.needTextDescription);
      session.data.category_other = msg.text;
      showStep(chatId, session, "description");
      break;
    }

    case "description": {
      if (!msg.text) return bot.sendMessage(chatId, str.needTextDescription);
      session.data.description = msg.text;
      showStep(chatId, session, "address");
      break;
    }

    case "address": {
      if (!msg.text) return bot.sendMessage(chatId, str.needTextAddress);
      session.data.address = msg.text;
      showStep(chatId, session, "location");
      break;
    }

    case "location": {
      if (msg.location) {
        session.data.lat = msg.location.latitude;
        session.data.lng = msg.location.longitude;
      }
      showStep(chatId, session, "photo");
      break;
    }

    case "photo": {
      if (isSkip) {
        showStep(chatId, session, "name");
        break;
      }
      if (msg.photo && msg.photo.length > 0) {
        try {
          const fileId = msg.photo[msg.photo.length - 1].file_id;
          const fileUrl = await bot.getFileLink(fileId);
          const resp = await fetch(fileUrl);
          const buffer = Buffer.from(await resp.arrayBuffer());

          const form = new FormData();
          form.append("photo", new Blob([buffer]), "photo.jpg");

          const uploadResp = await fetch(`${API_BASE_URL}/uploads/bot`, {
            method: "POST",
            headers: process.env.BOT_SHARED_SECRET ? { "x-bot-secret": process.env.BOT_SHARED_SECRET } : {},
            body: form,
          });
          const uploadData = await uploadResp.json();
          if (uploadResp.ok) session.data.source_photo = uploadData.url;
        } catch (err) {
          console.error("Photo upload failed:", err);
        }
      }
      showStep(chatId, session, "name");
      break;
    }

    case "name": {
      if (!msg.text) return bot.sendMessage(chatId, str.needTextName);
      session.data.applicant_name = msg.text;
      showStep(chatId, session, "phone");
      break;
    }

    case "phone": {
      if (!msg.text) return bot.sendMessage(chatId, str.needTextPhone);
      const normalized = normalizePhone(msg.text);
      if (!normalized) return bot.sendMessage(chatId, str.invalidPhone);
      session.data.applicant_phone = normalized;
      session.data.telegram_chat_id = String(chatId);
      session.data.telegram_lang = session.lang;
      session.step = "done";

      bot.sendMessage(chatId, str.sending, { reply_markup: { remove_keyboard: true } });

      try {
        if (session.data.lat == null) {
          const geo = await geocodeAddress(session.data.address, session.data.region);
          session.data.lat = geo.lat;
          session.data.lng = geo.lng;
        }

        const resp = await fetch(`${API_BASE_URL}/complaints`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(process.env.BOT_SHARED_SECRET ? { "x-bot-secret": process.env.BOT_SHARED_SECRET } : {}),
          },
          body: JSON.stringify(session.data),
        });
        const complaint = await resp.json();

        if (resp.ok) {
          bot.sendMessage(chatId, str.success(complaint.code, complaint.access_code), restartKeyboard(session));
        } else {
          bot.sendMessage(chatId, str.failure, restartKeyboard(session));
        }
      } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, str.error, restartKeyboard(session));
      }

      sessions.delete(chatId);
      break;
    }

    default:
      break;
  }
});

console.log("Telegram bot running (polling mode)...");