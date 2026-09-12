const palette = [
  "#24846c",
  "#728ddd",
  "#df9d51",
  "#cf7294",
  "#789eae",
  "#a18ac3",
  "#9caa63",
  "#d48164",
];
const categoryColors: Record<string, string> = {
  food: palette[0],
  transport: palette[1],
  shopping: palette[2],
  entertainment: palette[3],
  travel: palette[4],
  housing: palette[5],
  health: palette[6],
  subscriptions: palette[7],
  uncategorized_expense: "#a0a8ae",
};
export function nodeColor(key: string): string {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const family = key === "groceries" ? "food" : key.split("_")[0];
  return (
    categoryColors[key] ??
    categoryColors[family] ??
    palette[Math.abs(hash) % palette.length]
  );
}
