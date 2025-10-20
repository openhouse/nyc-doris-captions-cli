import { setTimeout as delay } from 'node:timers/promises';
import { PreservicaConfig, PreservicaObjectDetails, PreservicaSearchHit } from './types';

export interface PreservicaClientOptions {
  tokenEndpoint?: string;
  searchEndpoint?: string;
  objectEndpoint?: string;
  userAgent?: string;
  maxRetries?: number;
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  token_type?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number | null;
}

const DEFAULT_TOKEN_ENDPOINT = '/api/oauth/access_token';
const DEFAULT_SEARCH_ENDPOINT = '/api/content/search';
const DEFAULT_OBJECT_ENDPOINT = '/api/content/objects';

export class PreservicaClient {
  private readonly baseUrl: URL;
  private readonly config: PreservicaConfig;
  private readonly options: Required<PreservicaClientOptions>;
  private cachedToken: CachedToken | null = null;

  constructor(config: PreservicaConfig, options: PreservicaClientOptions = {}) {
    this.config = config;
    this.baseUrl = new URL(config.baseUrl);
    this.options = {
      tokenEndpoint: options.tokenEndpoint ?? DEFAULT_TOKEN_ENDPOINT,
      searchEndpoint: options.searchEndpoint ?? DEFAULT_SEARCH_ENDPOINT,
      objectEndpoint: options.objectEndpoint ?? DEFAULT_OBJECT_ENDPOINT,
      userAgent: options.userAgent ?? config.userAgent ?? 'nyc-doris-captions-cli',
      maxRetries: options.maxRetries ?? 3
    };
  }

  private buildUrl(pathname: string, query?: Record<string, string | number | undefined>) {
    const url = new URL(pathname, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url;
  }

  private async authenticate(): Promise<string> {
    if (this.cachedToken && (this.cachedToken.expiresAt === null || this.cachedToken.expiresAt > Date.now() + 60_000)) {
      return this.cachedToken.token;
    }

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('Preservica clientId and clientSecret are required for API mode.');
    }

    const url = this.buildUrl(this.options.tokenEndpoint);
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.options.userAgent
      },
      body
    });

    if (!response.ok) {
      throw new Error(`Failed to authenticate with Preservica (${response.status} ${response.statusText})`);
    }

    const json = (await response.json()) as TokenResponse;
    const expiresIn = json.expires_in ?? 0;
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;
    this.cachedToken = {
      token: json.access_token,
      expiresAt
    };
    return json.access_token;
  }

  private async authedFetch(path: string, init: RequestInit = {}, query?: Record<string, string | number | undefined>): Promise<Response> {
    const url = this.buildUrl(path, query);
    const token = await this.authenticate();

    const headers = new Headers(init.headers);
    headers.set('Preservica-Access-Token', token);
    headers.set('User-Agent', this.options.userAgent);
    headers.set('Accept', 'application/json');

    let attempt = 0;
    while (true) {
      const response = await fetch(url, {
        ...init,
        headers
      });

      if (response.status === 401 && attempt === 0) {
        this.cachedToken = null;
        attempt += 1;
        continue;
      }

      if (!response.ok && attempt < this.options.maxRetries) {
        attempt += 1;
        const wait = Math.min(2 ** attempt, 10) * 500;
        await delay(wait);
        continue;
      }

      return response;
    }
  }

  async searchAudioVideo({
    query,
    start = 0,
    size = 25
  }: {
    query?: string;
    start?: number;
    size?: number;
  }): Promise<PreservicaSearchHit[]> {
    const response = await this.authedFetch(this.options.searchEndpoint, undefined, {
      q: query ?? this.config.query ?? 'type:(audio OR video) AND visibility:public',
      start,
      size
    });

    if (!response.ok) {
      throw new Error(`Preservica search failed (${response.status})`);
    }

    const payload = (await response.json()) as any;
    const hits = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.hits)
        ? payload.hits
        : [];

    return hits
      .map((item: any): PreservicaSearchHit | null => {
        const id = item.id ?? item.reference ?? item.identifier;
        if (!id) return null;
        const title = item.title ?? item.name ?? 'Untitled';
        const description = item.description ?? item.summary ?? null;
        const date = item.date ?? item.created ?? null;
        const collection = item.collection ?? item.series ?? null;
        const sourceUrl = item.link ?? item.sourceUrl ?? new URL(`/access/${id}`, this.baseUrl).toString();
        return {
          id: String(id),
          title: String(title),
          description: description ? String(description) : null,
          date: date ? String(date) : null,
          collection: collection ? String(collection) : null,
          series: item.series ? String(item.series) : null,
          sourceUrl
        };
      })
      .filter((value): value is PreservicaSearchHit => value !== null);
  }

  async getObjectDetails(id: string): Promise<PreservicaObjectDetails> {
    const response = await this.authedFetch(`${this.options.objectEndpoint}/${encodeURIComponent(id)}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch Preservica object ${id} (${response.status})`);
    }

    const payload = (await response.json()) as any;
    const title = payload?.title ?? payload?.name ?? 'Untitled';
    const description = payload?.description ?? payload?.summary ?? null;
    const date = payload?.created ?? payload?.date ?? null;
    const creators = Array.isArray(payload?.creators)
      ? payload.creators.map((value: any) => String(value)).filter(Boolean)
      : payload?.creator
        ? [String(payload.creator)]
        : null;
    const subjects = Array.isArray(payload?.subjects)
      ? payload.subjects.map((value: any) => String(value)).filter(Boolean)
      : null;
    const rights = payload?.rights ?? payload?.accessRights ?? null;
    const citation = payload?.citation ?? null;
    const collection = payload?.collection ?? payload?.series ?? null;
    const series = payload?.series ?? null;
    const advisory = payload?.advisory ? 1 : 0;
    const mediaType = this.inferMediaType(payload);
    const sourceUrl = this.buildObjectUrl(id);

    return {
      id,
      title,
      description: description ? String(description) : null,
      date: date ? String(date) : null,
      creators,
      subjects,
      collection: collection ? String(collection) : null,
      series: series ? String(series) : null,
      rights: rights ? String(rights) : null,
      citation: citation ? String(citation) : null,
      advisory,
      mediaType,
      sourceUrl
    };
  }

  private inferMediaType(payload: any): 'audio' | 'video' {
    const media = payload?.media ?? payload?.representations ?? [];
    const candidates = Array.isArray(media) ? media : [media];

    for (const candidate of candidates) {
      const mime = candidate?.mimeType ?? candidate?.mime ?? candidate?.contentType;
      if (typeof mime === 'string') {
        if (mime.startsWith('audio')) return 'audio';
        if (mime.startsWith('video')) return 'video';
      }
      const name = candidate?.name ?? candidate?.type;
      if (typeof name === 'string') {
        const lower = name.toLowerCase();
        if (lower.includes('audio')) return 'audio';
        if (lower.includes('video')) return 'video';
      }
    }

    return 'audio';
  }

  private buildObjectUrl(id: string): string {
    if (id.startsWith('http://') || id.startsWith('https://')) {
      return id;
    }
    return new URL(`/access/item/${encodeURIComponent(id)}`, this.baseUrl).toString();
  }
}
