// Test process only. Loaded explicitly with --import, never by the application.
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
const ports = (process.env.RUBIK_LOCAL_EGRESS_PORTS ?? '').split(',').map(Number);
const journal = path.resolve(process.env.RUBIK_LOCAL_EGRESS_JOURNAL ?? '');
const root = path.resolve(process.cwd(), 'test-results') + path.sep;
if (!ports.length || ports.some(p => !Number.isInteger(p) || p < 1024 || p > 65535)
    || !journal.startsWith(root) || process.env.VERCEL_ENV !== 'development')
  throw new Error('LOCAL_EGRESS_GUARD_CONFIGURATION_REJECTED');
const record = value => fs.appendFileSync(journal, value + '\n');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const input = Array.isArray(args[0]) ? args[0] : args;
  const opts = typeof input[0] === 'object' ? input[0] : { port: input[0], host: typeof input[1] === 'string' ? input[1] : 'localhost' };
  if (!opts || opts.path || !['127.0.0.1', 'localhost', '::1'].includes(opts.host ?? 'localhost') || !ports.includes(Number(opts.port))) {
    record('DENIED');
    throw new Error('LOCAL_EXTERNAL_EGRESS_BLOCKED');
  }
  record('LOOPBACK');
  return connect.apply(this, args);
};
record('READY');
