const test = require('node:test');
const assert = require('node:assert');
const { returnBase } = require('../src/utils/returnBase');

// A partner's first domain lives on the user row, further ones in loginDomain.
function fakePrisma({ primary = [], extra = [] } = {}) {
  return {
    user: { findUnique: async ({ where }) => (primary.includes(where.loginDomain) ? { id: 1 } : null) },
    loginDomain: { findUnique: async ({ where }) => (extra.includes(where.host) ? { id: 2 } : null) },
  };
}
const req = (headers, prisma) => ({
  prisma,
  get: (name) => headers[name.toLowerCase()],
});

const ENV = 'https://app.swordaisolutions.com';
test.beforeEach(() => { process.env.CLIENT_URL = ENV; });

test('a partner domain the user paid from is where they come back', async () => {
  const prisma = fakePrisma({ primary: ['panel.neboaiconsulting.com'] });
  assert.strictEqual(await returnBase(req({ origin: 'https://panel.neboaiconsulting.com' }, prisma)), 'https://panel.neboaiconsulting.com');
});

test('an extra domain of a partner counts too, and www is ignored', async () => {
  const prisma = fakePrisma({ extra: ['panel.neboaiconsulting.com'] });
  assert.strictEqual(await returnBase(req({ origin: 'https://www.panel.neboaiconsulting.com' }, prisma)), 'https://panel.neboaiconsulting.com');
});

test('without Origin the Referer decides', async () => {
  const prisma = fakePrisma({ primary: ['panel.neboaiconsulting.com'] });
  assert.strictEqual(await returnBase(req({ referer: 'https://panel.neboaiconsulting.com/dashboard?x=1' }, prisma)), 'https://panel.neboaiconsulting.com');
});

test('an unregistered domain never becomes a redirect target', async () => {
  const prisma = fakePrisma({ primary: ['panel.neboaiconsulting.com'] });
  assert.strictEqual(await returnBase(req({ origin: 'https://evil.example.com' }, prisma)), ENV);
});

test('plain http on a registered domain is not trusted', async () => {
  const prisma = fakePrisma({ primary: ['panel.neboaiconsulting.com'] });
  assert.strictEqual(await returnBase(req({ origin: 'http://panel.neboaiconsulting.com' }, prisma)), ENV);
});

test('the platform domain, missing or broken headers and a failing lookup fall back to CLIENT_URL', async () => {
  const roto = { user: { findUnique: async () => { throw new Error('db down'); } }, loginDomain: { findUnique: async () => null } };
  assert.strictEqual(await returnBase(req({ origin: ENV }, fakePrisma())), ENV);
  assert.strictEqual(await returnBase(req({}, fakePrisma())), ENV);
  assert.strictEqual(await returnBase(req({ origin: 'not a url' }, fakePrisma())), ENV);
  assert.strictEqual(await returnBase(req({ origin: 'https://panel.neboaiconsulting.com' }, roto)), ENV);
});

test('CLIENT_URL keeps working without a trailing slash', async () => {
  process.env.CLIENT_URL = `${ENV}/`;
  assert.strictEqual(await returnBase(req({}, fakePrisma())), ENV);
});
