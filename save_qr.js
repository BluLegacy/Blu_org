// This script copies the user-uploaded QR code to deposit_qr.png
const fs = require('fs');
const path = require('path');

// Check common upload locations
const possiblePaths = [
  path.join(process.env.USERPROFILE, 'Downloads'),
  path.join(process.env.USERPROFILE, 'Desktop'),
  path.join(process.env.TEMP),
  __dirname
];

// Try to find any recently added image
let found = false;
for (const dir of possiblePaths) {
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if ((f.includes('qr') || f.includes('QR') || f.includes('usdt') || f.includes('USDT')) && 
          (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))) {
        fs.copyFileSync(path.join(dir, f), path.join(__dirname, 'deposit_qr.png'));
        console.log('Copied:', f, 'from', dir);
        found = true;
        break;
      }
    }
    if (found) break;
  } catch(e) {}
}

if (!found) {
  console.log('No QR file found to copy. Will use qr_code.png as fallback.');
  // Copy existing qr_code.png as deposit_qr.png
  if (fs.existsSync(path.join(__dirname, 'qr_code.png'))) {
    fs.copyFileSync(path.join(__dirname, 'qr_code.png'), path.join(__dirname, 'deposit_qr.png'));
    console.log('Used existing qr_code.png as deposit_qr.png');
  }
}
