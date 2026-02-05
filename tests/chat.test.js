/**
 * Simple tests for /api/chat endpoint
 * Run with: node tests/chat.test.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:8080';

// Helper to make HTTP requests
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn()
    .then(() => { console.log(`✅ ${name}`); passed++; })
    .catch(err => { console.log(`❌ ${name}: ${err.message}`); failed++; });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Tests
async function runTests() {
  console.log('\n🧪 Running Chat API Tests...\n');

  await test('Health endpoint returns status ok', async () => {
    const res = await request('GET', '/api/chat/health');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.status === 'ok', 'Expected status ok');
  });

  await test('Chat responds to greeting', async () => {
    const res = await request('POST', '/api/chat', { message: 'Hello' });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Expected success true');
    assert(res.body.message.includes('Welcome'), 'Expected welcome message');
  });

  await test('Chat responds to Ceylon cinnamon question', async () => {
    const res = await request('POST', '/api/chat', { message: 'What is Ceylon cinnamon?' });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.message.toLowerCase().includes('ceylon'), 'Expected Ceylon in response');
  });

  await test('Chat responds to grades question', async () => {
    const res = await request('POST', '/api/chat', { message: 'What grades do you offer?' });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.message.includes('Alba'), 'Expected Alba grade in response');
  });

  await test('Chat responds to health benefits question', async () => {
    const res = await request('POST', '/api/chat', { message: 'What are the health benefits?' });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.message.toLowerCase().includes('health') || res.body.message.toLowerCase().includes('benefit'), 'Expected health info');
  });

  await test('Chat responds to shipping question', async () => {
    const res = await request('POST', '/api/chat', { message: 'Do you ship internationally?' });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.message.toLowerCase().includes('ship'), 'Expected shipping info');
  });

  await test('Chat returns 400 for empty message', async () => {
    const res = await request('POST', '/api/chat', { message: '' });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('Chat handles unknown question gracefully', async () => {
    const res = await request('POST', '/api/chat', { message: 'xyzabc123random' });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Expected success even for unknown');
  });

  // Summary
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
