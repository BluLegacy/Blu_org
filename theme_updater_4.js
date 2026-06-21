const fs = require('fs');
const path = require('path');

// Revert styles.css hardcoded light backgrounds back to dark
const cssPath = path.join(__dirname, 'styles.css');
let cssContent = fs.readFileSync(cssPath, 'utf8');
cssContent = cssContent.replace(/#ffffff 0%, #e0f2fe 100%/g, '#0f172a 0%, #040814 100%');
cssContent = cssContent.replace(/linear-gradient\(135deg, #ffffff 0%, #07070a/g, 'linear-gradient(135deg, #0f172a 0%, #040814');
cssContent = cssContent.replace(/#ffffff 0%, #07070a/g, '#0f172a 0%, #040814');

// Also revert the VIP card background in styles.css line 1859
// I previously replaced #18181f with #ffffff and #07070a with #e0f2fe
cssContent = cssContent.replace(/linear-gradient\(135deg, #ffffff 0%, #e0f2fe 100%\)/g, 'linear-gradient(135deg, #0f172a 0%, #040814 100%)');
fs.writeFileSync(cssPath, cssContent, 'utf8');


// Revert index.html and app.js hardcoded rgba borders back to white glass
const filesToUpdate = ['index.html', 'app.js'];
for (const file of filesToUpdate) {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) continue;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Revert rgba(14,165,233,0.05) to rgba(255,255,255,0.05)
  // Revert rgba(14, 165, 233, 0.05) to rgba(255, 255, 255, 0.05)
  content = content.replace(/rgba\(14,165,233,/g, 'rgba(255,255,255,');
  content = content.replace(/rgba\(14,\s*165,\s*233,/g, 'rgba(255, 255, 255,');
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Reverted hardcoded inline colors in ${file}`);
}
