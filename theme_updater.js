const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'index.html',
  'admin.html',
  'app.js',
  'server.js',
  'styles.css'
];

// Read and process each file
for (const file of filesToUpdate) {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${file}, not found.`);
    continue;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Branding Replacements
  content = content.replace(/AUREUM/g, 'BLU LEGACY');
  content = content.replace(/Aureum/g, 'Blu Legacy');
  content = content.replace(/aureum/g, 'blulegacy');
  
  // Theme class and variable naming replacements
  content = content.replace(/gold-primary/g, 'sky-primary');
  content = content.replace(/gold-secondary/g, 'sky-secondary');
  content = content.replace(/gold-accent/g, 'sky-accent');
  content = content.replace(/gold-gradient/g, 'sky-gradient');
  content = content.replace(/gold-glow/g, 'sky-glow');
  content = content.replace(/border-gold/g, 'border-sky');
  content = content.replace(/shadow-gold/g, 'shadow-sky');
  content = content.replace(/gold-text/g, 'sky-text');
  content = content.replace(/text-gold/g, 'text-sky');
  content = content.replace(/gold-icon/g, 'sky-icon');
  content = content.replace(/gold-card-glow/g, 'sky-card-glow');
  content = content.replace(/badge-gold/g, 'badge-sky');
  content = content.replace(/gold-letter/g, 'sky-letter');
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${file}`);
}
