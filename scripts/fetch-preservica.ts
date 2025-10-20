#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import YAML from 'yaml';
import { PreservicaClient } from '../lib/preservica/client';
import { NormalizedPreservicaRecord, PreservicaConfig, SeedRecord } from '../lib/preservica/types';
import {
  normalizeFromApi,
  normalizeFromHtml,
  normalizePlaceholder,
  writeFrontMatter
} from '../lib/preservica/normalize';

async function main() {
  try {
    const { configPath } = parseArgs(process.argv.slice(2));
    const config = loadConfig(configPath);
    const outputRoot = path.join(process.cwd(), config.outputRoot ?? '2025-10-18');
    fs.mkdirSync(outputRoot, { recursive: true });

    const throttler = createThrottler(config.requestsPerSecond ?? 1);

    if (config.mode === 'api') {
      await runApiMode(config, outputRoot, throttler);
    } else if (config.mode === 'seed') {
      await runSeedMode(config, outputRoot, throttler);
    } else if (config.mode === 'placeholder') {
      await runPlaceholderMode(config, outputRoot);
    } else {
      throw new Error(`Unsupported mode ${config.mode}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): { configPath: string } {
  let configPath = path.join(process.cwd(), 'preservica.config.json');
  for (let i = 0; i < args.length; i += 1) {
    const current = args[i];
    if (current === '--config') {
      const next = args[i + 1];
      if (!next) {
        throw new Error('--config flag requires a path');
      }
      configPath = path.resolve(next);
      i += 1;
    }
  }
  return { configPath };
}

function loadConfig(configPath: string): PreservicaConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found at ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as PreservicaConfig;
  if (!parsed.baseUrl) {
    throw new Error('Config file must include baseUrl');
  }
  if (!parsed.mode) {
    throw new Error('Config file must include mode');
  }
  return parsed;
}

async function runApiMode(config: PreservicaConfig, outputRoot: string, throttler: () => Promise<void>) {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('API mode requires clientId and clientSecret in the config file.');
  }

  const client = new PreservicaClient(config);
  const maxItems = config.maxItems ?? 50;
  const pageSize = Math.min(25, maxItems);
  let start = 0;
  let created = 0;

  while (created < maxItems) {
    await throttler();
    const hits = await client.searchAudioVideo({ query: config.query, start, size: pageSize });
    if (hits.length === 0) break;

    for (const hit of hits) {
      if (created >= maxItems) break;
      try {
        await throttler();
        const details = await client.getObjectDetails(hit.id);
        const normalized = normalizeFromApi(details, hit);
        ensureSourceUrl(normalized, config.baseUrl);
        writeFrontMatter(normalized, outputRoot);
        created += 1;
        console.log(`Wrote ${normalized.id}`);
      } catch (error) {
        console.warn(`Failed to process ${hit.id}:`, error instanceof Error ? error.message : error);
      }
    }

    start += hits.length;
    if (hits.length < pageSize) break;
  }

  console.log(`API mode complete. Generated ${created} items.`);
}

async function runSeedMode(config: PreservicaConfig, outputRoot: string, throttler: () => Promise<void>) {
  const records = loadSeedRecords(config.seedPath);
  let created = 0;
  for (const record of records) {
    try {
      await throttler();
      const response = await fetch(record.url, {
        headers: {
          'User-Agent': config.userAgent ?? 'nyc-doris-captions-cli'
        }
      });
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }
      const html = await response.text();
      const normalized = normalizeFromHtml(html, record.url, record);
      ensureSourceUrl(normalized, config.baseUrl);
      writeFrontMatter(normalized, outputRoot);
      created += 1;
      console.log(`Wrote ${normalized.id}`);
    } catch (error) {
      console.warn(`Failed to process ${record.url}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log(`Seed mode complete. Generated ${created} items.`);
}

async function runPlaceholderMode(config: PreservicaConfig, outputRoot: string) {
  const records = loadSeedRecords(config.seedPath);
  let created = 0;
  for (const record of records) {
    const normalized = normalizePlaceholder(record);
    ensureSourceUrl(normalized, config.baseUrl);
    writeFrontMatter(normalized, outputRoot);
    created += 1;
    console.log(`Wrote ${normalized.id}`);
  }
  console.log(`Placeholder mode complete. Generated ${created} items.`);
}

function loadSeedRecords(seedPath: string | undefined): SeedRecord[] {
  const resolved = path.resolve(seedPath ?? path.join(process.cwd(), 'seed.yml'));
  if (!fs.existsSync(resolved)) {
    throw new Error(`Seed file not found at ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf-8');
  const data = YAML.parse(raw);
  if (Array.isArray(data)) {
    return data.map(coerceSeedRecord);
  }
  if (Array.isArray(data?.items)) {
    return data.items.map(coerceSeedRecord);
  }
  throw new Error('Seed file must be an array or an object with an items array.');
}

function coerceSeedRecord(value: any): SeedRecord {
  if (!value || typeof value !== 'object') {
    throw new Error('Seed entries must be objects.');
  }
  const creators = normalizeStringArray(value.creators);
  const subjects = normalizeStringArray(value.subjects);
  const advisory = typeof value.advisory === 'number' ? (value.advisory ? 1 : 0) : value.advisory === true ? 1 : 0;
  return {
    id: value.id ? String(value.id) : undefined,
    url: String(value.url),
    title: value.title ? String(value.title) : undefined,
    date: value.date ? String(value.date) : undefined,
    collection: value.collection ? String(value.collection) : undefined,
    series: value.series ? String(value.series) : undefined,
    mediaType: value.mediaType === 'video' ? 'video' : value.mediaType === 'audio' ? 'audio' : undefined,
    rights: value.rights ? String(value.rights) : undefined,
    citation: value.citation ? String(value.citation) : undefined,
    advisory,
    creators: creators ?? undefined,
    subjects: subjects ?? undefined,
    description: value.description ? String(value.description) : undefined
  };
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return null;
}

function ensureSourceUrl(record: NormalizedPreservicaRecord, baseUrl: string) {
  if (record.sourceUrl && record.sourceUrl.startsWith('http')) return;
  record.sourceUrl = new URL(record.sourceUrl || `/access/item/${record.id}`, baseUrl).toString();
}

function createThrottler(requestsPerSecond: number) {
  if (!requestsPerSecond || requestsPerSecond <= 0) {
    return async () => {};
  }
  let nextAvailable = 0;
  const interval = 1000 / requestsPerSecond;
  return async () => {
    const now = Date.now();
    if (now < nextAvailable) {
      await delay(nextAvailable - now);
    }
    nextAvailable = Math.max(now, nextAvailable) + interval;
  };
}

main();
