// Complaint categories. Keys are stable IDs stored in the DB;
// ru/kk are the display labels shown in each language.
const CATEGORIES = [
  { id: "water", ru: "Проблема с водой", kk: "Су мәселесі" },
  { id: "heating", ru: "Проблема с отоплением", kk: "Жылу мәселесі" },
  { id: "light", ru: "Проблема с освещением", kk: "Жарық мәселесі" },
  { id: "gas", ru: "Проблема с газом", kk: "Газ мәселесі" },
  { id: "street_light", ru: "Уличное освещение", kk: "Көше жарықтындыру мәселесі" },
  { id: "sewage", ru: "Проблема с канализацией", kk: "Кәріз мәселесі" },
  { id: "manhole", ru: "Крышка колодца", kk: "Құдық қақпағы мәселесі" },
  { id: "trash", ru: "Проблема с мусором", kk: "Қоқыс мәселесі" },
  { id: "green_zone", ru: "Зелёная зона (сухие деревья, обрезка)", kk: "Жасыл аймақ (қураған тал, тал кесу)" },
  { id: "road", ru: "Дорожная проблема (дорожный знак)", kk: "Жол мәселесі (жол белгісі)" },
  { id: "stray_dogs", ru: "Бродячие собаки", kk: "Қаңғыған иттер мәселесі" },
  { id: "order", ru: "Нарушение порядка (ночная тишина)", kk: "Тәртіп мәселесі (Түнгі тыныштық)" },
  { id: "other", ru: "Другое", kk: "Басқа" },
];

// Statuses, matching the 3-stage workflow from the spec:
// new -> operator hasn't dispatched it yet
// in_progress -> operator set a 7-day deadline and it's being worked on
// done -> operator got confirmation, uploaded a photo, closed it
const STATUSES = ["new", "in_progress", "done"];

const STATUS_LABELS = {
  new: { ru: "Новая", kk: "Жаңа" },
  in_progress: { ru: "На исполнении", kk: "Орындалуда" },
  done: { ru: "Выполнена", kk: "Орындалды" },
};

const DEFAULT_DEADLINE_DAYS = 7;

module.exports = { CATEGORIES, STATUSES, STATUS_LABELS, DEFAULT_DEADLINE_DAYS };
