const fs = require('fs');
const path = require('path');

const filesToUpdate = ['index.html', 'app.js'];

for (const file of filesToUpdate) {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) continue;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix hardcoded white text that will be invisible on light background
  content = content.replace(/color:\s*#fff/g, 'color:var(--text-primary)');
  content = content.replace(/color:\s*#ffffff/g, 'color:var(--text-primary)');
  
  // Fix hardcoded white borders/backgrounds for light theme
  // Instead of rgba(255,255,255,0.05), we use border-glass or dark transparent
  content = content.replace(/rgba\(255,255,255,/g, 'rgba(14,165,233,');
  content = content.replace(/rgba\(255,\s*255,\s*255,/g, 'rgba(14, 165, 233,');
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixed hardcoded inline colors in ${file}`);
}
