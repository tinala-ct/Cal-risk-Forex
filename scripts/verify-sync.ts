import assert from 'node:assert/strict';

import { createDefaultState } from '../lib/portfolio.ts';
import {
  comparePortfolioFreshness,
  portfolioFingerprint,
} from '../lib/portfolio-sync.ts';

const base = createDefaultState();
const localNewer = {
  ...base,
  revision: 3,
  updatedAt: '2026-09-01T10:00:00.000Z',
};
const cloudOlder = {
  ...base,
  revision: 2,
  updatedAt: '2026-09-01T11:00:00.000Z',
};
assert.equal(comparePortfolioFreshness(localNewer, cloudOlder), 1);
assert.equal(comparePortfolioFreshness(cloudOlder, localNewer), -1);

const sameRevisionNewerTime = {
  ...localNewer,
  updatedAt: '2026-09-01T12:00:00.000Z',
};
assert.equal(comparePortfolioFreshness(sameRevisionNewerTime, localNewer), 1);
assert.equal(comparePortfolioFreshness(localNewer, { ...localNewer }), 0);
assert.equal(portfolioFingerprint(localNewer), '2:3:2026-09-01T10:00:00.000Z');

console.log(
  'Sync checks passed: revision wins, timestamp breaks ties, equal echoes are ignored.',
);
