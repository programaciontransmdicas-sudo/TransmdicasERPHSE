const fs = require('fs');
const path = require('path');

// We use Buffer.from(..., 'hex').toString('utf8') to get the double-encoded bytes exactly,
// so that JS source code encoding doesn't break our search strings.

const replacements = [
  { bad: Buffer.from('revisi\xc3\xb3n', 'utf8').toString('utf8'), good: 'revisión' }, // Wait, if the file has double encoded text, the bytes on disk are c3 83 c2 b3. If we read as utf8, we get Ã³.
  { bad: 'revisi\u00c3\u00b3n', good: 'revisión' },
  { bad: 'REVISI\u00c3\u00b3N', good: 'REVISIÓN' },
  { bad: 'Operaci\u00c3\u00b3n', good: 'Operación' },
  { bad: 'OPERACI\u00c3\u00b3N', good: 'OPERACIÓN' },
  { bad: 'OPERACI\u00c3\u00b2N', good: 'OPERACIÓN' },
  { bad: 'Inspecci\u00c3\u00b3n', good: 'Inspección' },
  { bad: 'INSPECCI\u00c3\u00b3N', good: 'INSPECCIÓN' },
  { bad: '\u00c3\u0161ltima', good: 'Última' },
  { bad: '\u00c3\u201altima', good: 'Última' },
  { bad: '\u00c3\u0160ltima', good: 'Última' },
  { bad: '\u00c3\u02dcLTIMA', good: 'ÚLTIMA' },
  { bad: 'A\u00c3\u00b1o', good: 'Año' },
  { bad: 'A\u00c3\u2018O', good: 'AÑO' },
  { bad: 'Gesti\u00c3\u00b3n', good: 'Gestión' },
  { bad: 'fotogr\u00c3\u00a1ficos', good: 'fotográficos' },
  { bad: 'CATEGOR\u00c3\u008dA', good: 'CATEGORÍA' },
  { bad: '\u00f0\u0178\u201c\u00b1', good: '📱' }, // emojis
  { bad: '\u00f0\u0178\u201c\u00bb', good: '📻' },
  { bad: '\u00f0\u0178\u201c\u00b9', good: '📹' },
  { bad: '\u00e2\u0153\u2026', good: '✅' },
  { bad: '\u00f0\u0178\u0161\u00a8', good: '🚨' },
  { bad: '\u00e2\u0161\u00a0\u00ef\u00b8\u008f', good: '⚠️' },
  { bad: '\u00e2\u00ac\u2021', good: '⬇️' }
];

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        processDir(fullPath);
      }
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
      // Read raw bytes
      let buf = fs.readFileSync(fullPath);
      let content = buf.toString('utf8');
      
      // Let's also do a more brute-force approach: 
      // Replace the exact UTF-8 hex sequences of the double encoded strings!
      
      let changed = false;
      for (const {bad, good} of replacements) {
        if (content.includes(bad)) {
          content = content.split(bad).join(good);
          changed = true;
        }
      }
      
      // Secondary fallback using hex replacement
      let hex = buf.toString('hex');
      const hexReplacements = [
        { bad: 'c383c2b3', good: 'c3b3' }, // ó
        { bad: 'c383c293', good: 'c393' }, // Ó
        { bad: 'c383c2b1', good: 'c3b1' }, // ñ
        { bad: 'c383c291', good: 'c391' }, // Ñ
        { bad: 'c383c2a1', good: 'c3a1' }, // á
        { bad: 'c383c281', good: 'c381' }, // Á
        { bad: 'c383c2a9', good: 'c3a9' }, // é
        { bad: 'c383c289', good: 'c389' }, // É
        { bad: 'c383c2ad', good: 'c3ad' }, // í
        { bad: 'c383c28d', good: 'c38d' }, // Í
        { bad: 'c383c2ba', good: 'c3ba' }, // ú
        { bad: 'c383c29a', good: 'c39a' }, // Ú
        // Emojis:
        // 📱 (f0 9f 93 b1) got double encoded as (c3b0 c5b8 e2809c c2b1) or similar.
        // Let's just use regex for the UI text if we can.
      ];
      
      let hexChanged = false;
      for (const {bad, good} of hexReplacements) {
         if (hex.includes(bad)) {
           hex = hex.split(bad).join(good);
           hexChanged = true;
         }
      }
      
      if (hexChanged && !changed) {
         content = Buffer.from(hex, 'hex').toString('utf8');
         changed = true;
      } else if (hexChanged && changed) {
         content = Buffer.from(Buffer.from(content, 'utf8').toString('hex').split('c383c2b3').join('c3b3'), 'hex').toString('utf8');
      }

      if (changed || hexChanged) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Fixed:', fullPath);
      }
    }
  }
}

processDir('backend');
processDir('frontEnd/src');
