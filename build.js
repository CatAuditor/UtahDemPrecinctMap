const fs = require('fs');

const required = ['UGRC_API_KEY'];
const missing  = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Error: missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

// Default values mirror lib/config.js so the frontend stays in sync
const replacements = {
  '%%UGRC_API_KEY%%':      process.env.UGRC_API_KEY,
  '%%ARCGIS_BASE%%':       process.env.ARCGIS_BASE       || 'https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services',
  '%%PRECINCT_SVC_PATH%%': process.env.PRECINCT_SVC_PATH || 'VistaBallotAreas/FeatureServer/0/query',
  '%%HOUSE_SVC_PATH%%':    process.env.HOUSE_SVC_PATH    || 'UtahHouseDistricts2022to2032/FeatureServer/0/query',
  '%%SENATE_SVC_PATH%%':   process.env.SENATE_SVC_PATH   || 'UtahSenateDistricts2022to2032/FeatureServer/0/query',
  '%%CONGRESS_SVC_PATH%%': process.env.CONGRESS_SVC_PATH || 'political_us_congress_districts_2026_to_2032/FeatureServer/0/query',
  '%%SCHOOL_BOARD_SVC_PATH%%':    process.env.SCHOOL_BOARD_SVC_PATH    || 'UtahSchoolBoardDistricts2022to2032/FeatureServer/0/query',
  '%%SCHOOL_DISTRICT_SVC_PATH%%': process.env.SCHOOL_DISTRICT_SVC_PATH || 'UtahSchoolDistrictBoundaries/FeatureServer/0/query',
  '%%CLIENT_NAME%%':         process.env.CLIENT_NAME         || 'Utah Democratic Party',
  '%%CLIENT_STATE%%':        process.env.CLIENT_STATE        || 'Utah',
  '%%CLIENT_GEO_VIEWBOX%%':  process.env.CLIENT_GEO_VIEWBOX  || '-114.05,36.99,-109.04,42.00',
  '%%CLIENT_MAP_CENTER_LAT%%': process.env.CLIENT_MAP_CENTER_LAT || '39.5',
  '%%CLIENT_MAP_CENTER_LNG%%': process.env.CLIENT_MAP_CENTER_LNG || '-111.5',
  '%%CLIENT_MAP_ZOOM%%':       process.env.CLIENT_MAP_ZOOM      || '7',
};

let html = fs.readFileSync('index.html', 'utf8');
for (const [placeholder, value] of Object.entries(replacements)) {
  html = html.replaceAll(placeholder, value);
}
fs.writeFileSync('index.html', html);

console.log('Build complete — client config injected.');
