import Link from 'next/link';
import DatabaseErrorNotice from '../components/database-error-notice';
import { isDatabaseUnavailableError, type DatabaseUnavailableError } from '../lib/db';
import { getRecentItems, type ItemRecord } from '../lib/queries';
import { MediaBadge } from '../components/media-badge';
import { formatItemDate } from '../lib/format';

export default async function HomePage() {
  let items: ItemRecord[] = [];
  let dbError: DatabaseUnavailableError | null = null;

  try {
    items = await getRecentItems();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      dbError = error;
    } else {
      throw error;
    }
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold text-brand">Browse the collections</h1>
        <p className="max-w-3xl text-lg text-slate-600">
          Explore a local corpus of NYC archival materials spanning municipal archives, oral histories,
          transcripts, and research assets. Use search and filters to surface relevant items and review
          provenance, rights, and advisories in context.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="rounded border border-brand px-3 py-1 font-medium text-brand" href="/search">
            Search the archive
          </Link>
          <Link className="rounded border border-slate-300 px-3 py-1" href="/collections">
            Collections overview
          </Link>
        </div>
      </section>
      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-brand">Recently added</h2>
          <Link className="text-sm font-semibold" href="/browse">
            Browse all items
          </Link>
        </header>
        {dbError ? (
          <DatabaseErrorNotice error={dbError} />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 shadow-sm focus-within:ring-2 focus-within:ring-brand-accent"
              >
                <div className="flex items-center justify-between gap-2">
                  <MediaBadge mediaType={item.mediaType} />
                  <p className="text-xs uppercase tracking-wide text-slate-500">{item.collection ?? 'Unfiled'}</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-brand">
                    <Link href={`/items/${item.id}`} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent">
                      {item.title}
                    </Link>
                  </h3>
                  <p className="text-sm text-slate-500">{formatItemDate(item.date)}</p>
                </div>
                {item.description ? <p className="text-sm text-slate-600 line-clamp-3">{item.description}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-xl font-semibold text-brand">How we handle rights & advisories</h2>
        <p className="mt-2 text-sm text-slate-600">
          Each item consolidates provenance, citation guidance, and rights notes drawn from source files. When
          materials contain sensitive or harmful content, a visible advisory flag appears on the record. Review
          the{' '}
          <Link href="/about" className="font-semibold">
            access & content statement
          </Link>{' '}
          for our approach to reparative description.
        </p>
      </section>
    </div>
  );
}
