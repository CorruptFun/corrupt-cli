// Maps a free-text automotive color name (e.g. "Liquid Carbon", "Ebony")
// to a representative swatch hex. Keyword-based and order-sensitive: the first
// keyword found in the name wins, so list more specific words before generic
// ones. Returns null for unrecognized names — callers render a neutral swatch.
const COLOR_KEYWORDS: [string, string][] = [
  ["ebony", "#0a0a0a"],
  ["onyx", "#0a0a0a"],
  ["obsidian", "#0a0a0a"],
  ["carbon", "#4b5563"], // "Liquid Carbon" etc. — dark metallic gray
  ["graphite", "#4b5563"],
  ["charcoal", "#36393d"],
  ["gunmetal", "#53565a"],
  ["steel", "#7c828a"],
  ["titanium", "#a8a9ad"],
  ["platinum", "#e5e4e2"],
  ["pearl", "#f6f5f0"],
  ["ivory", "#f4f0e6"],
  ["cream", "#f0e9d6"],
  ["champagne", "#e6d9a8"],
  ["beige", "#d8c9a8"],
  ["sand", "#d6c39a"],
  ["tan", "#c9a978"],
  ["mocha", "#6f5642"],
  ["bronze", "#8a6d3b"],
  ["brown", "#5a3d29"],
  ["gold", "#c9a227"],
  ["silver", "#c0c4c9"],
  ["gray", "#8b8f94"],
  ["grey", "#8b8f94"],
  ["white", "#f4f4f5"],
  ["black", "#0a0a0a"],
  ["burgundy", "#5c1a26"],
  ["maroon", "#5c1a26"],
  ["ruby", "#9b1c2e"],
  ["crimson", "#a01c2e"],
  ["red", "#c0341d"],
  ["copper", "#b06a3b"],
  ["orange", "#d2691e"],
  ["yellow", "#e0b322"],
  ["emerald", "#1f6b4a"],
  ["green", "#2e6b3e"],
  ["navy", "#1e2f52"],
  ["teal", "#1f6b6b"],
  ["blue", "#2b5ca8"],
  ["purple", "#5b3b8c"],
  ["magenta", "#a12c78"],
  ["pink", "#d98aa8"],
];

export function colorToHex(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.toLowerCase();
  for (const [keyword, hex] of COLOR_KEYWORDS) {
    if (n.includes(keyword)) return hex;
  }
  return null;
}
