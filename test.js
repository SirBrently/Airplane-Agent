require('dotenv').config();
const http = require('http');

const SECRET = process.env.JOTFORM_SECRET || 'jetswest_webhook_2024';
const PORT = process.env.PORT || 3000;

const TEST_MESSAGES = [
  "I'm looking to buy a Citation CJ3+ under $4 million. What do you have available?",
  "We have a King Air 350 we're thinking about selling. What's the process?",
  "What financing options do you offer for first-time aircraft buyers?",
];

function post(message) {
  return postJSON('/webhook', { message });
}

// Generic authenticated JSON POST helper.
function postJSON(path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-jotform-secret': SECRET,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runTests() {
  // Health check
  const healthReq = http.get(`http://localhost:${PORT}/health`, (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      console.log('--- Health Check ---');
      console.log(JSON.parse(data));
    });
  });
  healthReq.on('error', (err) => console.error('Health check failed:', err.message));

  await new Promise((r) => setTimeout(r, 300));

  // Test one webhook call
  const testMessage = TEST_MESSAGES[0];
  console.log('\n--- Webhook Test ---');
  console.log('Message:', testMessage);

  try {
    const result = await post(testMessage);
    console.log('Status:', result.status);
    console.log('Reply:', result.body.reply || result.body);
  } catch (err) {
    console.error('Request failed:', err.message);
  }

  // Test the leaseback lead intake (Phase 1). Sends a Jotform-style body to
  // exercise parsing + the operator search. Needs GOOGLE_PLACES_API_KEY set on
  // the server; without it the route returns a clear 500 config error.
  console.log('\n--- Lead Intake Test (POST /lead) ---');
  try {
    const lead = await postJSON('/lead', {
      rawRequest: JSON.stringify({
        q3_name: { first: 'Jane', last: 'Doe' },
        q4_zip: '80112',
        q5_email: 'jane@example.com',
        q6_primaryGoal: 'Explore a leaseback while I finish flight training',
        source: 'facebook-leaseback-campaign',
      }),
    });
    console.log('Status:', lead.status);
    if (lead.body && lead.body.operators) {
      console.log(`Radius: ${lead.body.searchRadiusMiles}mi | operators: ${lead.body.operators.length}`);
      lead.body.operators.slice(0, 5).forEach((op, i) =>
        console.log(`  ${i + 1}. ${op.name} [${op.fitRating}] — ${op.distanceMiles}mi`)
      );
    } else {
      console.log('Body:', lead.body);
    }
  } catch (err) {
    console.error('Lead test failed:', err.message);
  }

  // Test auth rejection
  console.log('\n--- Auth Rejection Test ---');
  const body = JSON.stringify({ message: 'test' });
  const badReq = http.request(
    {
      hostname: 'localhost',
      port: PORT,
      path: '/webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-jotform-secret': 'wrong-secret',
      },
    },
    (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        console.log('Status:', res.statusCode, '(expected 401)');
        console.log('Body:', JSON.parse(data));
      });
    }
  );
  badReq.on('error', (err) => console.error('Bad auth test failed:', err.message));
  badReq.write(body);
  badReq.end();
}

runTests().catch(console.error);
