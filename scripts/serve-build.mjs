import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const host = '127.0.0.1';
const port = Number(process.env.ACADEMY_PORT || 3000);
const basePath = '/nvidia-devops';
const buildDir = path.resolve('build');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.xml':'application/xml; charset=utf-8'};

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url || '/', `http://${host}`).pathname);
  if (!requestPath.startsWith(basePath)) { response.writeHead(302, {location: `${basePath}/`}); response.end(); return; }
  let relative = requestPath.slice(basePath.length).replace(/^\/+/, '');
  if (!relative) relative = 'index.html';
  else if (!path.extname(relative)) relative = `${relative}.html`;
  const file = path.resolve(buildDir, relative);
  if (!file.startsWith(`${buildDir}${path.sep}`) && file !== path.join(buildDir, 'index.html')) { response.writeHead(403); response.end('Forbidden'); return; }
  fs.stat(file, (error, stat) => {
    const target = !error && stat.isFile() ? file : path.join(buildDir, '404.html');
    response.writeHead(!error && stat.isFile() ? 200 : 404, {'content-type': types[path.extname(target)] || 'application/octet-stream'});
    fs.createReadStream(target).pipe(response);
  });
});

server.listen(port, host, () => console.log(`Academy build available at http://${host}:${port}${basePath}/`));
