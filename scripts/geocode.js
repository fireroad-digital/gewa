/**
 * GEWA Dealer Geocoding Script
 *
 * Fetches each client's Google Sheet, geocodes any new or changed addresses
 * using Nominatim (OpenStreetMap), and writes unified JSON to data/{client}.json.
 *
 * Usage: node geocode.js [clientId]
 *   clientId — optional; if omitted, all clients are processed.
 *
 * Nominatim usage policy: max 1 request/second, must set a descriptive User-Agent.
 */

'use strict';

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const OpenLocationCode = require('open-location-code').OpenLocationCode;

const olc = new OpenLocationCode();

const NOMINATIM_DELAY_MS = 1100; // slightly over 1s to respect ToS
const USER_AGENT = 'gewa-dealer-geocoder/1.0 (tim@fireroaddigital.com)';
const DATA_DIR = path.join(__dirname, '..', 'data');
const CLIENTS_FILE = path.join(__dirname, 'clients.json');

// US state name → abbreviation lookup.
const STATE_ABBR = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC'
};

// Reverse lookup: abbreviation → full name.
const STATE_NAME = Object.fromEntries(Object.entries(STATE_ABBR).map(([k, v]) => [v, k]));

// --------------------------------------------------------------------------
// Utilities
// --------------------------------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function addressHash(str) {
  return crypto.createHash('sha256').update(str.trim().toLowerCase()).digest('hex').slice(0, 12);
}

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        ...options.headers
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
      });
    });
    req.on('error', reject);
  });
}

// --------------------------------------------------------------------------
// CSV parsing (handles quoted fields containing commas)
// --------------------------------------------------------------------------

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = parseCSVRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVRow(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }
  return { headers, rows };
}

function parseCSVRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// --------------------------------------------------------------------------
// Column value extraction using the client's column map
// --------------------------------------------------------------------------

function getCol(row, headers, colMap, key) {
  const mapping = colMap[key];
  if (mapping === undefined) return '';
  if (typeof mapping === 'number') {
    return headers[mapping] ? (row[headers[mapping]] || '') : '';
  }
  return row[mapping] || '';
}

// --------------------------------------------------------------------------
// Address construction
// --------------------------------------------------------------------------

function buildSplitAddress(row, headers, colMap) {
  const parts = [
    getCol(row, headers, colMap, 'AddressLine1'),
    getCol(row, headers, colMap, 'AddressLine2'),
  ].filter(Boolean);
  const city = getCol(row, headers, colMap, 'City');
  const state = getCol(row, headers, colMap, 'State');
  const zip = getCol(row, headers, colMap, 'ZipCode');
  let cityLine = [city, state].filter(Boolean).join(', ');
  if (zip) cityLine += ' ' + zip;
  if (cityLine) parts.push(cityLine);
  return parts.join(', ');
}

// --------------------------------------------------------------------------
// Nominatim geocoding
// --------------------------------------------------------------------------

/**
 * Detect a Google Open Location Code (Plus Code) at the start of an address.
 * Returns { shortCode, locality } or null.
 */
function detectPlusCode(address) {
  const match = address.match(/^([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})\s+(.+)$/i);
  if (!match) return null;
  return { shortCode: match[1], locality: match[2] };
}

/**
 * Query Nominatim with a structured address.
 * Returns { lat, lon, address } or null.
 */
async function nominatimStructured({ street, city, state, postalcode, country }) {
  const params = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '1' });
  if (street) params.set('street', street);
  if (city) params.set('city', city);
  if (state) params.set('state', state);
  if (postalcode) params.set('postalcode', postalcode);
  if (country) params.set('countrycodes', country.toLowerCase());

  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  try {
    const body = await fetchUrl(url);
    const results = JSON.parse(body);
    if (results.length === 0) return null;
    return {
      lat: parseFloat(results[0].lat),
      lon: parseFloat(results[0].lon),
      nominatimAddress: results[0].address
    };
  } catch (e) {
    console.warn(`  Nominatim error: ${e.message}`);
    return null;
  }
}

/**
 * Reverse-geocode a lat/lon via Nominatim.
 * Returns { lat, lon, nominatimAddress } or null.
 */
async function nominatimReverse(lat, lon) {
  const params = new URLSearchParams({ lat, lon, format: 'jsonv2', addressdetails: '1' });
  const url = `https://nominatim.openstreetmap.org/reverse?${params}`;
  try {
    const body = await fetchUrl(url);
    const result = JSON.parse(body);
    if (result.error) return null;
    return {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      nominatimAddress: result.address
    };
  } catch (e) {
    console.warn(`  Nominatim reverse error: ${e.message}`);
    return null;
  }
}

/**
 * Query Nominatim with a free-text query string.
 */
async function nominatimFreetext(query, country) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '1'
  });
  if (country) params.set('countrycodes', country.toLowerCase());

  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  try {
    const body = await fetchUrl(url);
    const results = JSON.parse(body);
    if (results.length === 0) return null;
    return {
      lat: parseFloat(results[0].lat),
      lon: parseFloat(results[0].lon),
      nominatimAddress: results[0].address
    };
  } catch (e) {
    console.warn(`  Nominatim error: ${e.message}`);
    return null;
  }
}

/**
 * Geocode an address. Handles Plus Codes, split addresses, and single addresses.
 * Returns { lat, lon, nominatimAddress, geocodeNote } or null on failure.
 */
async function geocodeAddress({ addressFormat, rawAddress, city, state, zip, country }) {
  // Check for Google Plus Code.
  const plusCode = detectPlusCode(rawAddress || '');
  if (plusCode) {
    console.log(`  Detected Plus Code: ${plusCode.shortCode} in "${plusCode.locality}"`);
    // Geocode the locality to get a reference point for code recovery.
    const ref = await nominatimFreetext(plusCode.locality, country);
    await sleep(NOMINATIM_DELAY_MS);
    if (!ref) {
      console.warn(`  Could not geocode locality "${plusCode.locality}" for Plus Code recovery.`);
      return null;
    }
    try {
      const fullCode = olc.recoverNearest(plusCode.shortCode, ref.lat, ref.lon);
      const decoded = olc.decode(fullCode);
      const lat = decoded.latitudeCenter;
      const lon = decoded.longitudeCenter;
      await sleep(NOMINATIM_DELAY_MS);
      const rev = await nominatimReverse(lat, lon);
      return {
        lat,
        lon,
        nominatimAddress: rev ? rev.nominatimAddress : ref.nominatimAddress,
        geocodeNote: 'Geocoded via Plus Code — precise'
      };
    } catch (e) {
      console.warn(`  Plus Code decode failed: ${e.message}`);
      return null;
    }
  }

  // Split-format address: use structured Nominatim query.
  if (addressFormat === 'split') {
    const result = await nominatimStructured({ city, state, postalcode: zip, country });
    return result ? { ...result, geocodeNote: null } : null;
  }

  // Single-format address: parse street/city/state/zip from the raw string.
  // Strip suite/unit numbers from the street before the structured query —
  // Nominatim returns no results when the street field contains them.
  // Try structured first (more accurate), fall back to freetext.
  const parts = parseAddressString(rawAddress);
  let result = await nominatimStructured({
    street: stripSuiteFromStreet(parts.street),
    city: parts.city,
    state: parts.state,
    postalcode: parts.zip,
    country
  });
  if (!result) {
    await sleep(NOMINATIM_DELAY_MS);
    result = await nominatimFreetext(rawAddress, country);
  }
  return result ? { ...result, geocodeNote: null } : null;
}

/**
 * Strip suite/unit/apartment designators from a street string before
 * sending to Nominatim. Nominatim's structured search returns no results
 * when the street field contains suite numbers.
 * Examples: "411 Park Grove Dr #610" → "411 Park Grove Dr"
 *           "1350 Grant Rd Suite # 13" → "1350 Grant Rd"
 *           "74 W 68th St # 1C" → "74 W 68th St"
 */
function stripSuiteFromStreet(street) {
  return street
    .replace(/\s*(?:suite|ste\.?|apt\.?|unit|floor)\s*#?\s*[\w-]+/gi, '')
    .replace(/\s+#\s*[\w-]+/g, '')
    .trim();
}

/**
 * Naive parser for single-line US addresses like
 * "210 Yale Avenue, Swarthmore, PA 19081"
 * Returns { street, city, state, zip }.
 */
function parseAddressString(address) {
  // Split on commas.
  const parts = address.split(',').map(s => s.trim());
  if (parts.length < 2) return { street: address, city: '', state: '', zip: '' };

  const street = parts[0];
  // Last segment often contains "State Zip" or just "State".
  const last = parts[parts.length - 1].trim();
  const stateZip = last.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  let state = '', zip = '', city = '';

  if (stateZip) {
    state = stateZip[1];
    zip = stateZip[2] || '';
    city = parts.length >= 3 ? parts[parts.length - 2].trim() : '';
  } else {
    // Fall back: treat last part as city/state run-together.
    city = last;
  }

  return { street, city, state, zip };
}

// --------------------------------------------------------------------------
// State normalization from Nominatim address object
// --------------------------------------------------------------------------

function extractStateFromNominatim(nominatimAddress) {
  if (!nominatimAddress) return { state: null, stateAbb: null };
  const stateName = nominatimAddress.state || null;
  const stateAbb = nominatimAddress['ISO3166-2-lvl4']
    ? nominatimAddress['ISO3166-2-lvl4'].split('-')[1]
    : (STATE_ABBR[stateName] || null);
  return { state: stateName, stateAbb };
}

// --------------------------------------------------------------------------
// Website normalization
// --------------------------------------------------------------------------

function normalizeWebsite(raw) {
  if (!raw || !raw.trim()) return [];
  // Split on whitespace (handles "url1 url2" multi-website entries).
  return raw.trim().split(/\s+/).filter(Boolean);
}

// --------------------------------------------------------------------------
// Main processing
// --------------------------------------------------------------------------

async function processClient(client, existingData) {
  const { id, csvFile, sheetId, sheetName, country, addressFormat, columnMap } = client;

  let csvText;
  if (csvFile) {
    console.log(`[${id}] Reading local CSV: ${csvFile}`);
    try {
      csvText = fs.readFileSync(csvFile, 'utf8');
    } catch (e) {
      console.error(`[${id}] Failed to read CSV file: ${e.message}`);
      return existingData;
    }
  } else if (sheetId && sheetId !== 'TBD') {
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    console.log(`[${id}] Fetching sheet...`);
    try {
      csvText = await fetchUrl(sheetUrl);
    } catch (e) {
      console.error(`[${id}] Failed to fetch sheet: ${e.message}`);
      return existingData;
    }
  } else {
    console.log(`[${id}] No csvFile or sheetId configured — skipping.`);
    return existingData;
  }

  const { headers, rows } = parseCSV(csvText);
  console.log(`[${id}] ${rows.length} rows parsed.`);

  // Build a lookup of existing geocoded entries by address hash.
  const existingByHash = {};
  if (existingData && existingData.dealers) {
    for (const d of existingData.dealers) {
      if (d._addressHash) existingByHash[d._addressHash] = d;
    }
  }

  const dealers = [];
  let geocoded = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const name = typeof columnMap.Name === 'number'
      ? (row[headers[columnMap.Name]] || '').trim()
      : (row[columnMap.Name] || '').trim();

    if (!name) continue; // skip blank rows

    // Build the raw address string for hashing and display.
    let rawAddress, city, state, zip;
    if (addressFormat === 'split') {
      rawAddress = buildSplitAddress(row, headers, columnMap);
      city = getCol(row, headers, columnMap, 'City');
      state = getCol(row, headers, columnMap, 'State');
      zip = getCol(row, headers, columnMap, 'ZipCode');
    } else {
      rawAddress = getCol(row, headers, columnMap, 'Address').trim();
      city = ''; state = ''; zip = '';
    }

    const hash = addressHash(rawAddress);

    // Determine display address components.
    let addressLine1 = rawAddress;
    let addressLine2 = '';
    if (addressFormat === 'split') {
      addressLine1 = getCol(row, headers, columnMap, 'AddressLine1');
      addressLine2 = getCol(row, headers, columnMap, 'AddressLine2');
    }

    const phone = getCol(row, headers, columnMap, 'Phone').trim();
    const websiteRaw = columnMap.Website ? getCol(row, headers, columnMap, 'Website').trim() : '';
    const websites = normalizeWebsite(websiteRaw);

    // Check if we already have geocoding for this address.
    // Bypass the cache if the source is a Plus Code but the cached AddressLine1 is still
    // the raw Plus Code — that means the reverse-geocode step hasn't run yet.
    const cached = existingByHash[hash];
    const cachedPlusCodeUnresolved = cached && detectPlusCode(rawAddress) && detectPlusCode(cached.AddressLine1 || '');
    if (cached && cached.Latitude != null && !cachedPlusCodeUnresolved) {
      dealers.push({ ...cached, Name: name, Phone: phone, Website: websites });
      skipped++;
      continue;
    }

    console.log(`  Geocoding: ${name} — ${rawAddress}`);

    const geo = await geocodeAddress({ addressFormat, rawAddress, city, state, zip, country });
    await sleep(NOMINATIM_DELAY_MS);

    let stateVal, stateAbbVal;
    if (addressFormat === 'split') {
      // State column may contain full name ("Alabama") or abbreviation ("AL").
      if (STATE_ABBR[state]) {
        stateVal = state;
        stateAbbVal = STATE_ABBR[state];
      } else if (STATE_NAME[state]) {
        stateAbbVal = state;
        stateVal = STATE_NAME[state];
      } else {
        stateVal = state;
        stateAbbVal = state || null;
      }
    } else if (geo && geo.nominatimAddress) {
      const extracted = extractStateFromNominatim(geo.nominatimAddress);
      stateVal = extracted.state;
      stateAbbVal = extracted.stateAbb;
    } else {
      // Try to extract from address string.
      const parsed = parseAddressString(rawAddress);
      stateAbbVal = parsed.state || null;
      stateVal = STATE_NAME[stateAbbVal] || null;
    }

    // Assemble the full one-line address for the map popup / directions link.
    let fullAddress;
    const isPlusCode = !!detectPlusCode(rawAddress);
    if (addressFormat === 'split') {
      fullAddress = rawAddress;
    } else if (geo && geo.nominatimAddress) {
      const na = geo.nominatimAddress;
      if (isPlusCode && na.road) {
        const street = [na.house_number, na.road].filter(Boolean).join(' ');
        const cityPart = na.city || na.town || na.village || '';
        const parts = [street, cityPart, `${stateAbbVal || ''} ${na.postcode || ''}`.trim()].filter(Boolean);
        fullAddress = parts.join(', ');
        addressLine1 = street;
      } else {
        // Single-format: raw address already contains city/state/zip — use it as-is.
        // Nominatim is only used for lat/lng, not to reconstruct the display address.
        fullAddress = rawAddress;
      }
    } else {
      fullAddress = rawAddress;
    }

    const dealer = {
      Name: name,
      AddressLine1: addressLine1,
      AddressLine2: addressLine2 || null,
      Address: fullAddress,
      City: (addressFormat === 'split' ? city : (geo && geo.nominatimAddress ? (geo.nominatimAddress.city || geo.nominatimAddress.town || geo.nominatimAddress.village || null) : null)),
      State: stateVal,
      StateAbb: stateAbbVal,
      ZipCode: (addressFormat === 'split' ? zip : (geo && geo.nominatimAddress ? (geo.nominatimAddress.postcode || null) : null)),
      Phone: phone,
      Website: websites,
      Latitude: geo ? geo.lat : null,
      Longitude: geo ? geo.lon : null,
      _addressHash: hash
    };

    if (isPlusCode) {
      dealer.PlusCode = detectPlusCode(rawAddress).shortCode;
    }

    if (!geo) {
      dealer._geocodeFailed = true;
      dealer._geocodeNote = detectPlusCode(rawAddress)
        ? 'Plus Code locality lookup failed — requires manual geocoding'
        : 'Nominatim returned no results — requires manual geocoding';
      failed++;
      console.warn(`  FAILED: ${name}`);
    } else {
      if (geo.geocodeNote) dealer._geocodeNote = geo.geocodeNote;
      geocoded++;
    }

    dealers.push(dealer);
  }

  console.log(`[${id}] Done. Geocoded: ${geocoded}, cached: ${skipped}, failed: ${failed}.`);

  return {
    network: id,
    updatedAt: new Date().toISOString(),
    dealers
  };
}

async function main() {
  const clients = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8'));
  const targetId = process.argv[2] || null;

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  for (const client of clients) {
    if (targetId && client.id !== targetId) continue;

    const outputFile = path.join(DATA_DIR, `${client.id}.json`);
    let existingData = null;
    if (fs.existsSync(outputFile)) {
      existingData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    }

    const result = await processClient(client, existingData);
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2) + '\n');
    console.log(`[${client.id}] Written to ${outputFile}\n`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
