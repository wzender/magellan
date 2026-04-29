const express = require('express');
const router  = express.Router();
const path    = require('path');
const XLSX    = require('xlsx');

const FILE = path.join(__dirname, '../../data/Subtypes.xlsx');

let cache = null;

function parseCountries(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(c => String(c).trim()).filter(Boolean);

  const raw = String(value).trim();
  if (!raw) return [];

  // New format support: "['Spain', 'Italy']" (and valid JSON arrays).
  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed = JSON.parse(raw.replace(/'/g, '"'));
      if (Array.isArray(parsed)) {
        return parsed.map(c => String(c).trim()).filter(Boolean);
      }
    } catch {
      // Fallback to legacy parser below.
    }
  }

  // Legacy format support: "Spain, Italy"
  return raw.split(',').map(c => c.trim()).filter(Boolean);
}

function load() {
  if (cache) return cache;
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws); // [{ Subtype, Type, Countries }, ...]

  const byCountry = {};
  for (const row of rows) {
    const countries = parseCountries(row.Countries);
    for (const country of countries) {
      if (!byCountry[country]) byCountry[country] = [];
      byCountry[country].push({ subtype: row.Subtype, type: row.Type });
    }
  }
  cache = byCountry;
  return cache;
}

// GET /api/subtypes-by-country?country=Spain
// Returns [{ subtype, type }, ...] for that country, sorted alphabetically.
router.get('/subtypes-by-country', (req, res) => {
  const { country } = req.query;
  const data = load();
  if (country) {
    const entries = data[country];
    if (!entries) return res.status(404).json({ error: `Unknown country: ${country}` });
    return res.json(entries.slice().sort((a, b) => a.subtype.localeCompare(b.subtype)));
  }
  // Return all countries with their sorted lists
  const all = {};
  for (const [c, entries] of Object.entries(data)) {
    all[c] = entries.slice().sort((a, b) => a.subtype.localeCompare(b.subtype));
  }
  res.json(all);
});

module.exports = router;
