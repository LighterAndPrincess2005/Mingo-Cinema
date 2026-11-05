import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const ttl = 8 * 60 * 60 * 1000;
const cookieName = 'cinepass_session';

export function createAuth(execute, write) {
  const sessions = new Map();
  const attempts = [];

  function token(req) {
    return req.headers.cookie?.match(/(?:^|;\s*)cinepass_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  }

  function current(req) {
    const key = token(req);
    const entry = sessions.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry;
    if (entry) sessions.delete(key);
    return null;
  }

  function cookie(res, value, age) {
    res.setHeader('Set-Cookie', `${cookieName}=${value}; Max-Age=${age}; Path=/; HttpOnly; SameSite=Strict`);
  }

  async function submit(action, input, req, res, send) {
    if (action === 'logout') {
      sessions.delete(token(req));
      cookie(res, '', 0);
      return send(200, { data: null });
    }
    const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = input?.password;
    const register = action === 'register';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 160 ||
        typeof password !== 'string' || password.length < (register ? 8 : 1) || password.length > 128) {
      return send(400, { error: register ? 'Nhập email hợp lệ và mật khẩu từ 8 đến 128 ký tự.' : 'Nhập email và mật khẩu hợp lệ.' });
    }

    while (attempts.length && attempts[0] <= Date.now() - 60000) attempts.shift();
    if (attempts.length >= 20) return send(429, { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau một phút.' });
    attempts.push(Date.now());

    let account;
    if (register) {
      const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
      const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
      if (fullName.length < 2 || fullName.length > 100 || !/^0[0-9]{9}$/.test(phone)) {
        return send(400, { error: 'Nhập họ tên và số điện thoại 10 chữ số bắt đầu bằng 0.' });
      }
      const salt = randomBytes(16).toString('hex');
      const hash = await derive(password, salt, 64);
      const result = await write('createUser', { email, fullName, phone, passwordHash: `scrypt:${salt}:${hash.toString('hex')}` });
      if (result.error) return send(409, { error: result.error });
      account = result.data;
    } else {
      const result = await execute('findLogin', { email });
      if (result.error) throw Error(result.error);
      account = result.data;
      const stored = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(account?.passwordHash || '');
      const hash = await derive(password, stored?.[1] || '00000000000000000000000000000000', 64);
      if (!stored || !timingSafeEqual(hash, Buffer.from(stored[2], 'hex'))) {
        return send(401, { error: 'Email hoặc mật khẩu không đúng.' });
      }
    }
    const now = Date.now();
    for (const [key, entry] of sessions) if (entry.expiresAt <= now) sessions.delete(key);
    sessions.delete(token(req));
    const key = randomBytes(32).toString('hex');
    sessions.set(key, { userId: account._id.$oid, fullName: account.fullName, expiresAt: now + ttl });
    cookie(res, key, ttl / 1000);
    return send(200, { data: { fullName: account.fullName } });
  }

  return { current, submit };
}
