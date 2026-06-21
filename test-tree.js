const fs = require('fs');
const db = JSON.parse(fs.readFileSync('C:/Users/mathu/Desktop/Crypto project/Noida project/blulegacy_database.json'));
const users = db.users || [];
const target = users.find(u => u.userId === 'TRON000013');
console.log('Target:', target ? target.userId + ' ' + target.status : 'Not found');
const directs = users.filter(u => u.parentReferral === 'TRON000013');
console.log('Directs:', directs.map(d => d.userId + ' (' + d.status + ')').join(', '));
for(const d of directs) {
    const downlines = users.filter(u => u.parentReferral === d.userId);
    console.log(d.userId + ' downlines:', downlines.map(x => x.userId + ' (' + x.status + ')').join(', '));
}
