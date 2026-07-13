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

function languageKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🇷🇺 Русский", callback_data: "lang_ru" },
          { text: "🇰🇿 Қазақша", callback_data: "lang_kk" },
        ],
      ],
    },
  };
}

function categoryKeyboard(lang) {
  return {
    reply_markup: {
      inline_keyboard: CATEGORIES.map((c) => [{ text: c[lang], callback_data: `cat_${c.id}` }]),
    },
  };
}

function locationKeyboard(session) {
  return {
    reply_markup: {
      keyboard: [
        [{ text: s(session).sendLocationBtn, request_location: true }],
        [{ text: s(session).skipBtn }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
}

function skipKeyboard(session) {
  return {
    reply_markup: {
      keyboard: [[{ text: s(session).skipBtn }]],
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

function formatComplaintLine(c, lang) {
  const category = CATEGORIES.find((cat) => cat.id === c.category);
  const categoryLabel =
    c.category === "other" ? `${category?.[lang] || "Другое"}: ${c.category_other || ""}` : category?.[lang] || c.category;
  const statusLabel = STATUS_LABELS[c.status]?.[lang] || c.status;
  const date = new Date(c.created_at).toLocaleDateString(lang === "kk" ? "kk-KZ" : "ru-RU");
  return `${c.code} — ${categoryLabel}\n${date} · ${c.address}\n${statusLabel}`;
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
    bot.sendMessage(chatId, `${str.myComplaintsTitle}\n\n${body}`);
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

  if (session.step === "language" && query.data.startsWith("lang_")) {
    session.lang = query.data === "lang_kk" ? "kk" : "ru";
    session.step = "category";
    bot.sendMessage(chatId, s(session).welcome, categoryKeyboard(session.lang));
    return;
  }

  if (session.step === "category" && query.data.startsWith("cat_")) {
    const categoryId = query.data.replace("cat_", "");
    const category = CATEGORIES.find((c) => c.id === categoryId);
    if (!category) return;

    session.data.category = category.id;

    if (category.id === "other") {
      session.step = "category_other";
      bot.sendMessage(chatId, s(session).askOtherCategory);
    } else {
      session.step = "description";
      bot.sendMessage(chatId, s(session).askDescription(category[session.lang]));
    }
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  if (msg.text && msg.text.startsWith("/")) return; // commands handled elsewhere
  const session = sessions.get(chatId);
  if (!session) return;
  const str = s(session);
  const isSkip = msg.text && msg.text.trim().toLowerCase() === str.skipBtn.toLowerCase();

  switch (session.step) {
    case "category_other": {
      if (!msg.text) return bot.sendMessage(chatId, str.needTextDescription);
      session.data.category_other = msg.text;
      session.step = "description";
      bot.sendMessage(chatId, str.askDescription(msg.text));
      break;
    }

    case "description": {
      if (!msg.text) return bot.sendMessage(chatId, str.needTextDescription);
      session.data.description = msg.text;
      session.step = "address";
      bot.sendMessage(chatId, str.askAddress);
      break;
    }

    case "address": {
      if (!msg.text) return bot.sendMessage(chatId, str.needTextAddress);
      session.data.address = msg.text;
      session.step = "location";
      bot.sendMessage(chatId, str.askLocation, locationKeyboard(session));
      break;
    }

    case "location": {
      if (msg.location) {
        session.data.lat = msg.location.latitude;
        session.data.lng = msg.location.longitude;
      }
      session.step = "photo";
      bot.sendMessage(chatId, str.askPhoto, skipKeyboard(session));
      break;
    }

    case "photo": {
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
      session.step = "name";
      bot.sendMessage(chatId, str.askName, { reply_markup: { remove_keyboard: true } });
      break;
    }

    case "name": {
      if (!msg.text || isSkip) {
        if (!msg.text) return bot.sendMessage(chatId, str.needTextName);
      }
      session.data.applicant_name = msg.text;
      session.step = "phone";
      bot.sendMessage(chatId, str.askPhone);
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

      bot.sendMessage(chatId, str.sending);

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