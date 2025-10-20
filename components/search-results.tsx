import Link from 'next/link';
import DatabaseErrorNotice from './database-error-notice';
import { isDatabaseUnavailableError, type DatabaseUnavailableError } from '../lib/db';
import { formatItemDate, truncate } from '../lib/format';
import { getCollections, getItemCount, searchItems, type SearchResult } from '../lib/queries';
import { MediaBadge } from './media-badge';
import SearchFilters from './search-filters';

interface SearchResultsProps {
  searchParams: Record<string, string | string[] | undefined>;
}

type Collections = ReturnType<typeof getCollections>;

export default async function SearchResults({ searchParams }: SearchResultsProps) {
  const query = typeof searchParams.q === 'string' ? searchParams.q : undefined;
  const mediaType = typeof searchParams.mediaType === 'string' ? searchParams.mediaType : undefined;
  const collection = typeof searchParams.collection === 'string' ? searchParams.collection : undefined;
  const sort = typeof searchParams.sort === 'string' ? (searchParams.sort as 'relevance' | 'date') : 'relevance';

  let searchResponse: { results: SearchResult[]; total: number } = { results: [], total: 0 };
  let collections: Collections = [];
  let dbError: DatabaseUnavailableError | null = null;
  let itemCount = 0;

  try {
    [searchResponse, collections, itemCount] = await Promise.all([
      searchItems({ query, mediaType, collection, sort }),
      Promise.resolve().then(() => getCollections()),
      Promise.resolve().then(() => getItemCount())
    ]);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      dbError = error;
    } else {
      throw error;
    }
  }

  if (dbError) {
    return <DatabaseErrorNotice error={dbError} />;
  }

  const { results, total } = searchResponse;

  if (itemCount === 0) {
    return (
      <div className="space-y-4">
        <div
          className="rounded border border-slate-300 bg-slate-50 p-4 text-sm text-slate-700"
          role="status"
          aria-live="polite"
        >
          No items yet—run <code>pnpm harvest:preservica …</code> then <code>pnpm ingest …</code> to load the catalogue.
        </div>
        <SearchFilters collections={collections} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
        {total} result{total === 1 ? '' : 's'}
      </div>
      <SearchFilters collections={collections} />
      {total === 0 ? (
        <p className="text-slate-600">
          No matches yet. The catalogue currently contains {itemCount} item{itemCount === 1 ? '' : 's'}. Try a different search
          term or clear filters.
        </p>
      ) : (
        <ol className="space-y-4">
          {results.map((result) => {
            const headingId = `search-result-${result.id}`;
            return (
              <li key={result.id}>
                <article
                  className="rounded-lg border border-slate-200 p-4 shadow-sm"
                  aria-labelledby={headingId}
                >
                  <div className="flex items-center justify-between gap-4">
                    <MediaBadge mediaType={result.mediaType} />
                    <p className="text-xs uppercase tracking-wide text-slate-500">{result.collection ?? 'Unfiled'}</p>
                  </div>
                  <h2 id={headingId} className="mt-2 text-xl font-semibold text-brand">
                    <Link
                      className="focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
                      href={`/items/${result.id}`}
                    >
                      {result.title}
                    </Link>
                  </h2>
                  <p className="text-sm text-slate-500">{formatItemDate(result.date)}</p>
                  {result.snippet ? (
                    <p className="mt-2 text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: result.snippet }} />
                  ) : result.description ? (
                    <p className="mt-2 text-sm text-slate-700">{truncate(result.description)}</p>
                  ) : null}
                  <div className="mt-3 text-xs text-slate-500">
                    {result.localPath ? (
                      <p>
                        Source path: <span className="font-mono">{result.localPath}</span>
                      </p>
                    ) : (
                      <p>This item is stored remotely; use the source link for access.</p>
                    )}
                    {result.sourceUrl ? (
                      <p>
                        Source URL: <a href={result.sourceUrl}>{result.sourceUrl}</a>
                      </p>
                    ) : null}
                    <p>Checksum: {result.checksumSha256.slice(0, 16)}…</p>
                  </div>
                  {Boolean(result.advisory) ? (
                    <p className="mt-3 rounded border border-amber-500 bg-amber-50 p-2 text-sm text-amber-900">
                      Content advisory: This item may include sensitive or harmful language. Please review the context before
                      sharing.
                    </p>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
