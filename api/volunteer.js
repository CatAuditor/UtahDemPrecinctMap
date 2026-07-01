/**
 * POST /api/volunteer
 *
 * Appends one signup row to the volunteer spreadsheet's "Submissions" tab,
 * and (optionally) forwards the JSON to VOLUNTEER_WEBHOOK_URL.
 *
 * Body (JSON):
 *   firstName*  lastName  email*  phone
 *   issues[]            — selected top issues
 *   capacity[]          — selected "how can you help" options
 *   helpElect (bool)    — "I would like to help elect Democratic candidates"
 *   newsletter (bool)   — "Subscribe to the newsletter"
 *   precinctName  precinctId  county
 *   houseDistrict  senateDistrict  congressDistrict
 *   addressInput  sourceUrl
 *
 * Submissions column order (must match the sheet header row):
 *   Created | FirstName | LastName | Email | Phone | TopIssues | Capacity |
 *   Precinct | County | House | Senate | Congress | Address | HelpElect |
 *   Newsletter | Status | DateContacted | SourceURL
 */

const config            = require('../lib/config');
const { appendRow }     = require('../lib/sheets');
const { createHmac }    = require('crypto');

function validate(body) {
  const errors = [];
  if (!body.firstName?.trim()) errors.push('firstName is required');
  if (!body.email?.trim())     errors.push('email is required');
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    errors.push('email is invalid');
  }
  return errors;
}

function joinList(v) {
  if (Array.isArray(v)) return v.filter(Boolean).join(', ');
  return v ? String(v) : '';
}

function timestamp() {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: config.client.timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date()).replace(',', '');
  } catch {
    return new Date().toISOString();
  }
}

async function appendWithRetry(row, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await appendRow(config.sheets.volunteerId, config.sheets.submissionsTab, row);
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

async function forwardWebhook(payload) {
  if (!config.volunteer.webhookUrl) return;
  try {
    const body = JSON.stringify(payload);
    const headers = { 'Content-Type': 'application/json' };
    if (config.volunteer.webhookSecret) {
      const sig = createHmac('sha256', config.volunteer.webhookSecret).update(body).digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${sig}`;
    }
    await fetch(config.volunteer.webhookUrl, { method: 'POST', headers, body });
  } catch (err) {
    console.error('[volunteer] webhook forward failed:', err.message);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!config.sheets.volunteerId) {
    return res.status(500).json({ error: 'VOLUNTEER_SHEET_ID is not configured.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const errors = validate(body);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const payload = {
    firstName:        body.firstName.trim(),
    lastName:         body.lastName?.trim() || '',
    email:            body.email.trim().toLowerCase(),
    phone:            body.phone?.trim() || '',
    issues:           joinList(body.issues),
    capacity:         joinList(body.capacity),
    precinct:         body.precinctName || body.precinctId || '',
    county:           body.county || '',
    house:            body.houseDistrict || '',
    senate:           body.senateDistrict || '',
    congress:         body.congressDistrict || '',
    address:          body.addressInput || '',
    helpElect:        body.helpElect ? 'TRUE' : 'FALSE',
    newsletter:       body.newsletter ? 'TRUE' : 'FALSE',
    sourceUrl:        body.sourceUrl || '',
  };

  // Submissions row — order must match the sheet header
  const row = [
    timestamp(),
    payload.firstName, payload.lastName, payload.email, payload.phone,
    payload.issues, payload.capacity,
    payload.precinct, payload.county, payload.house, payload.senate, payload.congress,
    payload.address, payload.helpElect, payload.newsletter,
    'New',   // Status
    '',      // DateContacted (organizers fill this)
    payload.sourceUrl,
  ];

  try {
    await appendWithRetry(row);
    // Fire-and-forget secondary destination
    forwardWebhook(payload);
    return res.status(200).json({ success: true, message: 'Thank you! Your information has been submitted.' });
  } catch (err) {
    console.error('[volunteer] append failed:', err.message);
    return res.status(500).json({ error: 'Could not save your information. Please try again.' });
  }
};
