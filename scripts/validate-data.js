#!/usr/bin/env node
/**
 * Validates dealer data JSON files in data/*.json.
 * Run: node scripts/validate-data.js
 * Exit code 0 = all clear, 1 = validation failures found.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── State abbreviation table ──────────────────────────────────────────────────

const STATE_MAP = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR',
  California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
  Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS',
  Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM',
  'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND',
  Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
  Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function label(dealer, index) {
  return dealer.Name ? `"${dealer.Name}"` : `dealer[${index}]`;
}

// ── Per-dealer rules ──────────────────────────────────────────────────────────

const RULES = [
  {
    id: 'name-required',
    check(d) { return d.Name && d.Name.trim() !== ''; },
    message() { return 'Missing or empty Name'; },
  },
  {
    id: 'website-is-array',
    check(d) { return Array.isArray(d.Website); },
    message(d) { return `Website is ${typeof d.Website}, expected array`; },
  },
  {
    id: 'lat-lng-both-or-neither',
    check(d) {
      const hasLat = d.Latitude != null;
      const hasLng = d.Longitude != null;
      return hasLat === hasLng;
    },
    message(d) {
      return d.Latitude == null
        ? 'Has Longitude but missing Latitude'
        : 'Has Latitude but missing Longitude';
    },
  },
  {
    id: 'lat-lng-plausible',
    check(d) {
      if (d.Latitude == null || d.Longitude == null) return true; // handled above
      return (
        d.Latitude >= -90 && d.Latitude <= 90 &&
        d.Longitude >= -180 && d.Longitude <= 180
      );
    },
    message(d) { return `Coordinates out of range: [${d.Latitude}, ${d.Longitude}]`; },
  },
  {
    id: 'state-abb-matches-state',
    check(d) {
      if (!d.State || !d.StateAbb) return true; // missing-field is a separate concern
      return STATE_MAP[d.State] === d.StateAbb;
    },
    message(d) {
      const expected = STATE_MAP[d.State];
      return expected
        ? `StateAbb "${d.StateAbb}" doesn't match State "${d.State}" (expected "${expected}")`
        : `Unknown State "${d.State}" — not in US state table`;
    },
  },
  {
    id: 'address-hash-present',
    check(d) { return typeof d._addressHash === 'string' && d._addressHash.length > 0; },
    message() { return 'Missing _addressHash'; },
  },
];

// ── Cross-dealer rules ────────────────────────────────────────────────────────

function crossChecks(dealers, filename) {
  const errors = [];

  // Duplicate _addressHash
  const hashSeen = new Map();
  dealers.forEach((d, i) => {
    if (!d._addressHash) return;
    if (hashSeen.has(d._addressHash)) {
      errors.push({
        file: filename,
        index: i,
        dealer: label(d, i),
        rule: 'unique-address-hash',
        message: `Duplicate _addressHash "${d._addressHash}" (first seen at ${label(hashSeen.get(d._addressHash), hashSeen.get(d._addressHash + '__idx'))})`,
      });
    } else {
      hashSeen.set(d._addressHash, d);
      hashSeen.set(d._addressHash + '__idx', i);
    }
  });

  // Duplicate Name+State combo
  const nameSeen = new Map();
  dealers.forEach((d, i) => {
    if (!d.Name || !d.State) return;
    const key = `${d.Name.trim().toLowerCase()}|${d.State}`;
    if (nameSeen.has(key)) {
      errors.push({
        file: filename,
        index: i,
        dealer: label(d, i),
        rule: 'unique-name-state',
        message: `Duplicate Name+State combo: "${d.Name}" in ${d.State}`,
      });
    } else {
      nameSeen.set(key, i);
    }
  });

  return errors;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const dataDir = path.join(__dirname, '..', 'data');
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

if (files.length === 0) {
  console.error('No JSON files found in data/');
  process.exit(1);
}

let totalErrors = 0;
let totalDealers = 0;
let totalFiles = 0;

for (const filename of files.sort()) {
  const filepath = path.join(dataDir, filename);
  let parsed;

  try {
    parsed = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    console.error(`[${filename}] JSON parse error: ${e.message}`);
    totalErrors++;
    continue;
  }

  if (!Array.isArray(parsed.dealers)) {
    console.error(`[${filename}] Top-level "dealers" array missing`);
    totalErrors++;
    continue;
  }

  totalFiles++;
  const { dealers, network } = parsed;
  totalDealers += dealers.length;
  const fileErrors = [];

  // Per-dealer checks
  dealers.forEach((d, i) => {
    RULES.forEach(rule => {
      if (!rule.check(d)) {
        fileErrors.push({
          file: filename,
          index: i,
          dealer: label(d, i),
          rule: rule.id,
          message: rule.message(d),
        });
      }
    });
  });

  // Cross-dealer checks
  fileErrors.push(...crossChecks(dealers, filename));

  if (fileErrors.length === 0) {
    console.log(`  [${filename}] ${dealers.length} dealers — OK`);
  } else {
    fileErrors.sort((a, b) => a.index - b.index);
    console.log(`\n  [${filename}] ${dealers.length} dealers — ${fileErrors.length} error(s):`);
    for (const err of fileErrors) {
      console.log(`    [${err.rule}] ${err.dealer}: ${err.message}`);
    }
    totalErrors += fileErrors.length;
  }
}

console.log(`\n${totalFiles} file(s), ${totalDealers} dealers checked.`);

if (totalErrors > 0) {
  console.error(`${totalErrors} validation error(s) found.`);
  process.exit(1);
} else {
  console.log('All checks passed.');
}
