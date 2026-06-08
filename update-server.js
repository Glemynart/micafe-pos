const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.UPDATE_PORT || 3457;
const UPDATES_DIR = path.join(__dirname, 'updates');
const PACKAGE = require('./package.json');

if (!fs.existsSync(UPDATES_DIR)) {
  fs.mkdirSync(UPDATES_DIR, { recursive: true });
  console.log('[UpdateServer] Carpeta "updates" creada. Coloque aqui los archivos de actualizacion:');
  console.log(`[UpdateServer]   - latest.yml (manifesto de version)`);
  console.log(`[UpdateServer]   - MiTienda POS Setup ${PACKAGE.version}.exe (instalador)`);
}

const MIME = {
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
  '.exe': 'application/octet-stream',
  '.zip': 'application/zip',
  '.blockmap': 'application/octet-stream',
};

const server = http.createServer((req, res) => {
  const filePath = path.join(UPDATES_DIR, req.url === '/' ? 'latest.yml' : req.url.replace(/^\//, ''));

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Access-Control-Allow-Origin': '*',
  });

  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`[UpdateServer] Servidor de actualizaciones corriendo en http://localhost:${PORT}`);
  console.log(`[UpdateServer] Version actual del proyecto: ${PACKAGE.version}`);
  console.log(`[UpdateServer] Directorio de updates: ${UPDATES_DIR}`);
  console.log('[UpdateServer] Presiona Ctrl+C para detener');
});
