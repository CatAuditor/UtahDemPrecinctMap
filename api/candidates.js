/**
 * GET /api/candidates
 *
 * Reads the candidate Google Sheet, filters by the district(s) provided, and
 * returns matching active candidates. Organizers manage the sheet directly.
 *
 * Query params (provide at least one):
 *   houseDistrict, senateDistrict, congressDistrict, schoolBoard, precinctId
 *
 * Expected sheet headers (row 1, order-independent):
 *   Name | Office | DistrictType | District | PhotoURL | Bio | Website |
 *   Email | Phone | Facebook | Instagram | X | VolunteerURL | DonateURL |
 *   TopIssues | Active | Order
 */

const config = require('../lib/config');
const { readRange, rowsToObjects } = require('../lib/sheets');

// Short in-memory cache so a warm function instance doesn't refetch every call
let _cache = { rows: null, exp: 0 };
const CACHE_MS = 60 * 1000;

async function getCandidateRows() {
  const now = Date.now();
  if (_cache.rows && _cache.exp > now) return _cache.rows;
  const values = await readRange(config.sheets.candidateId, `${config.sheets.candidateTab}!A:Z`);
  const rows = rowsToObjects(values);
  _cache = { rows, exp: now + CACHE_MS };
  return rows;
}

function isActive(row) {
  const v = String(row.Active ?? '').trim().toLowerCase();
  return v !== 'false' && v !== 'no' && v !== '0' && v !== 'n';
}

function splitIssues(raw) {
  return String(raw || '')
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(Boolean);
}

function shapeCandidate(row) {
  return {
    name:         row.Name || '',
    office:       row.Office || '',
    districtType: String(row.DistrictType || '').trim().toLowerCase(),
    district:     String(row.District || '').trim(),
    photoUrl:     row.PhotoURL || '',
    bio:          row.Bio || '',
    website:      row.Website || '',
    email:        row.Email || '',
    phone:        row.Phone || '',
    social: {
      facebook:  row.Facebook || '',
      instagram: row.Instagram || '',
      x:         row.X || row.Twitter || '',
    },
    volunteerUrl: row.VolunteerURL || '',
    donateUrl:    row.DonateURL || '',
    issues:       splitIssues(row.TopIssues),
    order:        Number(row.Order || 0),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // CDN-cache so public lookups rarely touch the Sheets API
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { houseDistrict, senateDistrict, congressDistrict, schoolBoard, precinctId } = req.query;

  // Map each district type to the requested value
  const wanted = {};
  if (houseDistrict)    wanted.house        = String(houseDistrict).trim();
  if (senateDistrict)   wanted.senate       = String(senateDistrict).trim();
  if (congressDistrict) wanted.congress     = String(congressDistrict).trim();
  if (schoolBoard)      wanted.school_board = String(schoolBoard).trim();
  if (precinctId)       wanted.precinct     = String(precinctId).trim();

  if (!Object.keys(wanted).length) {
    return res.status(400).json({ error: 'Provide at least one district parameter.' });
  }

  if (!config.sheets.candidateId) {
    return res.status(500).json({ error: 'CANDIDATE_SHEET_ID is not configured.' });
  }

  try {
    const rows = await getCandidateRows();
    const candidates = rows
      .filter(isActive)
      .map(shapeCandidate)
      .filter(c => c.districtType in wanted && c.district === wanted[c.districtType])
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

    return res.status(200).json({ success: true, candidates });
  } catch (err) {
    console.error('[candidates] error:', err.message);
    return res.status(500).json({ error: 'Failed to load candidates.' });
  }
};
