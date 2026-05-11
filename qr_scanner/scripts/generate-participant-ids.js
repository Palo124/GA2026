#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** Crockford Base32 — no I/L/O/U */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const COLUMNS = [
  'participant_ID',
  'friday_lunch',
  'friday_dinner',
  'saturday_lunch',
  'saturday_dinner',
  'sunday_lunch',
  'sunday_dinner'
];

const HEADER = COLUMNS.join(',');

function randomCrockfordString(numChars) {
  const buf = crypto.randomBytes(numChars * 2);
  let acc = 0;
  let accBits = 0;
  let bi = 0;
  let out = '';
  while (out.length < numChars) {
    while (accBits < 5 && bi < buf.length) {
      acc = (acc << 8) | buf[bi++];
      accBits += 8;
    }
    if (accBits < 5) {
      throw new Error('internal: insufficient random bytes');
    }
    accBits -= 5;
    out += CROCKFORD[(acc >> accBits) & 31];
    acc &= (1 << accBits) - 1;
  }
  return out;
}

function chunk(s, groupLen) {
  const parts = [];
  for (let i = 0; i < s.length; i += groupLen) {
    parts.push(s.slice(i, i + groupLen));
  }
  return parts.join('-');
}

function buildId(prefix, bodyChars, chunkLen, noHyphens) {
  const body = randomCrockfordString(bodyChars);
  const chunked =
    noHyphens || chunkLen >= bodyChars ? body : chunk(body, chunkLen);
  if (!prefix) return chunked;
  const p = prefix.replace(/-+$/, '');
  return p + '-' + chunked;
}

function csvEscape(field) {
  const s = String(field);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function usage() {
  console.error(`Usage: node generate-participant-ids.js --out FILE [options]

Options:
  --count N       Number of rows (default: 50)
  --out PATH      Output CSV path (required)
  --chars N       Random body length (default: 8, ~40 bits; shorter = weaker)
  --chunk N       Group size with hyphens (default: 4; ignored with --no-hyphens)
  --prefix S      Optional prefix, e.g. GA26 → GA26-7Q3P-9M2R
  --no-hyphens    Body only: no separators inside the random part (shorter, harder to read aloud)

Example:
  node generate-participant-ids.js --out ./ids.csv --count 200 --prefix GA26
  node generate-participant-ids.js --out ./compact.csv --count 50 --chars 6 --no-hyphens
`);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    usage();
    process.exit(0);
  }

  let outPath = null;
  let count = 50;
  let bodyChars = 8;
  let chunkLen = 4;
  let prefix = '';
  let noHyphens = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') outPath = argv[++i];
    else if (a === '--count') count = parseInt(argv[++i], 10);
    else if (a === '--chars') bodyChars = parseInt(argv[++i], 10);
    else if (a === '--chunk') chunkLen = parseInt(argv[++i], 10);
    else if (a === '--prefix') prefix = argv[++i] || '';
    else if (a === '--no-hyphens') noHyphens = true;
    else {
      console.error('Unknown argument:', a);
      usage();
      process.exit(1);
    }
  }

  if (!outPath) {
    console.error('Error: --out PATH is required.\n');
    usage();
    process.exit(1);
  }
  if (!Number.isFinite(count) || count < 1) {
    console.error('Error: --count must be a positive integer.');
    process.exit(1);
  }
  if (!Number.isFinite(bodyChars) || bodyChars < 4) {
    console.error('Error: --chars must be an integer >= 4.');
    process.exit(1);
  }
  if (!Number.isFinite(chunkLen) || chunkLen < 1) {
    console.error('Error: --chunk must be a positive integer.');
    process.exit(1);
  }

  const abs = path.resolve(outPath);
  const dir = path.dirname(abs);
  fs.mkdirSync(dir, { recursive: true });

  const seen = new Set();
  const stream = fs.createWriteStream(abs, { encoding: 'utf8' });
  stream.write(HEADER + '\n');

  for (let n = 0; n < count; n++) {
    let id;
    do {
      id = buildId(prefix, bodyChars, chunkLen, noHyphens);
    } while (seen.has(id));
    seen.add(id);

    const row = COLUMNS.map(function (col, i) {
      return csvEscape(i === 0 ? id : '');
    }).join(',');
    stream.write(row + '\n');
  }

  stream.end();
  console.error('Wrote', count, 'rows to', abs);
}

main();
