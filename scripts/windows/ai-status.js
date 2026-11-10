// Used by check.ps1: calls GET /ai/status on the local API and prints the JSON.
// /ai/status requires a login, so this signs a 60-second token with the server's own
// JWT_SECRET from .env. It runs on the server itself; the token never leaves the machine.
// Run from the repo root:  node scripts/windows/ai-status.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const jwt = require('jsonwebtoken');

const port = process.env.PORT || '3000';
const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('JWT_SECRET is not set in .env');
  process.exit(2);
}
const token = jwt.sign({ userId: 'windows-check-script' }, secret, { algorithm: 'HS256', expiresIn: 60 });

fetch(`http://127.0.0.1:${port}/ai/status`, {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(15000),
})
  .then(async (res) => {
    const body = await res.text();
    if (!res.ok) {
      console.error(`HTTP ${res.status}: ${body}`);
      process.exit(1);
    }
    process.stdout.write(body);
  })
  .catch((err) => {
    console.error(`Request failed: ${err.message}`);
    process.exit(1);
  });
