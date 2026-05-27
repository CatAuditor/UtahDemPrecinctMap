/**
 * GET /api/candidates
 *
 * Query params (all optional, at least one district recommended):
 *   houseDistrict     — state house district number
 *   senateDistrict    — state senate district number
 *   congressDistrict  — congressional district number
 *   schoolBoard       — school board district number
 *   precinctId        — precinct ID
 *
 * Returns all active candidates matching any of the provided districts,
 * ordered by district_type then display_order.
 */

const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=60');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { houseDistrict, senateDistrict, congressDistrict, schoolBoard, precinctId } = req.query;

  // Build a filter of (district_type, district_value) pairs to match against
  const filters = [];
  if (houseDistrict)    filters.push({ type: 'house',        value: String(houseDistrict) });
  if (senateDistrict)   filters.push({ type: 'senate',       value: String(senateDistrict) });
  if (congressDistrict) filters.push({ type: 'congress',     value: String(congressDistrict) });
  if (schoolBoard)      filters.push({ type: 'school_board', value: String(schoolBoard) });
  if (precinctId)       filters.push({ type: 'precinct',     value: String(precinctId) });

  if (!filters.length) {
    return res.status(400).json({ error: 'Provide at least one district parameter.' });
  }

  try {
    const sql = getDb();

    // Build WHERE clause: active AND (type/value pairs joined with OR)
    const conditions = filters.map((f, i) =>
      `(district_type = $${i * 2 + 1} AND district_value = $${i * 2 + 2})`
    );
    const values = filters.flatMap(f => [f.type, f.value]);

    const rows = await sql(
      `SELECT id, name, photo_url, bio, website, volunteer_url, donate_url,
              office, district_type, district_value, display_order
       FROM candidates
       WHERE active = true AND (${conditions.join(' OR ')})
       ORDER BY display_order ASC, district_type ASC, name ASC`,
      values
    );

    return res.status(200).json({ success: true, candidates: rows });
  } catch (err) {
    console.error('[candidates] error:', err.message);
    return res.status(500).json({ error: 'Failed to load candidates.' });
  }
};
