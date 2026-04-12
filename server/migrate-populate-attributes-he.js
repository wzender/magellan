/**
 * Migration: populate attributes_en (copy from attributes) and translate
 * attributes to Hebrew for all existing per-run tables and run_results.
 *
 * Usage:  node server/migrate-populate-attributes-he.js
 */

require('dotenv').config();
const { query, pool } = require('./db');

const ADJECTIVES_EN = ['red', 'blue', 'large', 'small', 'premium', 'standard', 'deluxe', 'basic', 'professional', 'consumer'];
const ADJECTIVES_HE = ['אדום', 'כחול', 'גדול', 'קטן', 'פרמיום', 'סטנדרטי', 'דלוקס', 'בסיסי', 'מקצועי', 'צרכני'];
const CATEGORIES_EN = ['electronics', 'clothing', 'furniture', 'food', 'books', 'toys', 'sports', 'music', 'art', 'home'];
const CATEGORIES_HE = ['אלקטרוניקה', 'ביגוד', 'ריהוט', 'מזון', 'ספרים', 'צעצועים', 'ספורט', 'מוזיקה', 'אמנות', 'בית'];
const BRANDS_EN = ['BrandA', 'BrandB', 'BrandC', 'BrandD', 'BrandE', 'Generic', 'Premium', 'Store Brand', 'Luxury', 'Budget'];
const BRANDS_HE = ['מותג א', 'מותג ב', 'מותג ג', 'מותג ד', 'מותג ה', 'גנרי', 'פרמיום', 'מותג חנות', 'יוקרה', 'תקציב'];
const MATERIALS_EN = ['Cotton', 'Polyester', 'Wool', 'Silk', 'Nylon', 'Leather', 'Metal', 'Plastic', 'Wood', 'Glass'];
const MATERIALS_HE = ['כותנה', 'פוליאסטר', 'צמר', 'משי', 'ניילון', 'עור', 'מתכת', 'פלסטיק', 'עץ', 'זכוכית'];

function translateStr(enList, heList, val) {
  const idx = enList.indexOf(val);
  return idx !== -1 ? heList[idx] : val;
}

function translateToHe(enAttrs) {
  if (!enAttrs || typeof enAttrs !== 'object') return enAttrs;
  const he = { ...enAttrs };

  if (typeof he.name === 'string') he.name = he.name.replace(/^Item_/, 'פריט_');

  if (typeof he.description === 'string') {
    const match = he.description.match(/^A (\w+) (\w+) product$/);
    if (match) {
      const adjHe = translateStr(ADJECTIVES_EN, ADJECTIVES_HE, match[1]);
      const catHe = translateStr(CATEGORIES_EN, CATEGORIES_HE, match[2]);
      he.description = `מוצר ${catHe} ${adjHe}`;
    }
  }

  if (typeof he.brand === 'string')    he.brand    = translateStr(BRANDS_EN,     BRANDS_HE,     he.brand);
  if (typeof he.color === 'string')    he.color    = translateStr(ADJECTIVES_EN,  ADJECTIVES_HE, he.color);
  if (typeof he.material === 'string') he.material = translateStr(MATERIALS_EN,   MATERIALS_HE,  he.material);
  if (Array.isArray(he.tags))          he.tags     = he.tags.map(t => translateStr(CATEGORIES_EN, CATEGORIES_HE, t));

  return he;
}

async function migrateTable(tbl, idCol) {
  const result = await query(`SELECT ${idCol}, attributes FROM "${tbl}" WHERE attributes_en IS NULL`);
  if (result.rows.length === 0) {
    console.log(`  "${tbl}": already populated, skipping`);
    return;
  }

  const BATCH = 200;
  for (let i = 0; i < result.rows.length; i += BATCH) {
    const slice = result.rows.slice(i, i + BATCH);
    await Promise.all(slice.map(row => {
      const enAttrs = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes;
      const heAttrs = translateToHe(enAttrs);
      return query(
        `UPDATE "${tbl}" SET attributes_en = $1, attributes = $2 WHERE ${idCol} = $3`,
        [JSON.stringify(enAttrs), JSON.stringify(heAttrs), row[idCol]]
      );
    }));
  }
  console.log(`  ✓ "${tbl}": updated ${result.rows.length} rows`);
}

async function migrate() {
  // 1. run_results (old-style schema)
  try {
    await migrateTable('run_results', 'id');
  } catch (err) {
    if (err.code === '42P01') console.log('  run_results not found, skipping');
    else throw err;
  }

  // 2. Per-run tables from leaderboard-table
  let runRows;
  try {
    const r = await query(`SELECT run_id FROM "leaderboard-table" ORDER BY run_id`);
    runRows = r.rows;
  } catch (err) {
    if (err.code === '42P01') { console.log('"leaderboard-table" not found — done'); await pool.end(); return; }
    throw err;
  }

  console.log(`Migrating ${runRows.length} per-run tables…`);
  for (const { run_id: tbl } of runRows) {
    try {
      // detect id column
      const colRes = await query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = $1
           AND column_name IN ('request_id','record_id')
         ORDER BY CASE column_name WHEN 'request_id' THEN 0 ELSE 1 END LIMIT 1`,
        [tbl]
      );
      if (colRes.rows.length === 0) { console.warn(`  ⚠ No id column for "${tbl}", skipping`); continue; }
      await migrateTable(tbl, colRes.rows[0].column_name);
    } catch (err) {
      if (err.code === '42P01') console.warn(`  ⚠ Table "${tbl}" not found, skipping`);
      else throw err;
    }
  }

  console.log('\nDone.');
  await pool.end();
}

migrate().catch(err => { console.error('Migration failed:', err); process.exit(1); });
