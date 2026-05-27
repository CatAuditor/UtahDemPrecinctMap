/**
 * /api/admin — Candidate management (protected)
 *
 * All requests require: Authorization: Bearer <ADMIN_SECRET>
 *
 * GET    /api/admin?resource=candidates            — list all candidates
 * GET    /api/admin?resource=candidates&id=1       — get one candidate
 * POST   /api/admin?resource=candidates            — create candidate
 * PUT    /api/admin?resource=candidates&id=1       — update candidate
 * DELETE /api/admin?resource=candidates&id=1       — delete (soft) candidate
 *
 * GET    /api/admin?resource=signups               — list volunteer signups
 *   optional: ?limit=100&offset=0
 */

const { getDb } = require('../lib/db');
const config    = require('../lib/config');

function isAuthorized(req) {
  if (!config.adminSecret) return false;
  const header = req.headers['authorization'] || '';
  return header === `Bearer ${config.adminSecret}`;
}

// ── Candidate handlers ────────────────────────────────────────────────────────

async function listCandidates(sql) {
  return sql(
    `SELECT id, name, photo_url, bio, website, volunteer_url, donate_url,
            office, district_type, district_value, active, display_order,
            created_at, updated_at
     FROM candidates
     ORDER BY district_type ASC, display_order ASC, name ASC`
  );
}

async function getCandidate(sql, id) {
  const rows = await sql(`SELECT * FROM candidates WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function createCandidate(sql, body) {
  const {
    name, photo_url, bio, website, volunteer_url, donate_url,
    office, district_type, district_value, active = true, display_order = 0
  } = body;

  if (!name?.trim())            throw { status: 400, message: 'name is required' };
  if (!district_type?.trim())   throw { status: 400, message: 'district_type is required' };
  if (district_value == null)   throw { status: 400, message: 'district_value is required' };

  const VALID_TYPES = ['house', 'senate', 'congress', 'school_board', 'precinct'];
  if (!VALID_TYPES.includes(district_type)) {
    throw { status: 400, message: `district_type must be one of: ${VALID_TYPES.join(', ')}` };
  }

  const [row] = await sql(
    `INSERT INTO candidates
       (name, photo_url, bio, website, volunteer_url, donate_url,
        office, district_type, district_value, active, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      name.trim(), photo_url || null, bio || null, website || null,
      volunteer_url || null, donate_url || null, office || null,
      district_type, String(district_value), Boolean(active), Number(display_order),
    ]
  );
  return row;
}

async function updateCandidate(sql, id, body) {
  const existing = await getCandidate(sql, id);
  if (!existing) throw { status: 404, message: 'Candidate not found' };

  const fields = ['name', 'photo_url', 'bio', 'website', 'volunteer_url', 'donate_url',
                  'office', 'district_type', 'district_value', 'active', 'display_order'];

  const updates = [];
  const values  = [];
  let   idx     = 1;

  for (const f of fields) {
    if (body[f] !== undefined) {
      updates.push(`${f} = $${idx++}`);
      values.push(body[f]);
    }
  }
  if (!updates.length) throw { status: 400, message: 'No fields to update' };

  updates.push(`updated_at = NOW()`);
  values.push(id);

  const [row] = await sql(
    `UPDATE candidates SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return row;
}

async function deleteCandidate(sql, id) {
  const existing = await getCandidate(sql, id);
  if (!existing) throw { status: 404, message: 'Candidate not found' };
  await sql(`UPDATE candidates SET active = false, updated_at = NOW() WHERE id = $1`, [id]);
  return { deleted: true, id: Number(id) };
}

// ── Signup handlers ───────────────────────────────────────────────────────────

async function listSignups(sql, query) {
  const limit  = Math.min(parseInt(query.limit  || '100', 10), 500);
  const offset = parseInt(query.offset || '0', 10);
  return sql(
    `SELECT * FROM volunteer_signups ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
}

// ── Main handler ──────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { resource, id } = req.query;
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  try {
    const sql = getDb();

    if (resource === 'candidates') {
      if (req.method === 'GET')    return res.status(200).json(id ? await getCandidate(sql, id) : await listCandidates(sql));
      if (req.method === 'POST')   return res.status(201).json(await createCandidate(sql, body));
      if (req.method === 'PUT')    return res.status(200).json(await updateCandidate(sql, id, body));
      if (req.method === 'DELETE') return res.status(200).json(await deleteCandidate(sql, id));
    }

    if (resource === 'signups') {
      if (req.method === 'GET') return res.status(200).json(await listSignups(sql, req.query));
    }

    return res.status(404).json({ error: `Unknown resource: ${resource}` });

  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[admin] error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
