import http from 'http';

const fixtureArg = process.argv[2] || 'payment.failed';
const port = process.env.PORT || 3000;

const postData = JSON.stringify({ fixture: fixtureArg });

const options: http.RequestOptions = {
  hostname: 'localhost',
  port: Number(port),
  path: '/api/webhooks/razorpay/test',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
  },
};

console.log(`Sending synthetic fixture '${fixtureArg}' to http://localhost:${port}/api/webhooks/razorpay/test ...`);

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log(`HTTP Status: ${res.statusCode}`);
    try {
      const json = JSON.parse(body);
      console.log('Response Payload:', JSON.stringify(json, null, 2));
    } catch {
      console.log('Response Body:', body);
    }
  });
});

req.on('error', (e) => {
  console.error(`Error sending fixture: ${e.message}`);
  console.error('Ensure Next.js app is running on http://localhost:3000 (npm run dev)');
});

req.write(postData);
req.end();
