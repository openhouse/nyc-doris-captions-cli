#!/usr/bin/env tsx
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import pLimit from 'p-limit';
import { fetch } from 'undici';

const USER_AGENT = 'nyc-doris-captions-cli/0.2 (+mailto:archives-tech@records.nyc.gov)';
const DEFAULT_SEEDS = path.join(process.cwd(), 'seeds', 'nycma-sample.txt');
const DEFAULT_OUTPUT = path.join(process.cwd(), 'data', 'harvest', 'preservica.jsonl');
const CACHE_DIR = path.join(process.cwd(), '.cache', 'preservica');

interface CliOptions {
  seedsPath: string;
  outputPath: string;
  concurrency: number;
  delayMs: number;
  max: number | null;
  helpRequested: boolean;
}

interface HarvestRecord {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  creators: string[] | null;
  subjects: string[] | null;
  collection: string | null;
  series: string | null;
  rights: string | null;
  sourceUrl: string;
  localPath: null;
  mediaType: 'text' | 'pdf' | 'image' | 'audio' | 'video';
  durationSec: number | null;
  thumbnail: string | null;
  transcriptText: null;
  ocrText: null;
  citation: null;
  checksumSha256: string;
  addedAt: string;
  advisory: number;
}

// Field synonyms observed on Preservica detail pages. Each array is processed case-insensitively.
const FIELD_SYNONYMS = {
  description: ['description', 'abstract', 'summary', 'notes', 'note'],
  date: ['date', 'date created', 'date published', 'temporal coverage', 'coverage dates'],
  creators: ['creator', 'creators', 'contributor', 'contributors', 'author', 'authors', 'photographer', 'director', 'producer'],
  subjects: ['subject', 'subjects', 'topic', 'topics', 'keywords', 'coverage', 'tags'],
  collection: ['collection', 'collection name', 'collection title', 'fonds', 'record group', 'source'],
  series: ['series', 'series title', 'series name', 'sub-series', 'subseries'],
  rights: ['rights', 'rights statement', 'usage', 'terms of use', 'copyright', 'license'],
  format: ['format', 'type', 'type of resource', 'resource type', 'genre', 'medium'],
  duration: ['duration', 'runtime', 'running time', 'time duration', 'extent', 'digital duration']
} as const;

function parseArgs(argv: string[]): CliOptions {
  let seedsPath: string | null = null;
  let outputPath: string | null = null;
  let concurrency = 2;
  let delayMs = 750;
  let max: number | null = null;
  let helpRequested = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--seeds':
        seedsPath = requireValue(argv, ++i, '--seeds');
        break;
      case '--out':
        outputPath = requireValue(argv, ++i, '--out');
        break;
      case '--concurrency':
        concurrency = Number(requireValue(argv, ++i, '--concurrency'));
        if (!Number.isFinite(concurrency) || concurrency <= 0) {
          throw new Error('Concurrency must be a positive number');
        }
        break;
      case '--delay-ms':
        delayMs = Number(requireValue(argv, ++i, '--delay-ms'));
        if (!Number.isFinite(delayMs) || delayMs < 0) {
          throw new Error('delay-ms must be zero or greater');
        }
        break;
      case '--max':
        max = Number(requireValue(argv, ++i, '--max'));
        if (!Number.isFinite(max) || max <= 0) {
          throw new Error('max must be a positive number');
        }
        break;
      case '--help':
      case '-h':
        helpRequested = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return {
    seedsPath: seedsPath ? resolvePath(seedsPath) : DEFAULT_SEEDS,
    outputPath: outputPath ? resolvePath(outputPath) : DEFAULT_OUTPUT,
    concurrency,
    delayMs,
    max,
    helpRequested
  };
}

function requireValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`${flag} flag requires a value`);
  }
  return value;
}

function resolvePath(candidate: string) {
  return path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate);
}

function printHelp() {
  console.log(`Usage: pnpm harvest:preservica [options]

Options:
  --seeds <file>       Path to newline-delimited list of Preservica URLs (default: ${DEFAULT_SEEDS})
  --out <file>         Output JSONL file (default: ${DEFAULT_OUTPUT})
  --concurrency <n>    Number of pages to process concurrently (default: 2)
  --delay-ms <n>       Minimum delay between requests in milliseconds (default: 750)
  --max <n>            Optional limit on number of seeds processed
  -h, --help           Show this message
`);
}

export async function main() {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    printHelp();
    process.exit(1);
    return;
  }

  if (options.helpRequested) {
    printHelp();
    process.exit(0);
  }

  const seeds = loadSeeds(options.seedsPath, options.max);
  if (seeds.length === 0) {
    console.error(`No seeds found in ${options.seedsPath}`);
    process.exit(1);
  }

  await ensureRobotsAllowed(seeds);

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const limit = pLimit(options.concurrency);
  const recordsByIndex: (HarvestRecord | null)[] = Array(seeds.length).fill(null);

  const tasks = seeds.map((seed, index) =>
    limit(async () => {
      try {
        const html = await fetchWithCache(seed, options.delayMs);
        const record = extractRecord(html, seed);
        recordsByIndex[index] = record;
        console.log({ status: 'ok', title: record.title, url: record.sourceUrl });
      } catch (error) {
        console.error({
          status: 'error',
          url: seed.toString(),
          message: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    })
  );

  const results = await Promise.allSettled(tasks);
  const failures = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
  if (failures.length > 0) {
    console.warn(`${failures.length} seed${failures.length === 1 ? '' : 's'} failed. See logs above.`);
  }

  const records: HarvestRecord[] = [];
  const recordIds = new Set<string>();
  for (const record of recordsByIndex) {
    if (!record) continue;
    if (recordIds.has(record.id)) continue;
    records.push(record);
    recordIds.add(record.id);
  }

  const stream = fs.createWriteStream(options.outputPath, { encoding: 'utf-8' });
  for (const record of records) {
    stream.write(`${JSON.stringify(record)}\n`);
  }
  stream.end();
  console.log(`Wrote ${records.length} record${records.length === 1 ? '' : 's'} to ${options.outputPath}`);
}

function loadSeeds(filePath: string, max: number | null) {
  if (!fs.existsSync(filePath)) {
    console.error(`Seeds file not found: ${filePath}`);
    process.exit(1);
  }
  const lines = fs.readFileSync(filePath, 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  const slice = max ? lines.slice(0, max) : lines;
  return slice.map((line) => new URL(line));
}

async function ensureRobotsAllowed(seeds: URL[]) {
  const robotsUrl = new URL('/robots.txt', seeds[0].origin);
  try {
    const response = await fetch(robotsUrl, {
      headers: { 'user-agent': USER_AGENT }
    });
    if (!response.ok) {
      return;
    }
    const text = await response.text();
    const rules = parseRobots(text);
    const agentRules = pickAgentRules(rules, USER_AGENT);
    if (!agentRules) {
      return;
    }
    for (const seed of seeds) {
      if (!isPathAllowed(seed.pathname, agentRules)) {
        console.error(`robots.txt at ${robotsUrl} blocks ${seed.pathname} for user-agent ${USER_AGENT}`);
        process.exit(1);
      }
    }
  } catch (error) {
    console.warn(`Could not check robots.txt (${robotsUrl}):`, error);
  }
}

interface RobotsRule {
  allow: string[];
  disallow: string[];
}

function parseRobots(content: string) {
  const rules = new Map<string, RobotsRule>();
  let currentAgents: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) {
      currentAgents = [];
      continue;
    }
    const [directiveRaw, valueRaw] = line.split(':', 2);
    if (!directiveRaw || valueRaw === undefined) continue;
    const directive = directiveRaw.trim().toLowerCase();
    const value = valueRaw.trim();
    if (directive === 'user-agent') {
      const agent = value.toLowerCase();
      currentAgents = [agent];
      if (!rules.has(agent)) {
        rules.set(agent, { allow: [], disallow: [] });
      }
    } else if (directive === 'allow' || directive === 'disallow') {
      const targets = currentAgents.length ? currentAgents : ['*'];
      for (const agent of targets) {
        if (!rules.has(agent)) {
          rules.set(agent, { allow: [], disallow: [] });
        }
        rules.get(agent)![directive === 'allow' ? 'allow' : 'disallow'].push(value);
      }
    }
  }
  return rules;
}

function pickAgentRules(rules: Map<string, RobotsRule>, agent: string) {
  const lower = agent.toLowerCase();
  return rules.get(lower) ?? rules.get('*') ?? null;
}

function isPathAllowed(pathname: string, rule: RobotsRule) {
  let decision: { allow: boolean; length: number } | null = null;
  for (const pattern of rule.disallow) {
    if (matchesPattern(pathname, pattern)) {
      const length = pattern === '*' ? Infinity : pattern.length;
      if (!decision || length > decision.length) {
        decision = { allow: false, length };
      }
    }
  }
  for (const pattern of rule.allow) {
    if (matchesPattern(pathname, pattern)) {
      const length = pattern === '*' ? Infinity : pattern.length;
      if (!decision || length >= decision.length) {
        decision = { allow: true, length };
      }
    }
  }
  return decision ? decision.allow : true;
}

function matchesPattern(pathname: string, pattern: string) {
  if (!pattern) return false;
  if (pattern === '*' || pattern === '/*') return true;
  const escaped = pattern
    .split('*')
    .map((segment) => segment.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&'))
    .join('.*');
  const regex = new RegExp(`^${escaped}`);
  return regex.test(pathname);
}

let throttleQueue: Promise<void> = Promise.resolve();
let lastRequestTime = 0;

async function fetchWithCache(url: URL, delayMs: number) {
  const cachePath = path.join(CACHE_DIR, `${hashString(url.toString())}.html`);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf-8');
  }

  await scheduleThrottle(delayMs);
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml'
    }
  });
  if (!response.ok) {
    throw new Error(`Request failed for ${url} (${response.status} ${response.statusText})`);
  }
  const body = await response.text();
  fs.writeFileSync(cachePath, body, 'utf-8');
  return body;
}

async function scheduleThrottle(delayMs: number) {
  const previous = throttleQueue;
  let release: (() => void) | null = null;
  throttleQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  const now = Date.now();
  const wait = Math.max(0, lastRequestTime + delayMs - now);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestTime = Date.now();
  release?.();
}

export function extractRecord(html: string, sourceUrl: URL): HarvestRecord {
  const $ = load(html);
  const canonical = normaliseUrl(
    $('link[rel="canonical"]').attr('href') ?? $('meta[property="og:url"]').attr('content') ?? sourceUrl.toString(),
    sourceUrl
  );
  const fieldMap = extractDefinitionList($);
  const structured = extractJsonLd($, sourceUrl);
  const title = structured.title ?? pickTitle($, fieldMap);
  const description = structured.description ?? pickField(fieldMap, FIELD_SYNONYMS.description) ?? pickMetaDescription($);
  const date = structured.date ?? pickField(fieldMap, FIELD_SYNONYMS.date);
  const creators = mergeLists(structured.creators, pickList(fieldMap, FIELD_SYNONYMS.creators));
  const subjects = mergeLists(structured.subjects, pickList(fieldMap, FIELD_SYNONYMS.subjects));
  const collection = pickField(fieldMap, FIELD_SYNONYMS.collection);
  const series = pickField(fieldMap, FIELD_SYNONYMS.series);
  const rights = pickField(fieldMap, FIELD_SYNONYMS.rights);
  const mediaHints = mergeLists(structured.mediaTypeHints, pickAll(fieldMap, FIELD_SYNONYMS.format));
  const mediaType = determineMediaType(mediaHints ?? [], structured.mediaTypeHints, $);
  const durationSec =
    structured.durationSec ??
    parseDurationToSeconds(pickField(fieldMap, FIELD_SYNONYMS.duration)) ??
    parseDurationToSeconds($('meta[property="video:duration"]').attr('content') ?? $('meta[itemprop="duration"]').attr('content')) ??
    null;
  const thumbnail = pickThumbnail($, sourceUrl, structured.thumbnail);
  const advisory = detectAdvisory([description, rights]);

  const record: HarvestRecord = {
    id: hashString(canonical).slice(0, 32),
    title,
    description,
    date,
    creators,
    subjects,
    collection,
    series,
    rights,
    sourceUrl: canonical,
    localPath: null,
    mediaType,
    durationSec,
    thumbnail,
    transcriptText: null,
    ocrText: null,
    citation: null,
    checksumSha256: hashString(canonical),
    addedAt: new Date().toISOString(),
    advisory
  };

  return record;
}

function extractDefinitionList($: CheerioAPI) {
  const map = new Map<string, string[]>();
  $('dt').each((_, dt) => {
    const keyRaw = normalizeText($(dt).text()).toLowerCase();
    if (!keyRaw) return;
    const key = keyRaw.replace(/[:]+$/, '').trim();
    const values: string[] = [];
    let sibling = $(dt).next();
    while (sibling.length && sibling.get(0)?.tagName === 'dd') {
      const text = normalizeText(sibling.text());
      if (text) values.push(text);
      sibling = sibling.next();
    }
    if (values.length) {
      map.set(key, values);
    }
  });
  return map;
}

interface JsonLdHints {
  title: string | null;
  description: string | null;
  date: string | null;
  creators: string[] | null;
  subjects: string[] | null;
  thumbnail: string | null;
  durationSec: number | null;
  mediaTypeHints: string[];
}

function extractJsonLd($: CheerioAPI, base: URL): JsonLdHints {
  const rawEntries: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const text = $(element).text();
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      rawEntries.push(parsed);
    } catch {
      return;
    }
  });

  const entries = rawEntries.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));

  let title: string | null = null;
  let description: string | null = null;
  let date: string | null = null;
  let creators: string[] | null = null;
  let subjects: string[] | null = null;
  let thumbnail: string | null = null;
  let durationSec: number | null = null;
  const mediaTypeHints: string[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const data = entry as Record<string, unknown>;
    const types = data['@type'];
    if (typeof types === 'string') {
      mediaTypeHints.push(types);
    } else if (Array.isArray(types)) {
      for (const type of types) {
        if (typeof type === 'string') {
          mediaTypeHints.push(type);
        }
      }
    }

    if (!title) {
      const candidate = data.name ?? data.headline;
      if (typeof candidate === 'string' && candidate.trim().length) {
        title = normalizeText(candidate);
      }
    }

    if (!description && typeof data.description === 'string' && data.description.trim().length) {
      description = normalizeText(data.description);
    }

    if (!date) {
      const dateCandidate = data.datePublished ?? data.dateCreated ?? data.temporalCoverage;
      if (typeof dateCandidate === 'string' && dateCandidate.trim().length) {
        date = normalizeText(dateCandidate);
      }
    }

    creators = mergeLists(creators, parseNameList(data.creator), parseNameList(data.author), parseNameList(data.contributor));
    subjects = mergeLists(subjects, parseKeywords(data.keywords), parseKeywords(data.about), parseKeywords(data.genre));

    if (!thumbnail) {
      const candidate = extractImageUrl(data.thumbnailUrl ?? data.image, base);
      if (candidate) {
        thumbnail = candidate;
      }
    }

    if (durationSec === null) {
      const durationCandidate = coerceDurationValue(data.duration ?? data.timeRequired ?? data.temporalDuration);
      const parsed = parseDurationToSeconds(durationCandidate);
      if (parsed !== null) {
        durationSec = parsed;
      }
    }

    const encodingFormat = data.encodingFormat ?? data.fileFormat ?? data.additionalType;
    if (typeof encodingFormat === 'string') {
      mediaTypeHints.push(encodingFormat);
    } else if (Array.isArray(encodingFormat)) {
      for (const value of encodingFormat) {
        if (typeof value === 'string') {
          mediaTypeHints.push(value);
        }
      }
    }
  }

  return {
    title,
    description,
    date,
    creators,
    subjects,
    thumbnail,
    durationSec,
    mediaTypeHints: Array.from(new Set(mediaTypeHints.map((value) => value.toString())))
  };
}

function pickTitle($: CheerioAPI, fieldMap: Map<string, string[]>) {
  const fieldTitle = pickField(fieldMap, ['title']);
  if (fieldTitle) return fieldTitle;
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (ogTitle) return normalizeText(ogTitle);
  const heading = $('h1').first().text();
  if (heading) return normalizeText(heading);
  return normalizeText($('title').first().text()) || 'Untitled';
}

function pickMetaDescription($: CheerioAPI) {
  const meta = $('meta[name="description"]').attr('content') ?? $('meta[property="og:description"]').attr('content');
  return meta ? normalizeText(meta) : null;
}

function pickField(map: Map<string, string[]>, keys: string[]) {
  for (const key of keys) {
    const values = map.get(key.toLowerCase());
    if (values && values.length) {
      return values[0];
    }
  }
  return null;
}

function pickAll(map: Map<string, string[]>, keys: string[]) {
  const collected: string[] = [];
  for (const key of keys) {
    const values = map.get(key.toLowerCase());
    if (values) {
      collected.push(...values);
    }
  }
  return collected;
}

function pickList(map: Map<string, string[]>, keys: string[]) {
  const values = pickAll(map, keys);
  if (values.length === 0) return null;
  const parts = values
    .flatMap((value) => value.split(/[;,\n]+/))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (parts.length === 0) return null;
  return Array.from(new Set(parts));
}

function mergeLists(...lists: Array<string[] | null | undefined>): string[] | null {
  const seen = new Set<string>();
  for (const list of lists) {
    if (!list) continue;
    for (const entry of list) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
      }
    }
  }
  return seen.size ? Array.from(seen) : null;
}

function determineMediaType(values: string[], hints: string[], $: CheerioAPI): HarvestRecord['mediaType'] {
  const candidates = [...values, ...hints];
  const metaValues = [
    $('meta[property="og:type"]').attr('content'),
    $('meta[name="twitter:card"]').attr('content'),
    $('meta[name="medium"]').attr('content'),
    $('meta[property="og:video:type"]').attr('content'),
    $('meta[property="og:audio:type"]').attr('content')
  ];
  for (const meta of metaValues) {
    if (meta) candidates.push(meta);
  }
  const normalised = candidates
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.toLowerCase());
  if (normalised.some((value) => value.includes('video') || value.includes('moving image') || value.includes('videoobject'))) {
    return 'video';
  }
  if (normalised.some((value) => value.includes('audio') || value.includes('sound') || value.includes('podcast') || value.includes('audioobject'))) {
    return 'audio';
  }
  if (normalised.some((value) => value.includes('pdf') || value.includes('application/pdf'))) {
    return 'pdf';
  }
  if (normalised.some((value) => value.includes('image') || value.includes('photograph') || value.includes('still image'))) {
    return 'image';
  }
  if (normalised.some((value) => value.includes('text') || value.includes('document') || value.includes('manuscript'))) {
    return 'text';
  }
  if ($('video').length > 0) return 'video';
  if ($('audio').length > 0) return 'audio';
  return 'text';
}

function detectAdvisory(fields: Array<string | null>) {
  const combined = fields.filter(Boolean).join(' ').toLowerCase();
  return /sensitive|harmful|offensive|explicit|warning/.test(combined) ? 1 : 0;
}

function parseNameList(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') {
    const normalised = normalizeText(value);
    return normalised ? [normalised] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(parseNameList);
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.name === 'string') {
      const normalised = normalizeText(record.name);
      return normalised ? [normalised] : [];
    }
    const given = typeof record.givenName === 'string' ? record.givenName.trim() : '';
    const family = typeof record.familyName === 'string' ? record.familyName.trim() : '';
    const combined = [given, family].filter(Boolean).join(' ');
    if (combined) {
      return [normalizeText(combined)];
    }
    if (typeof record['@value'] === 'string') {
      const normalised = normalizeText(record['@value']);
      return normalised ? [normalised] : [];
    }
  }
  return [];
}

function parseKeywords(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') {
    const text = normalizeText(value);
    if (!text) return [];
    return text.split(/[;,]+/).map((part) => part.trim()).filter((part) => part.length > 0);
  }
  if (Array.isArray(value)) {
    return value.flatMap(parseKeywords);
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.name === 'string') {
      return parseKeywords(record.name);
    }
    if (typeof record['@value'] === 'string') {
      return parseKeywords(record['@value']);
    }
  }
  return [];
}

function extractImageUrl(value: unknown, base: URL): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    return normaliseUrl(value, base);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = extractImageUrl(entry, base);
      if (result) return result;
    }
    return null;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.url === 'string') {
      return normaliseUrl(record.url, base);
    }
    if (typeof record.contentUrl === 'string') {
      return normaliseUrl(record.contentUrl, base);
    }
  }
  return null;
}

function coerceDurationValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = coerceDurationValue(entry);
      if (result) return result;
    }
    return null;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['@value'] === 'string') {
      return record['@value'];
    }
    if (typeof record.value === 'string') {
      return record.value;
    }
  }
  return null;
}

function parseDurationToSeconds(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parenMatch = trimmed.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const parsed = parseDurationToSeconds(parenMatch[1]);
    if (parsed !== null) return parsed;
  }

  const isoMatch = trimmed.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (isoMatch) {
    const hours = isoMatch[1] ? Number(isoMatch[1]) : 0;
    const minutes = isoMatch[2] ? Number(isoMatch[2]) : 0;
    const seconds = isoMatch[3] ? Number(isoMatch[3]) : 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed));
  }

  const clockMatch = trimmed.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (clockMatch) {
    const hours = clockMatch[3] ? Number(clockMatch[1]) : 0;
    const minutes = Number(clockMatch[3] ? clockMatch[2] : clockMatch[1]);
    const seconds = clockMatch[3] ? Number(clockMatch[3]) : Number(clockMatch[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }

  const pattern = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|min|m|seconds?|secs?|sec|s)/gi;
  let total = 0;
  let matched = false;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(trimmed))) {
    matched = true;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('h')) {
      total += value * 3600;
    } else if (unit.startsWith('m')) {
      total += value * 60;
    } else {
      total += value;
    }
  }
  if (matched) {
    return Math.round(total);
  }

  return null;
}

function pickThumbnail($: CheerioAPI, base: URL, structured: string | null): string | null {
  const candidates = [
    structured,
    $('meta[property="og:image"]').attr('content'),
    $('meta[property="og:image:url"]').attr('content'),
    $('meta[name="twitter:image"]').attr('content'),
    $('link[rel="image_src"]').attr('href')
  ];
  for (const candidate of candidates) {
    const normalised = normaliseMaybeUrl(candidate, base);
    if (normalised) {
      return normalised;
    }
  }
  return null;
}

function normaliseMaybeUrl(value: string | null | undefined, base: URL): string | null {
  if (!value) return null;
  try {
    return normaliseUrl(value, base);
  } catch {
    return null;
  }
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

function normaliseUrl(candidate: string, base: URL) {
  try {
    return new URL(candidate, base).toString();
  } catch {
    return base.toString();
  }
}

function hashString(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
