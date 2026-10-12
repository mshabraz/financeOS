/**
 * Curated Financial Category Color System
 * Optimized for maximum readability, contrast, and visual elegance
 * across both Dark Mode and Light Mode.
 */

export const CURATED_CATEGORY_COLORS = [
  // Greens & Teals (Essentials, Income, Groceries, Health)
  { id: 'emerald',      name: 'Emerald',       hex: '#10b981', keywords: ['grocer', 'supermarket', 'market', 'cash', 'salary', 'income', 'wage'] },
  { id: 'forest',       name: 'Forest Green',  hex: '#16a34a', keywords: ['food', 'produce', 'organic'] },
  { id: 'green',        name: 'Vibrant Green', hex: '#22c55e', keywords: ['invest', 'saving', 'wealth', 'dividend'] },
  { id: 'mint',         name: 'Fresh Mint',    hex: '#14b8a6', keywords: ['bonus', 'cashback', 'side'] },
  { id: 'teal',         name: 'Teal',          hex: '#0d9488', keywords: ['health', 'fitness', 'gym', 'sport', 'medical', 'doctor', 'pharmacy', 'care'] },

  // Blues & Cyans (Transport, Tech, Utilities, Daily)
  { id: 'cyan',         name: 'Cyan',          hex: '#06b6d4', keywords: ['wellness', 'spa', 'clean'] },
  { id: 'deep-sky',     name: 'Deep Sky',      hex: '#0284c7', keywords: ['phone', 'internet', 'mobile', 'broadband', 'telecom', 'wifi'] },
  { id: 'sky',          name: 'Sky Blue',      hex: '#0ea5e9', keywords: ['transport', 'transit', 'flight', 'travel', 'commute'] },
  { id: 'blue',         name: 'Cobalt Blue',   hex: '#2563eb', keywords: ['car', 'auto', 'vehicle', 'fuel', 'gas', 'petrol', 'parking'] },
  { id: 'royal-blue',   name: 'Royal Blue',    hex: '#3b82f6', keywords: ['insurance', 'repair', 'maintenance'] },

  // Indigos, Purples & Violets (Housing, Education, Hobbies)
  { id: 'indigo',       name: 'Indigo',        hex: '#4f46e5', keywords: ['rent', 'housing', 'accommodation', 'mortgage', 'property'] },
  { id: 'iris',         name: 'Iris',          hex: '#6366f1', keywords: ['remitt', 'transfer', 'wire', 'pension', 'bank'] },
  { id: 'violet',       name: 'Violet',        hex: '#7c3aed', keywords: ['education', 'course', 'school', 'book', 'tuition', 'study'] },
  { id: 'purple',       name: 'Purple',        hex: '#9333ea', keywords: ['social', 'hobbi', 'hobby', 'club'] },
  { id: 'grape',        name: 'Royal Purple',  hex: '#a855f7', keywords: ['game', 'gaming', 'toys'] },

  // Pinks & Roses (Entertainment, Subscriptions, Major Purchases)
  { id: 'fuchsia',      name: 'Fuchsia',       hex: '#c026d3', keywords: ['entertain', 'movie', 'cinema', 'theater', 'show', 'ticket'] },
  { id: 'pink',         name: 'Neon Pink',     hex: '#db2777', keywords: ['subscript', 'streaming', 'netflix', 'spotify', 'software', 'app'] },
  { id: 'rose',         name: 'Rose',          hex: '#e11d48', keywords: ['major', 'purchase', 'electronic', 'appliance', 'hardware'] },
  { id: 'coral',        name: 'Coral Pink',    hex: '#f43f5e', keywords: ['gift', 'donation', 'charity', 'beauty', 'cosmetic'] },

  // Oranges, Ambers & Warm Tones (Dining, Cafes, Energy, Shopping)
  { id: 'crimson',      name: 'Warm Red',      hex: '#dc2626', keywords: ['urgent', 'emergency', 'fine', 'penalty'] },
  { id: 'orange',       name: 'Vibrant Orange',hex: '#ea580c', keywords: ['restaurant', 'dining', 'eatery', 'takeout', 'delivery', 'dinner'] },
  { id: 'sunset',       name: 'Sunset Orange', hex: '#f97316', keywords: ['shop', 'store', 'cloth', 'apparel', 'shoe', 'retail'] },
  { id: 'amber',        name: 'Warm Amber',    hex: '#d97706', keywords: ['coffee', 'cafe', 'cafes', 'bakery', 'breakfast', 'snack'] },
  { id: 'gold',         name: 'Golden Yellow', hex: '#ca8a04', keywords: ['utilit', 'electric', 'power', 'energy', 'heating'] },

  // Neutrals / Slates (Admin, Fees, Other)
  { id: 'slate',        name: 'Cool Slate',    hex: '#64748b', keywords: ['fee', 'tax', 'charge', 'duty', 'interest', 'legal'] },
  { id: 'neutral',      name: 'Neutral Grey',  hex: '#78716c', keywords: ['other', 'misc', 'uncategorized'] },
];

/**
 * Convert hex to RGB components
 */
export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return { r: 100, g: 116, b: 139 };
  let c = hex.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  if (c.length !== 6) return { r: 100, g: 116, b: 139 };
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h = Math.round(h * 60);
  }
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Convert HSL to Hex
 */
export function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Given any hex color, calculate accessible dark & light mode styles
 * ensuring that dark mode text never disappears (even if hex is #000000 / #222222)
 * and light mode text is never washed out (even if hex is #ffffff / #fef08a).
 */
export function getAccessibleBadgeStyle(color) {
  const defaultHex = '#64748b';
  const rawHex = (color && color.startsWith('#')) ? color : defaultHex;
  const { r, g, b } = hexToRgb(rawHex);
  const { h, s, l } = rgbToHsl(r, g, b);

  // If color is near grayscale/black or extremely dark (like #222222 in screenshot),
  // boost saturation slightly and set safe lightness
  const isNearMono = s < 15;
  const darkL = isNearMono
    ? (l < 40 ? 75 : l) // #222222 -> soft readable light slate
    : Math.max(l, 62);  // Ensure at least 62% lightness for dark mode
  const lightL = isNearMono
    ? (l > 60 ? 35 : l)
    : Math.min(l, 38);  // Ensure at most 38% lightness for light mode

  const safeDarkHex = hslToHex(h, isNearMono ? 20 : Math.max(s, 70), Math.min(darkL, 78));
  const safeLightHex = hslToHex(h, isNearMono ? 20 : Math.max(s, 75), Math.max(lightL, 28));

  return {
    dotColor: rawHex,
    style: {
      '--cat-bg-light': `rgba(${r}, ${g}, ${b}, 0.08)`,
      '--cat-border-light': `rgba(${r}, ${g}, ${b}, 0.22)`,
      '--cat-text-light': safeLightHex,
      '--cat-bg-dark': `rgba(${r}, ${g}, ${b}, 0.16)`,
      '--cat-border-dark': `rgba(${r}, ${g}, ${b}, 0.35)`,
      '--cat-text-dark': safeDarkHex,
    },
  };
}

/**
 * Find the best matching color for a category name based on semantics.
 */
export function suggestCategoryColor(name, type = 'expense') {
  if (!name || typeof name !== 'string') {
    return CURATED_CATEGORY_COLORS[0].hex;
  }
  const clean = name.toLowerCase().replace(/[^a-z0-9]/g, ' ');

  // 1. Check keyword semantics
  for (const item of CURATED_CATEGORY_COLORS) {
    for (const kw of item.keywords) {
      if (clean.includes(kw)) {
        return item.hex;
      }
    }
  }

  // 2. Fallbacks based on category type
  if (type === 'income') return '#10b981'; // Emerald
  if (type === 'savings') return '#6366f1'; // Indigo
  if (type === 'transfer') return '#7c3aed'; // Violet

  // 3. Deterministic hash index
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % CURATED_CATEGORY_COLORS.length;
  return CURATED_CATEGORY_COLORS[idx].hex;
}

/**
 * Harmonize all categories in an array so each category gets
 * an optimal, distinct, non-clashing color from the curated palette.
 */
export function harmonizeCategoryPalette(categories = []) {
  const usedHexes = new Set();
  const updates = [];

  // Pass 1: Assign high-priority semantic matches
  const semanticAssignments = [];
  categories.forEach((cat) => {
    const clean = (cat.name || '').toLowerCase().replace(/[^a-z0-9]/g, ' ');
    let matchedItem = null;

    for (const item of CURATED_CATEGORY_COLORS) {
      for (const kw of item.keywords) {
        if (clean.includes(kw)) {
          matchedItem = item;
          break;
        }
      }
      if (matchedItem) break;
    }

    if (matchedItem && !usedHexes.has(matchedItem.hex)) {
      usedHexes.add(matchedItem.hex);
      semanticAssignments.push({ id: cat.id, name: cat.name, color: matchedItem.hex });
    } else {
      semanticAssignments.push({ id: cat.id, name: cat.name, color: null, type: cat.type });
    }
  });

  // Pass 2: Fill in remaining categories with unused palette colors
  let paletteCursor = 0;
  semanticAssignments.forEach((item) => {
    if (item.color) {
      updates.push({ id: item.id, color: item.color });
    } else {
      // Find next unused color in CURATED_CATEGORY_COLORS
      while (paletteCursor < CURATED_CATEGORY_COLORS.length && usedHexes.has(CURATED_CATEGORY_COLORS[paletteCursor].hex)) {
        paletteCursor++;
      }
      let chosenColor;
      if (paletteCursor < CURATED_CATEGORY_COLORS.length) {
        chosenColor = CURATED_CATEGORY_COLORS[paletteCursor].hex;
        usedHexes.add(chosenColor);
        paletteCursor++;
      } else {
        // All 26 colors used; fallback to suggested hash
        chosenColor = suggestCategoryColor(item.name, item.type);
      }
      updates.push({ id: item.id, color: chosenColor });
    }
  });

  return updates;
}
