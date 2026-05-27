/**
 * POST /api/volunteer
 *
 * Body (JSON):
 *   firstName*       — required
 *   lastName
 *   email*           — required
 *   phone
 *   precinctName
 *   precinctId
 *   county
 *   houseDistrict
 *   senateDistrict
 *   congressDistrict
 *   addressInput     — the address the user looked up
 *   sourceUrl        — page URL
 *
 * Stores in DB, then forwards to VOLUNTEER_WEBHOOK_URL if configured.
 * To add more destinations (ActionNetwork, Google Sheets, etc.),
 * add cases to the `sendToDestinations` function.
 */

const { getDb }  = require('../lib/db');
const config     = require('../lib/config');
const { createHmac } = require('crypto');

function validateBody(body) {
  const errors = [];
  if (!body.firstName?.trim()) errors.push('firstName is required');
  if (!body.email?.trim())     errors.push('email is required');
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    errors.push('email is invalid');
  }
  return errors;
}

async function sendToWebhook(payload, url, secret) {
  const body = JSON.stringify(payload);
  const headers = { 'Content-Type': 'application/json' };

  if (secret) {
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    headers['X-Webhook-Signature'] = `sha256=${sig}`;
  }

  const res = await fetch(url, { method: 'POST', headers, body });
  return { ok: res.ok, status: res.status };
}

// Add additional destination functions here (ActionNetwork, Sheets, etc.)
// Each should be async and return { ok, status }.

async function sendToDestinations(payload) {
  const results = [];

  if (config.volunteer.webhookUrl) {
    try {
      const r = await sendToWebhook(payload, config.volunteer.webhookUrl, config.volunteer.webhookSecret);
      results.push({ destination: 'webhook', ...r });
    } catch (err) {
      results.push({ destination: 'webhook', ok: false, error: err.message });
    }
  }

  return results;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const errors = validateBody(body);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const payload = {
    firstName:        body.firstName?.trim(),
    lastName:         body.lastName?.trim()  || null,
    email:            body.email?.trim().toLowerCase(),
    phone:            body.phone?.trim()     || null,
    precinctName:     body.precinctName      || null,
    precinctId:       body.precinctId        || null,
    county:           body.county            || null,
    houseDistrict:    body.houseDistrict     || null,
    senateDistrict:   body.senateDistrict    || null,
    congressDistrict: body.congressDistrict  || null,
    addressInput:     body.addressInput      || null,
    sourceUrl:        body.sourceUrl         || null,
    submittedAt:      new Date().toISOString(),
    client:           config.client.name,
  };

  try {
    const sql = getDb();

    // Persist to DB first — this always succeeds even if webhook fails
    const [row] = await sql(
      `INSERT INTO volunteer_signups
         (first_name, last_name, email, phone,
          precinct_name, precinct_id, county,
          house_district, senate_district, congress_district,
          address_input, source_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        payload.firstName, payload.lastName, payload.email, payload.phone,
        payload.precinctName, payload.precinctId, payload.county,
        payload.houseDistrict, payload.senateDistrict, payload.congressDistrict,
        payload.addressInput, payload.sourceUrl,
      ]
    );

    // Forward to configured destinations (fire-and-forget after DB write)
    const destinationResults = await sendToDestinations(payload);

    // Update webhook status in DB
    const webhookResult = destinationResults.find(r => r.destination === 'webhook');
    if (webhookResult) {
      await sql(
        `UPDATE volunteer_signups SET webhook_sent = $1, webhook_status = $2 WHERE id = $3`,
        [webhookResult.ok, String(webhookResult.status || webhookResult.error || ''), row.id]
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Thank you! Your information has been submitted.',
      id: row.id,
    });
  } catch (err) {
    console.error('[volunteer] error:', err.message);
    return res.status(500).json({ error: 'Failed to save your information. Please try again.' });
  }
};
