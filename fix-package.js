// fix-package.js
const fs = require('fs');

// Leer el archivo y eliminar BOM
let content = fs.readFileSync('package.json', 'utf8');
// Eliminar el BOM si existe
if (content.charCodeAt(0) === 0xFEFF) {
  content = content.slice(1);
}

// Verificar que sea JSON válido
JSON.parse(content);

// Guardar sin BOM
fs.writeFileSync('package.json', content, 'utf8');
console.log('✅ package.json reparado correctamente');