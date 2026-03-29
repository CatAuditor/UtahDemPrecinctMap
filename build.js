const fs = require('fs');

const key = process.env.UGRC_API_KEY;
if (!key) {
  console.error('Error: UGRC_API_KEY environment variable is not set.');
  process.exit(1);
}

let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('YOUR_API_KEY_HERE', key);
fs.writeFileSync('index.html', html);

console.log('Build complete — API key injected.');
