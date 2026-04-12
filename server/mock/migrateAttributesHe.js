/**
 * One-time migration: add Hebrew `attributes` column and rename old English
 * `attributes` → `attributes_en` in all run CSV files under data/runs/.
 */

const fs   = require('fs');
const path = require('path');
const csv  = require('csv-parse/sync');

const ADJECTIVES_EN = ['red', 'blue', 'large', 'small', 'premium', 'standard', 'deluxe', 'basic', 'professional', 'consumer'];
const ADJECTIVES_HE = ['אדום', 'כחול', 'גדול', 'קטן', 'פרמיום', 'סטנדרטי', 'דלוקס', 'בסיסי', 'מקצועי', 'צרכני'];
const CATEGORIES_EN = ['electronics', 'clothing', 'furniture', 'food', 'books', 'toys', 'sports', 'music', 'art', 'home'];
const CATEGORIES_HE = ['אלקטרוניקה', 'ביגוד', 'ריהוט', 'מזון', 'ספרים', 'צעצועים', 'ספורט', 'מוזיקה', 'אמנות', 'בית'];
const BRANDS_EN = ['BrandA', 'BrandB', 'BrandC', 'BrandD', 'BrandE', 'Generic', 'Premium', 'Store Brand', 'Luxury', 'Budget'];
const BRANDS_HE = ['מותג א', 'מותג ב', 'מותג ג', 'מותג ד', 'מותג ה', 'גנרי', 'פרמיום', 'מותג חנות', 'יוקרה', 'תקציב'];
const MATERIALS_EN = ['Cotton', 'Polyester', 'Wool', 'Silk', 'Nylon', 'Leather', 'Metal', 'Plastic', 'Wood', 'Glass'];
const MATERIALS_HE = ['כותנה', 'פוליאסטר', 'צמר', 'משי', 'ניילון', 'עור', 'מתכת', 'פלסטיק', 'עץ', 'זכוכית'];

function translateToHe(enAttrs) {
  if (!enAttrs || typeof enAttrs !== 'object') return enAttrs;

  const translateStr = (enList, heList, val) => {
    const idx = enList.indexOf(val);
    return idx !== -1 ? heList[idx] : val;
  };

  const he = { ...enAttrs };

  if (he.name && typeof he.name === 'string') {
    he.name = he.name.replace(/^Item_/, 'פריט_');
  }

  if (he.description && typeof he.description === 'string') {
    // "A {adj} {category} product" → "מוצר {category_he} {adj_he}"
    const match = he.description.match(/^A (\w+) (\w+) product$/);
    if (match) {
      const adjHe = translateStr(ADJECTIVES_EN, ADJECTIVES_HE, match[1]);
      const catHe = translateStr(CATEGORIES_EN, CATEGORIES_HE, match[2]);
      he.description = `מוצר ${catHe} ${adjHe}`;
    }
  }

  if (typeof he.brand === 'string') {
    he.brand = translateStr(BRANDS_EN, BRANDS_HE, he.brand);
  }

  if (typeof he.color === 'string') {
    he.color = translateStr(ADJECTIVES_EN, ADJECTIVES_HE, he.color);
  }

  if (typeof he.material === 'string') {
    he.material = translateStr(MATERIALS_EN, MATERIALS_HE, he.material);
  }

  if (Array.isArray(he.tags)) {
    he.tags = he.tags.map(t => translateStr(CATEGORIES_EN, CATEGORIES_HE, t));
  }

  return he;
}

function migrateFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows = csv.parse(raw, { columns: true, skip_empty_lines: true });

  if (rows.length === 0) return;

  const firstRow = rows[0];
  if ('attributes_en' in firstRow) {
    console.log(`  already migrated, skipping`);
    return;
  }

  const migrated = rows.map(row => {
    let enAttrs;
    try { enAttrs = JSON.parse(row.attributes); } catch { enAttrs = {}; }
    const heAttrs = translateToHe(enAttrs);
    return {
      ...row,
      attributes:    JSON.stringify(heAttrs),
      attributes_en: JSON.stringify(enAttrs),
    };
  });

  const headers = Object.keys(migrated[0]);
  const escape = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(','),
    ...migrated.map(row => headers.map(h => escape(row[h])).join(','))
  ];
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
  console.log(`  migrated ${rows.length} rows`);
}

const runsDir = path.join(__dirname, '../../data/runs');
const files = fs.readdirSync(runsDir).filter(f => f.endsWith('.csv'));

console.log(`Migrating ${files.length} CSV files in ${runsDir} …`);
files.forEach(f => {
  const fp = path.join(runsDir, f);
  process.stdout.write(`  ${f}: `);
  migrateFile(fp);
});
console.log('Done.');
