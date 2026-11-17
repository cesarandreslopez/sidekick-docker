// The storefront app: one program that plays every storefront service by MODE.
// It writes believable log lines for the Sidekick Docker demos:
//
// - plain text only: lines that carry their own ANSI colours skip highlighting;
// - every line starts with its level, so severity counting is unambiguous;
// - a handful of fixed message shapes with variable parts, so the Patterns tab
//   groups them into templates. The template engine groups lines by token
//   count and merges any two that agree in half their positions, so every
//   shape has a token count of its own and enough fixed words to stay apart;
// - addresses are 10.x/172.x and sizes four digits, so nothing but a real HTTP
//   status gets the status colour; every host and email is example.com;
// - errors go to stderr, which the dashboard marks with a gutter.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');

const MODE = process.env.MODE ?? 'api';

// A small seeded generator (mulberry32), seeded per container so replicas differ.
let seed = [...`${MODE}:${os.hostname()}`].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0), 7);
function rand() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[int(0, 15)]).join('');
const out = (line) => process.stdout.write(`${line}\n`);
const err = (line) => process.stderr.write(`${line}\n`);
const every = (lo, hi, fn) => {
  const tick = () => {
    fn();
    setTimeout(tick, int(lo, hi));
  };
  setTimeout(tick, int(lo, hi));
};

const PRODUCTS = ['enamel-mug', 'linen-apron', 'oak-board', 'wool-throw', 'brass-lamp', 'clay-vase'];
const CUSTOMERS = ['alex', 'sam', 'jordan', 'riley', 'casey', 'morgan'];

function api() {
  // Files tab: one added, one changed, one deleted file in the writable layer.
  try {
    fs.mkdirSync('/app/cache', { recursive: true });
    fs.writeFileSync('/app/cache/products.json', JSON.stringify(PRODUCTS));
    fs.writeFileSync('/app/config/runtime.json', '{ "currency": "EUR", "pageSize": 24, "featureFlags": { "newCheckout": true } }\n');
    fs.rmSync('/app/config/seed.sql', { force: true });
  } catch {
    /* not fatal for a demo */
  }

  const port = Number(process.env.PORT ?? 3000);
  http
    .createServer((req, res) => {
      const t0 = process.hrtime.bigint();
      const path = req.url ?? '/';
      let status = 200;
      if (path.startsWith('/api/cart') && req.method === 'POST') status = 201;
      if (path.startsWith('/api/products/') && rand() < 0.08) status = 404;
      if (path.startsWith('/api/checkout') && rand() < 0.3) status = 502;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: status < 400 }));
      const ms = Number(process.hrtime.bigint() - t0) / 1e6 + int(4, 60) + (status === 502 ? 1800 : 0);
      const line = `http ${req.method} ${path} -> ${status} in ${Math.round(ms)}ms`;
      if (status >= 500) err(`ERROR ${line} upstream=payments.example.com`);
      else if (status >= 400) out(`WARN  ${line} not found`);
      else out(`INFO  ${line}`);
    })
    .listen(port, () => {
      out(`INFO  storefront api 1.4.2 listening on :${port}`);
      out('INFO  connected to postgres at db:5432 pool=10');
      out('INFO  connected to redis at cache:6379');
    });

  every(700, 1600, () => {
    const r = rand();
    if (r < 0.3) {
      out(`{"level":"info","msg":"order created","order_id":"ord_${hex(8)}","items":${int(1, 4)},"total":"${int(12, 99)}.${int(10, 99)}","currency":"EUR"}`);
    } else if (r < 0.44) {
      out(`level=info msg="cache hit" key=product:${pick(PRODUCTS)} ttl=${int(1000, 3600)}s`);
    } else if (r < 0.56) {
      out(`level=warn msg="slow query" table=orders duration_ms=${int(1200, 2400)} rows=${int(1000, 4800)}`);
    } else if (r < 0.65) {
      out(`DEBUG pool stats active=${int(1, 9)} idle=${int(1, 9)} waiting=0`);
    } else if (r < 0.75) {
      out(`{"level":"info","msg":"customer signed in","customer":"${pick(CUSTOMERS)}@example.com","session":"${hex(12)}"}`);
    } else if (r < 0.84) {
      out(`WARN  cart ${hex(8)} abandoned after ${int(10, 59)}m customer=${pick(CUSTOMERS)}@example.com`);
    } else {
      err(`ERROR payment authorisation failed for order ord_${hex(8)}: upstream timeout from pay.example.com`);
    }
  });
}

function worker() {
  const queues = (process.env.QUEUES ?? 'emails').split(',');
  out(`INFO  worker started queues=${queues.join(',')} concurrency=4`);
  every(500, 1400, () => {
    const id = `job_${hex(8)}`;
    const q = pick(queues);
    const r = rand();
    if (r < 0.62) out(`INFO  job ${q}.${q === 'emails' ? 'send' : q === 'thumbnails' ? 'render' : 'build'} id=${id} done in ${int(40, 1900)}ms`);
    else if (r < 0.76) out(`{"level":"info","msg":"job queued","queue":"${q}","id":"${id}","depth":${int(1, 40)}}`);
    else if (r < 0.88) out(`WARN  job retry ${int(1, 4)}/5 id=${id} queue=${q} reason="smtp timeout"`);
    else if (r < 0.94) out(`DEBUG heartbeat queue=${q} lag_ms=${int(1000, 1900)}`);
    else err(`ERROR job failed id=${id} queue=${q} error="connection refused" host=smtp.example.com`);
  });
}

function payments() {
  out('INFO  payments gateway 2.1.0 starting');
  out('INFO  provider=pay.example.com region=eu-west');
  every(1200, 2600, () => {
    const r = rand();
    if (r < 0.45) out(`WARN  upstream pay.example.com slow latency_ms=${int(2100, 4800)}`);
    else if (r < 0.75) err(`ERROR charge ch_${hex(10)} failed: upstream pay.example.com timed out after 5s`);
    else out(`INFO  retrying charge ch_${hex(10)} attempt=${int(2, 3)}`);
  });
}

function reports() {
  out('INFO  reports scheduler started cron="*/15 * * * *"');
  every(3000, 6000, () => out(`INFO  report daily-sales rows=${int(1000, 9000)} took ${int(1000, 4000)}ms`));
}

function mailer() {
  out(`INFO  mailer connecting to ${process.env.SMTP_HOST ?? 'smtp.example.com'}:2525`);
  setTimeout(() => {
    err(`ERROR smtp.example.com:2525 connection refused`);
    process.exit(1);
  }, 1500);
}

function migrate() {
  out('INFO  running database migrations');
  out('INFO  applied 0006_create_orders');
  out('INFO  applied 0007_add_order_index');
  setTimeout(() => {
    err('ERROR migration 0008_backfill_totals failed: column "total_cents" does not exist');
    process.exit(3);
  }, 800);
}

function loadgen() {
  const target = process.env.TARGET ?? 'http://web';
  let sent = 0;
  let failed = 0;
  out(`INFO  loadgen targeting ${target}`);
  const paths = () => {
    const r = rand();
    if (r < 0.4) return ['GET', `/api/products?page=${int(1, 9)}`];
    if (r < 0.62) return ['GET', `/api/products/${pick(PRODUCTS)}`];
    if (r < 0.8) return ['POST', '/api/cart/items'];
    if (r < 0.9) return ['GET', '/api/cart'];
    return ['POST', '/api/checkout'];
  };
  every(250, 650, () => {
    const [method, path] = paths();
    const req = http.request(`${target}${path}`, { method, headers: { 'user-agent': 'storefront-loadgen/1.0' } }, (res) => {
      res.resume();
      sent += 1;
      if (res.statusCode >= 500) failed += 1;
    });
    req.on('error', () => {
      failed += 1;
    });
    req.end();
  });
  setInterval(() => out(`INFO  loadgen sent=${sent} failed=${failed}`), 15000);
}

function search() {
  out('INFO  search indexer idle');
  setInterval(() => {}, 1 << 30);
}

const run = { api, worker, payments, reports, mailer, migrate, loadgen, search }[MODE];
if (!run) {
  err(`ERROR unknown MODE ${MODE}`);
  process.exit(2);
}
run();
