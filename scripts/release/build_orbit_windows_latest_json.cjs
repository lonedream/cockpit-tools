#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function requiredArg(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`Missing required argument --${key}`);
  }
  return value;
}

function normalizePublishedAt(raw) {
  const timestamp = Date.parse(raw || '');
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid --published-at value: ${raw}`);
  }
  return new Date(timestamp).toISOString();
}

function buildUrl(repo, version, fileName) {
  return `https://github.com/${repo}/releases/download/v${version}/${encodeURIComponent(fileName)}`;
}

function readSignature(assetsDir, assetName) {
  const signaturePath = path.join(assetsDir, `${assetName}.sig`);
  if (!fs.existsSync(signaturePath)) {
    throw new Error(`Missing signature file: ${signaturePath}`);
  }
  return fs.readFileSync(signaturePath, 'utf8').trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findAsset(files, version, pattern, label) {
  const versionPattern = new RegExp(`_${escapeRegExp(version)}_`);
  const asset = files.find((file) => versionPattern.test(file) && pattern.test(file));
  if (!asset) {
    throw new Error(`Missing ${label} asset for version ${version} matching ${pattern}`);
  }
  return asset;
}

function buildEntry(assetsDir, repo, version, assetName) {
  return {
    signature: readSignature(assetsDir, assetName),
    url: buildUrl(repo, version, assetName),
  };
}

function cloneEntry(entry) {
  return { signature: entry.signature, url: entry.url };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = requiredArg(args, 'version');
  const repo = requiredArg(args, 'repo');
  const assetsDir = requiredArg(args, 'assets-dir');
  const notesFile = requiredArg(args, 'notes-file');
  const publishedAt = normalizePublishedAt(requiredArg(args, 'published-at'));
  const output = args.output || 'latest.json';

  if (!fs.existsSync(assetsDir) || !fs.statSync(assetsDir).isDirectory()) {
    throw new Error(`Assets directory not found: ${assetsDir}`);
  }
  if (!fs.existsSync(notesFile)) {
    throw new Error(`Notes file not found: ${notesFile}`);
  }

  const files = fs
    .readdirSync(assetsDir)
    .filter((name) => fs.statSync(path.join(assetsDir, name)).isFile());

  const assets = files.filter((name) => !name.endsWith('.sig'));
  const nsis = findAsset(assets, version, /_x64-setup\.exe$/, 'windows-x86_64-nsis');
  const msi = findAsset(assets, version, /_x64_en-US\.msi$/, 'windows-x86_64-msi');

  const nsisEntry = buildEntry(assetsDir, repo, version, nsis);
  const msiEntry = buildEntry(assetsDir, repo, version, msi);

  const latest = {
    version,
    notes: fs.readFileSync(notesFile, 'utf8').trim(),
    pub_date: publishedAt,
    platforms: {
      'windows-x86_64': nsisEntry,
      'windows-x86_64-nsis': cloneEntry(nsisEntry),
      'windows-x86_64-msi': msiEntry,
    },
  };

  fs.writeFileSync(output, `${JSON.stringify(latest, null, 2)}\n`);
  console.log(`xm Windows latest.json generated at ${output}`);
}

try {
  main();
} catch (error) {
  console.error(`[build_xm_windows_latest_json] ${error.message}`);
  process.exit(1);
}
