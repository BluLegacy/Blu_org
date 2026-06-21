const http = require('http');

const req = http.request('http://localhost:8080/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'} }, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('Login Response:', body);
    try {
      const token = JSON.parse(body).token;
      if (!token) return;
      const req2 = http.request('http://localhost:8080/api/user/context', { headers: { 'Authorization': 'Bearer ' + token } }, (res2) => {
        let body2 = '';
        res2.on('data', d => body2 += d);
        res2.on('end', () => console.log('Context Response:', body2.substring(0, 500) + '...'));
      });
      req2.end();
    } catch (e) {
      console.error(e);
    }
  });
});

req.write(JSON.stringify({identifier:'Umaa@gmail.com', password:'admin'}));
req.end();
