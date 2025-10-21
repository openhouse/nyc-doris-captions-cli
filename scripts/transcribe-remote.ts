#!/usr/bin/env tsx
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import pLimit from 'p-limit';
import { fetch } from 'undici';

const USER_AGENT = 'nyc-doris-captions-cli/0.2 (+mailto:archives-tech@records.nyc.gov)';
const CACHE_DIR = path.join(process.cwd(), '.cache', 'preservica');
const CAPTIONS_DIR = path.join(process.cwd(), 'data', 'captions');
const PUBLIC_CAPTIONS_DIR = path.join(process.cwd(), 'public', 'captions');
const STATUS_PATH_DEFAULT = path.join(process.cwd(), 'data', 'asr-status.json');
const VIDEO_URL_PATTERN = /\.(?:m3u8|mp4|m4v|mov|webm|ogv|ts)(?:\?|$)/i;
const AUDIO_URL_PATTERN = /\.(?:mp3|m4a|wav|aac|flac|oga|ogg|opus)(?:\?|$)/i;

interface CliOptions {
  sourcePath: string;
  outputPath: string;
  filter: 'video' | 'audio' | null;
  concurrency: number;
  max: number | null;
  modelPath: string;
  whisperBin: string;
  headers: string[];
  delayMs: number;
  language: string;
  statusPath: string;
  helpRequested: boolean;
}

interface HarvestSourceRecord {
  id: string;
  title: string;
  sourceUrl: string;
  mediaType?: string;
  mediaUrl?: string | null;
  transcriptText?: string | null;
  captionsVttPath?: string | null;
  captionsSrtPath?: string | null;
}

interface RecordUpdate {
  transcriptText?: string | null;
  captionsVttPath?: string | null;
  captionsSrtPath?: string | null;
  mediaType?: 'audio' | 'video';
  durationSec?: number | null;
}

interface StatusEntry {
  status: 'complete' | 'failed';
  updatedAt: string;
  error?: string;
}

interface StatusMap {
  [id: string]: StatusEntry;
}

function parseArgs(argv: string[]): CliOptions {
  let sourcePath: string | null = null;
  let outputPath: string | null = null;
  let filter: 'video' | 'audio' | null = null;
  let concurrency = 1;
  let max: number | null = null;
  let model: string | null = null;
  let whisperBin: string | null = null;
  const headers: string[] = [];
  let delayMs = 750;
  let language = 'en';
  let statusPath: string | null = null;
  let helpRequested = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--source':
        sourcePath = requireValue(argv, ++i, '--source');
        break;
      case '--out':
      case '--output':
        outputPath = requireValue(argv, ++i, '--out');
        break;
      case '--filter': {
        const value = requireValue(argv, ++i, '--filter').toLowerCase();
        if (value !== 'video' && value !== 'audio') {
          throw new Error('--filter must be "video" or "audio"');
        }
        filter = value;
        break;
      }
      case '--concurrency':
        concurrency = Number(requireValue(argv, ++i, '--concurrency'));
        if (!Number.isFinite(concurrency) || concurrency <= 0) {
          throw new Error('concurrency must be a positive number');
        }
        break;
      case '--max':
        max = Number(requireValue(argv, ++i, '--max'));
        if (!Number.isFinite(max) || max <= 0) {
          throw new Error('max must be a positive number');
        }
        break;
      case '--model':
        model = requireValue(argv, ++i, '--model');
        break;
      case '--whisper-bin':
        whisperBin = requireValue(argv, ++i, '--whisper-bin');
        break;
      case '--headers':
      case '--header': {
        const raw = requireValue(argv, ++i, arg);
        headers.push(...splitHeaderLines(raw));
        break;
      }
      case '--delay-ms':
        delayMs = Number(requireValue(argv, ++i, '--delay-ms'));
        if (!Number.isFinite(delayMs) || delayMs < 0) {
          throw new Error('delay-ms must be zero or greater');
        }
        break;
      case '--language':
        language = requireValue(argv, ++i, '--language');
        break;
      case '--status':
        statusPath = requireValue(argv, ++i, '--status');
        break;
      case '--help':
      case '-h':
        helpRequested = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!sourcePath) {
    throw new Error('--source flag is required');
  }

  const resolvedSource = resolvePath(sourcePath);
  const resolvedOutput = outputPath ? resolvePath(outputPath) : deriveOutputPath(resolvedSource);
  const resolvedStatus = statusPath ? resolvePath(statusPath) : STATUS_PATH_DEFAULT;
  const resolvedModel = resolveModelPath(model);
  const resolvedWhisperBin = resolveWhisperBin(whisperBin);

  return {
    sourcePath: resolvedSource,
    outputPath: resolvedOutput,
    filter,
    concurrency,
    max,
    modelPath: resolvedModel,
    whisperBin: resolvedWhisperBin,
    headers,
    delayMs,
    language,
    statusPath: resolvedStatus,
    helpRequested
  };
}

function splitHeaderLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
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

function deriveOutputPath(sourcePath: string) {
  if (sourcePath.endsWith('.jsonl')) {
    return sourcePath.replace(/\.jsonl$/i, '') + '+asr.jsonl';
  }
  return `${sourcePath}+asr.jsonl`;
}

function resolveModelPath(candidate: string | null) {
  const attempts = [
    candidate,
    process.env.WHISPER_MODEL,
    candidate && !candidate.endsWith('.bin') ? path.join('models', `ggml-${candidate}.bin`) : null,
    process.env.WHISPER_MODEL && !process.env.WHISPER_MODEL.endsWith('.bin')
      ? path.join('models', `ggml-${process.env.WHISPER_MODEL}.bin`)
      : null,
    path.join('models', 'ggml-small.en.bin')
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => resolvePath(value));

  for (const attempt of attempts) {
    if (fs.existsSync(attempt)) {
      return attempt;
    }
  }
  throw new Error('Could not locate a Whisper model. Provide --model or set WHISPER_MODEL to the model file.');
}

function resolveWhisperBin(candidate: string | null) {
  const attempts = [
    candidate,
    process.env.WHISPER_BIN,
    process.env.WHISPER_CPP_BIN,
    path.join('tools', 'whisper'),
    path.join('whisper.cpp', 'main')
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => resolvePath(value));

  for (const attempt of attempts) {
    if (fs.existsSync(attempt)) {
      return attempt;
    }
  }
  throw new Error('Could not locate whisper.cpp binary. Provide --whisper-bin or set WHISPER_BIN/WHISPER_CPP_BIN.');
}

function printHelp() {
  console.log(`Usage: pnpm tsx scripts/transcribe-remote.ts --source <jsonl> [options]

Options:
  --source <file>        Harvested JSONL input
  --out <file>           Output JSONL with transcripts (default: <source>+asr.jsonl)
  --filter <type>        Only process media of this type (video or audio)
  --max <n>              Process at most n items
  --concurrency <n>      Number of concurrent transcription jobs (default: 1)
  --model <name|path>    Whisper model name or path (default: models/ggml-small.en.bin)
  --whisper-bin <path>   Path to whisper.cpp binary (default: tools/whisper or whisper.cpp/main)
  --headers <line>       Additional HTTP headers (repeatable)
  --delay-ms <n>         Minimum delay between HTTP requests (default: 750)
  --language <code>      Language code for Whisper (default: en)
  --status <file>        Path to status cache (default: data/asr-status.json)
  -h, --help             Show this message
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
    return;
  }

  ensureDir(path.dirname(options.outputPath));
  ensureDir(path.dirname(options.statusPath));
  ensureDir(CAPTIONS_DIR);
  ensureDir(PUBLIC_CAPTIONS_DIR);
  ensureDir(CACHE_DIR);

  const records = loadJsonl(options.sourcePath);
  if (records.length === 0) {
    console.error(`No records found in ${options.sourcePath}`);
    process.exit(1);
  }

  const headers = ensureUserAgentHeader(options.headers);
  const headerObject = headersToObject(headers);

  const filteredRecords = records.filter((record) => {
    if (!options.filter) return true;
    if (!record.mediaType) return true;
    return record.mediaType === options.filter;
  });

  const status = loadStatus(options.statusPath);
  const statusWriter = createStatusWriter(status, options.statusPath);

  const updates = new Map<string, RecordUpdate>();

  for (const record of filteredRecords) {
    if (status[record.id]?.status === 'complete') {
      const existing = loadExistingOutputs(record.id);
      if (existing) {
        updates.set(record.id, existing);
      }
    }
  }

  const pendingRecords = filteredRecords.filter((record) => {
    if (status[record.id]?.status !== 'complete') return true;
    const existing = loadExistingOutputs(record.id);
    return !existing;
  });

  const toProcess = options.max ? pendingRecords.slice(0, options.max) : pendingRecords;
  if (toProcess.length === 0) {
    console.log('Nothing to transcribe. Existing transcripts are up to date.');
  }

  const limit = pLimit(options.concurrency);
  const tasks: Promise<void>[] = [];

  for (const record of toProcess) {
    tasks.push(
      limit(async () => {
        try {
          const update = await transcribeRecord(record, {
            ...options,
            headers,
            headerObject
          });
          if (update) {
            updates.set(record.id, update);
            await statusWriter(record.id, { status: 'complete', updatedAt: new Date().toISOString() });
          }
        } catch (error) {
          console.error('Failed to transcribe', record.sourceUrl, error);
          await statusWriter(record.id, {
            status: 'failed',
            updatedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error)
          });
        }
      })
    );
  }

  await Promise.all(tasks);
  await statusWriter.flush();

  const merged = mergeRecords(records, updates);
  writeJsonl(options.outputPath, merged);
  console.log(`Wrote ${merged.length} record${merged.length === 1 ? '' : 's'} to ${options.outputPath}`);
}

interface TranscribeContext extends CliOptions {
  headers: string[];
  headerObject: Record<string, string>;
}

async function transcribeRecord(record: HarvestSourceRecord, options: TranscribeContext): Promise<RecordUpdate | null> {
  const mediaUrl = await resolveMediaUrl(record, options, options.headerObject);
  if (!mediaUrl) {
    throw new Error(`Could not discover media stream for ${record.sourceUrl}`);
  }

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nycma-transcribe-'));
  const wavPath = path.join(tmpDir, `${record.id}.wav`);
  try {
    await runFfmpeg(mediaUrl, wavPath, options.headers);
    const durationSec = await probeDuration(wavPath);
    await runWhisper(record.id, wavPath, options);
    const update = await collectOutputs(record.id, mediaUrl, durationSec);
    return update;
  } finally {
    await cleanupTempDir(tmpDir);
  }
}

async function resolveMediaUrl(
  record: HarvestSourceRecord,
  options: CliOptions,
  headerObject: Record<string, string>
): Promise<string | null> {
  if (record.mediaUrl) {
    return record.mediaUrl;
  }

  try {
    const url = new URL(record.sourceUrl);
    const html = await fetchHtmlWithCache(url, headerObject, options.delayMs);
    const { mediaUrl } = discoverMediaFromHtml(html, url);
    return mediaUrl;
  } catch (error) {
    console.warn('Unable to fetch page for media discovery', record.sourceUrl, error);
    return null;
  }
}

async function runFfmpeg(mediaUrl: string, wavPath: string, headers: string[]) {
  const headerString = `${headers.join('\r\n')}\r\n`;
  const args = [
    '-y',
    '-loglevel',
    'error',
    '-headers',
    headerString,
    '-i',
    mediaUrl,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-acodec',
    'pcm_s16le',
    wavPath
  ];
  await runCommand('ffmpeg', args);
}

async function runWhisper(recordId: string, wavPath: string, options: CliOptions) {
  const stem = path.join(CAPTIONS_DIR, recordId);
  const args = [
    '-m',
    options.modelPath,
    '-f',
    wavPath,
    '-of',
    stem,
    '-ovtt',
    '-osrt',
    '-otxt',
    '-l',
    options.language
  ];
  await runCommand(options.whisperBin, args);
}

async function probeDuration(wavPath: string) {
  try {
    const output = await runCommandWithOutput('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      wavPath
    ]);
    const value = Number(output.trim());
    return Number.isFinite(value) ? Math.round(value) : null;
  } catch {
    return null;
  }
}

async function collectOutputs(recordId: string, mediaUrl: string, durationSec: number | null): Promise<RecordUpdate> {
  const vttPath = path.join(CAPTIONS_DIR, `${recordId}.vtt`);
  const srtPath = path.join(CAPTIONS_DIR, `${recordId}.srt`);
  const txtPath = path.join(CAPTIONS_DIR, `${recordId}.txt`);
  const publicVtt = path.join(PUBLIC_CAPTIONS_DIR, `${recordId}.vtt`);
  const publicSrt = path.join(PUBLIC_CAPTIONS_DIR, `${recordId}.srt`);

  if (!fs.existsSync(vttPath) || !fs.existsSync(txtPath)) {
    throw new Error(`Expected captions output not found for ${recordId}`);
  }

  await fs.promises.copyFile(vttPath, publicVtt);
  if (fs.existsSync(srtPath)) {
    await fs.promises.copyFile(srtPath, publicSrt);
  }

  const transcriptRaw = await fs.promises.readFile(txtPath, 'utf-8');
  const transcriptText = transcriptRaw.trim().length ? transcriptRaw.trim() : transcriptRaw;
  const resolvedType = inferMediaType(mediaUrl);

  return {
    transcriptText,
    captionsVttPath: `captions/${recordId}.vtt`,
    captionsSrtPath: fs.existsSync(srtPath) ? `captions/${recordId}.srt` : null,
    mediaType: resolvedType,
    durationSec
  };
}

async function cleanupTempDir(dir: string) {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore errors during cleanup
  }
}

async function runCommand(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

async function runCommandWithOutput(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout?.on('data', (chunk) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

function mergeRecords(records: HarvestSourceRecord[], updates: Map<string, RecordUpdate>) {
  return records.map((record) => {
    const update = updates.get(record.id);
    if (!update) {
      return record;
    }
    const merged: Record<string, unknown> = { ...record };
    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) continue;
      merged[key] = value;
    }
    return merged as HarvestSourceRecord & RecordUpdate;
  });
}

function writeJsonl(outputPath: string, records: Array<Record<string, unknown>>) {
  const stream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });
  for (const record of records) {
    stream.write(`${JSON.stringify(record)}\n`);
  }
  stream.end();
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadJsonl(filePath: string): HarvestSourceRecord[] {
  const lines = fs
    .readFileSync(filePath, 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const records: HarvestSourceRecord[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as HarvestSourceRecord;
      records.push(parsed);
    } catch (error) {
      console.warn('Skipping invalid JSONL line', error);
    }
  }
  return records;
}

function loadStatus(filePath: string): StatusMap {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as StatusMap;
    return parsed;
  } catch (error) {
    console.warn('Could not parse status file. Starting fresh.', error);
    return {};
  }
}

function createStatusWriter(status: StatusMap, filePath: string) {
  let writeQueue = Promise.resolve();
  const persist = () =>
    fs.promises.writeFile(filePath, JSON.stringify(status, null, 2), 'utf-8').catch((error) => {
      console.warn('Failed to write status file', error);
    });
  return Object.assign(
    async (id: string, entry: StatusEntry) => {
      status[id] = entry;
      writeQueue = writeQueue.then(() => persist());
      await writeQueue;
    },
    {
      async flush() {
        await writeQueue;
      }
    }
  );
}

function ensureUserAgentHeader(headers: string[]) {
  const hasUa = headers.some((header) => header.toLowerCase().startsWith('user-agent:'));
  if (!hasUa) {
    return [...headers, `User-Agent: ${USER_AGENT}`];
  }
  return headers;
}

function headersToObject(headers: string[]) {
  const map: Record<string, string> = {};
  for (const header of headers) {
    const [name, ...rest] = header.split(':');
    if (!name || rest.length === 0) continue;
    map[name.trim()] = rest.join(':').trim();
  }
  return map;
}

let throttleQueue: Promise<void> = Promise.resolve();
let lastRequestTime = 0;

async function fetchHtmlWithCache(url: URL, headers: Record<string, string>, delayMs: number) {
  const cachePath = path.join(CACHE_DIR, `${hashString(url.toString())}.html`);
  if (fs.existsSync(cachePath)) {
    return fs.promises.readFile(cachePath, 'utf-8');
  }
  await scheduleThrottle(delayMs);
  const response = await fetch(url, {
    headers: {
      ...headers,
      'user-agent': headers['User-Agent'] ?? headers['user-agent'] ?? USER_AGENT,
      accept: 'text/html,application/xhtml+xml'
    }
  });
  if (!response.ok) {
    throw new Error(`Request failed for ${url} (${response.status} ${response.statusText})`);
  }
  const body = await response.text();
  await fs.promises.writeFile(cachePath, body, 'utf-8');
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

function hashString(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function loadExistingOutputs(recordId: string): RecordUpdate | null {
  const txtPath = path.join(CAPTIONS_DIR, `${recordId}.txt`);
  const vttPath = path.join(CAPTIONS_DIR, `${recordId}.vtt`);
  const srtPath = path.join(CAPTIONS_DIR, `${recordId}.srt`);
  if (!fs.existsSync(txtPath) || !fs.existsSync(vttPath)) {
    return null;
  }
  const transcript = fs.readFileSync(txtPath, 'utf-8').trim();
  return {
    transcriptText: transcript,
    captionsVttPath: `captions/${recordId}.vtt`,
    captionsSrtPath: fs.existsSync(srtPath) ? `captions/${recordId}.srt` : null
  };
}

function discoverMediaFromHtml(html: string, base: URL) {
  const $ = load(html);
  const urls = new Set<string>();
  const typeHints: string[] = [];

  const addUrl = (value: string | null | undefined) => {
    if (!value) return;
    try {
      const resolved = new URL(value, base).toString();
      urls.add(resolved);
    } catch {
      // ignore invalid URLs
    }
  };

  const addTypeHint = (value: string | null | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (trimmed) typeHints.push(trimmed);
  };

  const metaSelectors = [
    'meta[property="og:video"]',
    'meta[property="og:video:url"]',
    'meta[property="og:video:secure_url"]',
    'meta[property="og:audio"]',
    'meta[property="og:audio:url"]',
    'meta[property="og:audio:secure_url"]',
    'meta[name="twitter:player:stream"]',
    'meta[name="twitter:player:stream:src"]'
  ];
  for (const selector of metaSelectors) {
    addUrl($(selector).attr('content'));
  }

  const typeMeta = [
    'meta[property="og:video:type"]',
    'meta[property="og:audio:type"]',
    'meta[name="twitter:player:stream:content_type"]'
  ];
  for (const selector of typeMeta) {
    addTypeHint($(selector).attr('content'));
  }

  $('video').each((_, element) => {
    addTypeHint('video');
    const el = $(element);
    addUrl(el.attr('src'));
    el.find('source').each((__, source) => {
      const sourceEl = $(source);
      addUrl(sourceEl.attr('src'));
      addTypeHint(sourceEl.attr('type'));
    });
  });

  $('audio').each((_, element) => {
    addTypeHint('audio');
    const el = $(element);
    addUrl(el.attr('src'));
    el.find('source').each((__, source) => {
      const sourceEl = $(source);
      addUrl(sourceEl.attr('src'));
      addTypeHint(sourceEl.attr('type'));
    });
  });

  const htmlContent = $.html();
  const urlPattern = /https?:\/\/[^"'<>\s]+?(?:m3u8|mp4|m4v|mov|webm|ogv|ts|mp3|m4a|wav|aac|flac|oga|ogg|opus)(?:\?[^"'<>\s]*)?/gi;
  let match: RegExpExecArray | null;
  while ((match = urlPattern.exec(htmlContent))) {
    addUrl(match[0]);
    if (/m3u8|mp4|m4v|mov|webm|ogv|ts/i.test(match[0])) {
      addTypeHint('video');
    } else if (/mp3|m4a|wav|aac|flac|oga|ogg|opus/i.test(match[0])) {
      addTypeHint('audio');
    }
  }

  const inferredType = inferTypeFromHints(typeHints);
  const mediaUrl = pickBestUrl(Array.from(urls), inferredType);
  return { mediaUrl, inferredType };
}

function inferTypeFromHints(hints: string[]) {
  const lower = hints.map((value) => value.toLowerCase());
  if (lower.some((value) => value.includes('audio') || value.includes('sound'))) {
    return 'audio';
  }
  if (lower.some((value) => value.includes('video') || value.includes('moving image'))) {
    return 'video';
  }
  return null;
}

function pickBestUrl(urls: string[], preferred: 'audio' | 'video' | null) {
  if (urls.length === 0) return null;
  const unique = Array.from(new Set(urls));
  const videoUrls = unique.filter((url) => VIDEO_URL_PATTERN.test(url) || url.toLowerCase().includes('.m3u8'));
  const audioUrls = unique.filter((url) => AUDIO_URL_PATTERN.test(url));
  if (preferred === 'video' && videoUrls.length) return videoUrls[0];
  if (preferred === 'audio' && audioUrls.length) return audioUrls[0];
  if (videoUrls.length) return videoUrls[0];
  if (audioUrls.length) return audioUrls[0];
  return unique[0];
}

function inferMediaType(url: string): 'audio' | 'video' {
  if (AUDIO_URL_PATTERN.test(url.toLowerCase())) {
    return 'audio';
  }
  return 'video';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
