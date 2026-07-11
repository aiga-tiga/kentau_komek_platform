// Stable color per category id, so the same category always gets the same
// dot/bar color across the map, the category breakdown, and any legend.
const PALETTE = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // orange
  "#6b7280", // gray
  "#ef4444", // red
  "#a855f7", // purple
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#ec4899", // pink
  "#14b8a6", // teal
  "#eab308", // yellow
  "#64748b", // slate
  "#f97316", // dark orange
];

export function categoryColor(categoryId, categories) {
  const index = categories.findIndex((c) => c.id === categoryId);
  return PALETTE[index >= 0 ? index % PALETTE.length : 0];
}
