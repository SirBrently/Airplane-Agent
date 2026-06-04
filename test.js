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
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ message });
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: '/webhook',
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
