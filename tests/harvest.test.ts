import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractRecord } from '../scripts/harvest-preservica';

const FIXTURE_PATH = path.join(process.cwd(), 'tests', 'fixtures', 'preservica-sample.html');

describe('harvest-preservica extractRecord', () => {
  it('normalises metadata, thumbnails, and durations from sample HTML', () => {
    const html = fs.readFileSync(FIXTURE_PATH, 'utf-8');
    const source = new URL('https://nycrecords.access.preservica.com/IO_SAMPLE/?view=1');
    const record = extractRecord(html, source);

    const expectedSource = 'https://nycrecords.access.preservica.com/IO_SAMPLE/';
    const expectedChecksum = crypto.createHash('sha256').update(expectedSource).digest('hex');

    expect(record.sourceUrl).toBe(expectedSource);
    expect(record.id).toBe(expectedChecksum.slice(0, 32));
    expect(record.checksumSha256).toBe(expectedChecksum);
    expect(record.title).toBe('Sample Video Object');
    expect(record.description).toBe('A sample video description from JSON-LD.');
    expect(record.date).toBe('1989-11-09');
    expect(record.creators).toEqual(['Jane Doe', 'John Roe']);
    expect(record.subjects).toEqual(['Keyword One', 'Keyword Two', 'Topic A', 'Topic B']);
    expect(record.collection).toBe('Sample Collection');
    expect(record.series).toBe('Sample Series');
    expect(record.rights).toBe('Public domain');
    expect(record.mediaType).toBe('video');
    expect(record.durationSec).toBe(205);
    expect(record.thumbnail).toBe('https://cdn.example.org/thumb-jsonld.jpg');
    expect(record.localPath).toBeNull();
    expect(record.transcriptText).toBeNull();
    expect(record.ocrText).toBeNull();
    expect(record.citation).toBeNull();
    expect(record.advisory).toBe(0);
    expect(() => new Date(record.addedAt).toISOString()).not.toThrow();
  });
});
