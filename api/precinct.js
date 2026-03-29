/**
 * /api/precinct
 * Utah Democratic Party – Precinct Lookup API
 *
 * GET /api/precinct?address=<address>
 *
 * Returns precinct metadata, GeoJSON geometry, and a self-contained
 * renderable HTML snippet for the matched precinct.
 */

const UGRC_API_KEY      = process.env.UGRC_API_KEY;
const PRECINCT_SERVICE  =
  'https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/' +
  'VistaBallotAreas/FeatureServer/0/query';

// ── Address parser ────────────────────────────────────────────────────────────
function parseAddress(raw) {
  raw = raw.trim();

  const zipMatch = raw.match(/\b(\d{5})\b/);
  if (zipMatch) {
    const zip    = zipMatch[1];
    const street = raw
      .replace(/,?\s*[A-Z]{2}\s+\d{5}/, '')
      .replace(/,?\s*\d{5}/, '')
      .trim();
    return { street, zone: zip };
  }

  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const zone = parts[1].replace(/\s+[A-Z]{2}$/, '').trim();
    return { street: parts[0], zone };
  }

  const words = raw.split(/\s+/);
  if (words.length >= 3) {
    return { street: words.slice(0, -1).join(' '), zone: words[words.length - 1] };
  }

  return { street: raw, zone: 'Utah' };
}

// ── HTML embed generator ──────────────────────────────────────────────────────
function buildHtml({ precinctName, precinctID, countyID, matchedAddress, lat, lng, geojson }) {
  const geojsonStr = JSON.stringify(geojson);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${precinctName} – Utah Democratic Precinct</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f0f4f8;display:flex;flex-direction:column}
  .header{background:#003594;color:#fff;padding:12px 16px;flex-shrink:0}
  .header h2{font-size:1.1rem;font-weight:700}
  .header p{font-size:.8rem;opacity:.8;margin-top:2px}
  .meta{display:flex;gap:16px;padding:10px 16px;background:#fff;border-bottom:2px solid #e0e7ef;flex-wrap:wrap;flex-shrink:0}
  .meta span{font-size:.82rem;color:#455a80}
  .meta strong{color:#003594}
  #map{flex:1;min-height:300px}
</style>
</head>
<body>
<div class="header">
  <h2>${precinctName}</h2>
  <p>${matchedAddress}</p>
</div>
<div class="meta">
  <span><strong>Precinct ID:</strong> ${precinctID}</span>
  <span><strong>County:</strong> ${countyID}</span>
  <span><strong>Coordinates:</strong> ${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
</div>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<script>
  var GEOJSON = ${geojsonStr};
  var LAT = ${lat}, LNG = ${lng};

  window.addEventListener('load', function() {
    var precinctMap = L.map('map').setView([LAT, LNG], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(precinctMap);

    var precinctLayer = L.geoJSON(GEOJSON, {
      style: { color: '#003594', weight: 3, fillColor: '#4a90e2', fillOpacity: 0.3 }
    }).addTo(precinctMap);

    L.circleMarker([LAT, LNG], {
      radius: 8, fillColor: '#003594', color: '#fff', weight: 2, fillOpacity: 1
    }).addTo(precinctMap);

    precinctMap.invalidateSize();
    precinctMap.fitBounds(precinctLayer.getBounds(), { padding: [30, 30] });
  });
<\/script>
</body>
</html>`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  // CORS — allow any origin so external services and LLMs can call this freely
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use GET.' });
  }

  const { address, html: includeHtml = 'true', geometry: includeGeometry = 'true' } = req.query;

  if (!address || !address.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: address',
      usage: 'GET /api/precinct?address=350+N+State+St,+Salt+Lake+City'
    });
  }

  try {
    // 1. Geocode via UGRC
    const { street, zone } = parseAddress(address);
    const geocodeUrl =
      `https://api.mapserv.utah.gov/api/v1/geocode/` +
      `${encodeURIComponent(street)}/${encodeURIComponent(zone)}` +
      `?apiKey=${UGRC_API_KEY}&spatialReference=4326`;

    const geoRes  = await fetch(geocodeUrl, {
      headers: { Referer: 'https://utah-dem-precinct-map.vercel.app/' }
    });
    const geoJson = await geoRes.json();

    if (geoJson.status !== 200 || !geoJson.result) {
      return res.status(404).json({
        success: false,
        error: geoJson.message || 'Address not found. Try including city or ZIP code.',
        parsed: { street, zone }
      });
    }

    const { x: lng, y: lat } = geoJson.result.location;
    const matchedAddress      = geoJson.result.inputAddress || address.trim();

    // 2. Query ArcGIS for precinct polygon
    const params = new URLSearchParams({
      geometry:       `${lng},${lat}`,
      geometryType:   'esriGeometryPoint',
      inSR:           '4326',
      spatialRel:     'esriSpatialRelIntersects',
      outFields:      'PrecinctID,AliasName,CountyID,VistaID',
      returnGeometry: 'true',
      outSR:          '4326',
      f:              'geojson'
    });

    const precRes  = await fetch(`${PRECINCT_SERVICE}?${params}`);
    const precJson = await precRes.json();

    if (!precJson.features || precJson.features.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No precinct found at that location. Ensure the address is in Utah.'
      });
    }

    const feature      = precJson.features[0];
    const props        = feature.properties;
    const precinctName = props.AliasName  || props.PrecinctID || 'Unknown Precinct';
    const precinctID   = props.PrecinctID || '';
    const vistaID      = props.VistaID    || '';
    const countyID     = props.CountyID   || '';

    // 3. Build response
    const response = {
      success: true,
      data: {
        precinct: {
          name:      precinctName,
          precinctID,
          vistaID,
          county:    countyID
        },
        address: {
          input:    address.trim(),
          matched:  matchedAddress,
          location: { lat, lng }
        },
        ...(includeGeometry !== 'false' && {
          geometry: feature.geometry   // GeoJSON polygon
        }),
        ...(includeHtml !== 'false' && {
          html: buildHtml({ precinctName, precinctID, countyID, matchedAddress, lat, lng, geojson: feature })
        })
      }
    };

    return res.status(200).json(response);

  } catch (err) {
    console.error('[precinct api error]', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error.',
      message: err.message
    });
  }
};
