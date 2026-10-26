const fs = require('fs');
const path = require('path');

const replacements = {
  'revisión': 'revisi�n',
  'REVISIóN': 'REVISI�N',
  'Operación': 'Operaci�n',
  'OPERACIóN': 'OPERACI�N',
  'OPERACIòN': 'OPERACI�N',
  'Inspección': 'Inspecci�n',
  'INSPECCIóN': 'INSPECCI�N',
  'Última': '�ltima',
  'Año': 'A�o',
  'AO': 'A�O',
  'AÑO': 'A�O',
  '📱': '??',
  '📻': '??',
  '📹': '??',
  '✅': '?',
  '🚨': '??',
  '⚠� ': '??',
  '⬇': '??',
  'Gestión': 'Gesti�n',
  'fotográficos': 'fotogr�ficos',
  'CATEGOR�\x8dA': 'CATEGOR�A'
};

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        processDir(fullPath);
      }
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      for (const [bad, good] of Object.entries(replacements)) {
        if (content.includes(bad)) {
          content = content.split(bad).join(good);
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Fixed:', fullPath);
      }
    }
  }
}

processDir('backend');
processDir('frontEnd/src');
