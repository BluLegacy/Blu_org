const jwt = require('jsonwebtoken');
const http = require('http');

// Get Umaa's ID from database
const fs = require('fs');
const db = JSON.parse(fs.readFileSync('aureum_database.json'));
const umaa = db.users.find(u => u.email === 'Umaa@gmail.com');

const token = jwt.sign({ id: umaa._id, role: umaa.role, userId: umaa.userId }, 'aureum_jwt_sec_token_9921', { expiresIn: '7d' });
const req2 = http.request('http://localhost:8080/api/user/context', { headers: { 'Authorization': 'Bearer ' + token } }, (res2) => {
  let body2 = '';
  res2.on('data', d => body2 += d);
  res2.on('end', () => console.log('Context Response:', body2));
});
req2.end();
