import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import path from 'node:path';
import { createAuth } from './auth.mjs';

const run = promisify(execFile);
const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 8765);
const origin = 'http://127.0.0.1:' + port;
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const reads = new Set(['catalog', 'movie', 'schedule', 'seats', 'account', 'dashboard', 'staff']);
const writes = new Set(['book', 'pay', 'cancel', 'review', 'checkin', 'refund', 'expire']);
const customerActions = new Set(['account', 'book', 'pay', 'cancel', 'review']);
const authActions = new Set(['register', 'login', 'logout']);
const auth = createAuth(execute, write);
let queue = Promise.resolve();

async function execute(action, input) {
  const { stdout } = await run('mongosh', ['mongodb://127.0.0.1:27017', '--quiet', '--file', 'bridge.js'], {
    cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, CINEPASS_REQUEST: JSON.stringify({ action, input }) },
  });
  const line = stdout.split(/\r?\n/).find(line => line.startsWith('CINEPASS:'));
  if (!line) throw new Error('Không nhận được phản hồi từ MongoDB.');
  return JSON.parse(line.slice(9));
}

function write(action, input) {
  const result = queue.then(() => execute(action, input));
  queue = result.catch(() => {});
  return result;
}

async function body(req) {
  let value = '';
  for await (const chunk of req.setEncoding('utf8')) {
    value += chunk;
    if (value.length > 8192) throw new Error('Yêu cầu quá dài.');
  }
  return JSON.parse(value);
}

createServer(async (req, res) => {
  const send = (status, data, type = 'application/json') => {
    res.writeHead(status, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff' });
    res.end(type === 'application/json' ? JSON.stringify(data) : data);
  };
  try {
    if (req.headers.host !== '127.0.0.1:' + port) return send(403, { error: 'Dùng địa chỉ ' + origin });
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/api/')) {
      const action = url.pathname.slice(5);
      const session = auth.current(req);
      if (req.method === 'GET' && action === 'me') {
        return send(200, { data: session ? { fullName: session.fullName } : null });
      }
      const validWrite = req.method === 'POST' && req.headers.origin === origin &&
        req.headers['content-type'] === 'application/json';
      if (validWrite && authActions.has(action)) {
        return await auth.submit(action, await body(req), req, res, send);
      }
      if (customerActions.has(action) && !session) {
        return send(401, { error: 'Vui lòng đăng nhập để tiếp tục.' });
      }
      if (validWrite && writes.has(action) && action !== 'expire') {
        const result = await write(action, { ...await body(req), user: session?.userId });
        return send(result.error ? 409 : 200, result);
      }
      if (req.method === 'GET' && reads.has(action)) {
        const result = await execute(action, { ...Object.fromEntries(url.searchParams), user: session?.userId });
        return send(result.error ? 400 : 200, result);
      }
      return send(404, { error: 'Không có thao tác này.' });
    }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (req.method !== 'GET' || !/^[\w-]+\.(html|css|js)$/.test(file)) return send(404, { error: 'Không tìm thấy.' });
    return send(200, await readFile(path.join(root, 'public', file)), mime[path.extname(file)]);
  } catch (error) {
    if (error.code === 'ENOENT' && !req.url.startsWith('/api/')) return send(404, { error: 'Không tìm thấy.' });
    console.error(error.message);
    send(503, { error: 'Không xử lý được yêu cầu. Kiểm tra MongoDB và mongosh.' });
  }
}).listen(port, '127.0.0.1', () => console.log('CinePass MongoDB · ' + origin));

setInterval(() => write('expire', {}).catch(error => console.error(error.message)), 60000).unref();
