const http = require('http');

const options = {
  hostname: 'localhost',
  port: 8080,
  path: '/api/user/team-network',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer test'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', data.substring(0, 500));
  });
});

req.on('error', (e) => {
  console.error(problem with request: );
});

req.end();
