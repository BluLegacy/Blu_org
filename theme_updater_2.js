const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'styles.css');
let cssContent = fs.readFileSync(cssPath, 'utf8');

// Replace hardcoded gold rgba values with sky rgba values
cssContent = cssContent.replace(/212, 175, 55/g, '14, 165, 233');

// Replace black text on buttons with white text
cssContent = cssContent.replace(/color: #000000;/g, 'color: #ffffff;');
cssContent = cssContent.replace(/color: #000;/g, 'color: #ffffff;');

// Replace hardcoded dark gradient backgrounds with light ones
cssContent = cssContent.replace(/#18181f/g, '#ffffff');
cssContent = cssContent.replace(/#07070a/g, '#e0f2fe'); // light sky blue tint

fs.writeFileSync(cssPath, cssContent, 'utf8');
console.log('Fixed hardcoded colors in styles.css');
