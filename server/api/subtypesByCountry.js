const express = require('express');
const router  = express.Router();
const path    = require('path');
const XLSX    = require('xlsx');

const FILE = path.join(__dirname, '../../data/Subtypes.xlsx');
const SUBTYPES_COUNTRIES_COLUMN = process.env.SUBTYPES_COUNTRIES_COLUMN || 'Countries';

let cache = null;

function normalizeCountry(value) {
  return String(value || '').trim().toLowerCase();
}

function countriesTextMatchesCountry(countriesValue, country) {
  const text = normalizeCountry(countriesValue);
  const normalizedCountry = normalizeCountry(country);
  if (!text || !normalizedCountry) return false;

  if (text.includes(normalizedCountry)) return true;

  const baseCountry = normalizedCountry.split('_')[0];
  if (Boolean(baseCountry) && baseCountry !== normalizedCountry && text.includes(baseCountry)) {
    console.warn(`⚠ FALLBACK: country "${country}" not found in subtypes — matched via base country "${baseCountry}"`);
    return true;
  }
  return false;
}

function load() {
  if (cache) return cache;
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  cache = XLSX.utils.sheet_to_json(ws); // [{ Subtype, Type, Countries }, ...]
  return cache;
}

// GET /api/subtypes-by-country?country=Spain
// Returns [{ subtype, type }, ...] for that country, sorted alphabetically.
router.get('/subtypes-by-country', (req, res) => {
  const { country } = req.query;
  const rows = load();
  if (country) {
    const entries = rows
      .filter(row => countriesTextMatchesCountry(row[SUBTYPES_COUNTRIES_COLUMN], country))
      .map(row => ({ subtype: row.subType || row.Subtype, type: row.type || row.Type }));
    if (entries.length === 0) return res.status(404).json({ error: `Unknown country: ${country}` });
    return res.json(entries.slice().sort((a, b) => a.subtype.localeCompare(b.subtype)));
  }
  // Return all countries with their sorted lists
  return res.json(rows.map(row => ({ subtype: row.subType || row.Subtype, type: row.type || row.Type, countries: row[SUBTYPES_COUNTRIES_COLUMN] })));
});

module.exports = router;
