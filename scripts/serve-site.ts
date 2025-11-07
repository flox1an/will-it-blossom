import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';

type ArgMap = Record<string, string | boolean>;

const SITE_DIR = resolve(process.cwd(), 'site');
const args = parseArgs(process.argv.slice(2));
const host = String(args.host ?? process.env.HOST ?? '127.0.0.1');
const port = Number(args.port ?? process.env.PORT ?? 4173);

if (Number.isNaN(port) || port <= 0) {
  console.error(`Invalid port "${args.port ?? process.env.PORT}". Use a positive integer.`);
  process.exit(1);
}

try {
  await access(SITE_DIR);
} catch {
  console.error('No built site found. Run "pnpm report:site" before serving the reports.');
  process.exit(1);
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const resolvedPath = resolvePath(url.pathname);

  if (!resolvedPath) {
    res.statusCode = 400;
    res.end('Invalid path');
    return;
  }

  let target = resolvedPath;
  let fileStat = await safeStat(target);

  if (fileStat?.isDirectory()) {
    target = join(target, 'index.html');
    fileStat = await safeStat(target);
  }

  if (!fileStat?.isFile()) {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  res.setHeader('Content-Type', getMimeType(target));
  res.setHeader('Cache-Control', 'no-cache');

  const stream = createReadStream(target);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.statusCode = 500;
    }
    res.end('Failed to read file');
  });

  stream.pipe(res);
});

server.listen(port, host, () => {
  console.log(`Serving site/ at http://${host}:${port}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

function resolvePath(urlPath: string) {
  const resolved = resolve(SITE_DIR, `.${urlPath}`);
  const relPath = relative(SITE_DIR, resolved);
  if (relPath.startsWith('..') || isAbsolute(relPath)) {
    return null;
  }
  return resolved;
}

async function safeStat(filePath: string) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

function getMimeType(filePath: string) {
  const ext = extname(filePath).toLowerCase();
  return (
    MIME_TYPES[ext] ??
    (ext.startsWith('.htm') ? 'text/html; charset=utf-8' : 'application/octet-stream')
  );
}

function parseArgs(argv: string[]) {
  return argv.reduce<ArgMap>((acc, arg, index) => {
    if (!arg.startsWith('--')) {
      return acc;
    }

    const [key, inlineValue] = arg.slice(2).split('=');

    if (inlineValue !== undefined) {
      acc[key] = inlineValue;
      return acc;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      acc[key] = next;
    } else {
      acc[key] = true;
    }

    return acc;
  }, {});
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};
