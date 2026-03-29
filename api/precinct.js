/**
 * /api/precinct
 * Utah Democratic Party – Precinct Lookup API
 *
 * GET /api/precinct?address=<address>
 *   &html=true|false        (default true)  include renderable HTML snippet
 *   &geometry=true|false    (default true)  include GeoJSON geometry
 *
 * Returns precinct metadata, house/senate district info,
 * GeoJSON geometry, and a self-contained renderable HTML map snippet.
 */

const UGRC_API_KEY     = process.env.UGRC_API_KEY;
const ARCGIS_BASE      = 'https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services';

const PRECINCT_SERVICE = `${ARCGIS_BASE}/VistaBallotAreas/FeatureServer/0/query`;
const HOUSE_SERVICE    = `${ARCGIS_BASE}/UtahHouseDistricts2022to2032/FeatureServer/0/query`;
const SENATE_SERVICE   = `${ARCGIS_BASE}/UtahSenateDistricts2022to2032/FeatureServer/0/query`;

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

// ── Point-in-polygon query helper ─────────────────────────────────────────────
function pointQueryParams(lng, lat, outFields, returnGeometry = true) {
  return new URLSearchParams({
    geometry:       `${lng},${lat}`,
    geometryType:   'esriGeometryPoint',
    inSR:           '4326',
    spatialRel:     'esriSpatialRelIntersects',
    outFields,
    returnGeometry: String(returnGeometry),
    outSR:          '4326',
    f:              'geojson'
  });
}

// ── HTML embed generator ──────────────────────────────────────────────────────
function buildHtml({
  precinctName, precinctID, countyID, matchedAddress,
  lat, lng,
  precinctGeojson, houseGeojson, senateGeojson,
  houseDistrict, senateDistrict
}) {
  const layers = JSON.stringify({
    precinct: precinctGeojson,
    house:    houseGeojson    || null,
    senate:   senateGeojson   || null
  });

  const houseLabel  = houseDistrict  ? `House District ${houseDistrict}`  : '';
  const senateLabel = senateDistrict ? `Senate District ${senateDistrict}` : '';

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
  .meta{display:flex;gap:16px;padding:10px 16px;background:#fff;border-bottom:2px solid #e0e7ef;flex-wrap:wrap;flex-shrink:0;align-items:center}
  .meta span{font-size:.82rem;color:#455a80}
  .meta strong{color:#003594}
  .badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:.75rem;font-weight:600;color:#fff}
  .badge-house{background:#7c3aed}
  .badge-senate{background:#0891b2}
  .badge-precinct{background:#003594}
  #map{flex:1;min-height:300px}
  .legend{background:#fff;padding:8px 12px;border-radius:6px;box-shadow:0 1px 5px rgba(0,0,0,.2);font-size:.78rem;line-height:1.8}
  .legend-item{display:flex;align-items:center;gap:6px}
  .legend-swatch{width:14px;height:14px;border-radius:2px;flex-shrink:0}
</style>
</head>
<body>
<div class="header">
  <h2>${precinctName}</h2>
  <p>${matchedAddress}</p>
</div>
<div class="meta">
  <span><span class="badge badge-precinct">Precinct</span> <strong>${precinctID}</strong></span>
  ${houseLabel  ? `<span><span class="badge badge-house">House</span> <strong>${houseLabel}</strong></span>`   : ''}
  ${senateLabel ? `<span><span class="badge badge-senate">Senate</span> <strong>${senateLabel}</strong></span>` : ''}
  <span style="margin-left:auto;color:#8899aa">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
</div>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<script>
  var DATA = ${layers};
  var LAT = ${lat}, LNG = ${lng};

  window.addEventListener('load', function() {
    var m = L.map('map').setView([LAT, LNG], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19
    }).addTo(m);

    var bounds = null;

    // Senate district – teal, widest outline, drawn first (bottom)
    if (DATA.senate) {
      var senateLayer = L.geoJSON(DATA.senate, {
        style: { color: '#0891b2', weight: 3, fillColor: '#67e8f9', fillOpacity: 0.15, dashArray: '6 4' }
      }).addTo(m);
      senateLayer.bindTooltip('${senateLabel}', { permanent: true, direction: 'center', className: 'district-tip senate-tip' });
      bounds = senateLayer.getBounds();
    }

    // House district – purple, medium outline
    if (DATA.house) {
      var houseLayer = L.geoJSON(DATA.house, {
        style: { color: '#7c3aed', weight: 2.5, fillColor: '#c4b5fd', fillOpacity: 0.15, dashArray: '4 3' }
      }).addTo(m);
      houseLayer.bindTooltip('${houseLabel}', { permanent: true, direction: 'center', className: 'district-tip house-tip' });
      if (!bounds) bounds = houseLayer.getBounds();
    }

    // Precinct – blue, solid, on top
    var precinctLayer = L.geoJSON(DATA.precinct, {
      style: { color: '#003594', weight: 3, fillColor: '#4a90e2', fillOpacity: 0.3 }
    }).addTo(m);
    precinctLayer.bindTooltip('${precinctName}', { permanent: true, direction: 'center', className: 'district-tip precinct-tip' });
    bounds = precinctLayer.getBounds();

    // Address pin
    L.circleMarker([LAT, LNG], {
      radius: 8, fillColor: '#003594', color: '#fff', weight: 2, fillOpacity: 1
    }).addTo(m);

    // Legend
    var legend = L.control({ position: 'bottomright' });
    legend.onAdd = function() {
      var d = L.DomUtil.create('div', 'legend');
      d.innerHTML =
        '<div class="legend-item"><div class="legend-swatch" style="background:#4a90e2;border:2px solid #003594"></div> Precinct</div>' +
        (DATA.house  ? '<div class="legend-item"><div class="legend-swatch" style="background:#c4b5fd;border:2px solid #7c3aed"></div> House District</div>'   : '') +
        (DATA.senate ? '<div class="legend-item"><div class="legend-swatch" style="background:#67e8f9;border:2px solid #0891b2"></div> Senate District</div>' : '');
      return d;
    };
    legend.addTo(m);

    m.invalidateSize();
    m.fitBounds(bounds, { padding: [40, 40] });
  });
<\/script>
</body>
</html>`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use GET.' });
  }

  const {
    address,
    html:     includeHtml     = 'true',
    geometry: includeGeometry = 'true'
  } = req.query;

  if (!address || !address.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: address',
      usage:  'GET /api/precinct?address=350+N+State+St,+Salt+Lake+City'
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
        success:  false,
        error:    geoJson.message || 'Address not found. Try including city or ZIP code.',
        parsed:   { street, zone }
      });
    }

    const { x: lng, y: lat } = geoJson.result.location;
    const matchedAddress      = geoJson.result.inputAddress || address.trim();

    // 2. Query precinct, house district, and senate district in parallel
    const [precRes, houseRes, senateRes] = await Promise.all([
      fetch(`${PRECINCT_SERVICE}?${pointQueryParams(lng, lat, 'PrecinctID,AliasName,CountyID,VistaID', true)}`),
      fetch(`${HOUSE_SERVICE}?${pointQueryParams(lng, lat, 'DIST', true)}`),
      fetch(`${SENATE_SERVICE}?${pointQueryParams(lng, lat, 'DIST', true)}`)
    ]);

    const [precJson, houseJson, senateJson] = await Promise.all([
      precRes.json(),
      houseRes.json(),
      senateRes.json()
    ]);

    if (!precJson.features || precJson.features.length === 0) {
      return res.status(404).json({
        success: false,
        error:   'No precinct found at that location. Ensure the address is in Utah.'
      });
    }

    // 3. Extract data
    const precFeature  = precJson.features[0];
    const props        = precFeature.properties;
    const precinctName = props.AliasName  || props.PrecinctID || 'Unknown Precinct';
    const precinctID   = props.PrecinctID || '';
    const vistaID      = props.VistaID    || '';
    const countyID     = props.CountyID   || '';

    const houseFeature  = houseJson.features?.[0]  || null;
    const senateFeature = senateJson.features?.[0] || null;
    const houseDistrict  = houseFeature?.properties?.DIST  ?? null;
    const senateDistrict = senateFeature?.properties?.DIST ?? null;

    // 4. Build response
    const response = {
      success: true,
      data: {
        precinct: {
          name:       precinctName,
          precinctID,
          vistaID,
          county:     countyID
        },
        districts: {
          house:  houseDistrict  !== null ? { number: houseDistrict,  label: `House District ${houseDistrict}`  } : null,
          senate: senateDistrict !== null ? { number: senateDistrict, label: `Senate District ${senateDistrict}` } : null
        },
        address: {
          input:    address.trim(),
          matched:  matchedAddress,
          location: { lat, lng }
        },
        ...(includeGeometry !== 'false' && {
          geometry: {
            precinct: precFeature.geometry,
            house:    houseFeature?.geometry  || null,
            senate:   senateFeature?.geometry || null
          }
        }),
        ...(includeHtml !== 'false' && {
          html: buildHtml({
            precinctName, precinctID, countyID, matchedAddress, lat, lng,
            precinctGeojson: precFeature,
            houseGeojson:    houseFeature,
            senateGeojson:   senateFeature,
            houseDistrict,
            senateDistrict
          })
        })
      }
    };

    return res.status(200).json(response);

  } catch (err) {
    console.error('[precinct api error]', err);
    return res.status(500).json({
      success: false,
      error:   'Internal server error.',
      message: err.message
    });
  }
};
