import Link from 'next/link';
import DatabaseErrorNotice from '../../components/database-error-notice';
import { isDatabaseUnavailableError, type DatabaseUnavailableError } from '../../lib/db';
import { getRecentItems, getItemCount, type ItemRecord } from '../../lib/queries';
import { MediaBadge } from '../../components/media-badge';
import { formatItemDate, truncate } from '../../lib/format';

export const metadata = {
  title: 'Browse | NYC Collections Browser'
};

export default async function BrowsePage() {
  let items: ItemRecord[] = [];
  let dbError: DatabaseUnavailableError | null = null;

  let totalItems = 0;
  try {
    [items, totalItems] = await Promise.all([getRecentItems(50), Promise.resolve().then(() => getItemCount())]);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      dbError = error;
    } else {
      throw error;
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-brand">Browse recent additions</h1>
      <p className="text-sm text-slate-600">
        Showing the 50 most recently added items. Use search for the full catalogue and advanced filters.
      </p>
      {dbError ? (
        <DatabaseErrorNotice error={dbError} />
      ) : totalItems === 0 ? (
        <div
          className="rounded border border-slate-300 bg-slate-50 p-4 text-sm text-slate-700"
          role="status"
          aria-live="polite"
        >
          No items yet—run <code>pnpm harvest:preservica …</code> then <code>pnpm ingest …</code> to load the catalogue.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="rounded border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <MediaBadge mediaType={item.mediaType} />
                <span className="text-xs uppercase tracking-wide text-slate-500">{item.collection ?? 'Unfiled'}</span>
              </div>
              <h2 className="mt-2 text-xl font-semibold text-brand">
                <Link href={`/items/${item.id}`}>{item.title}</Link>
              </h2>
              <p className="text-sm text-slate-500">{formatItemDate(item.date)}</p>
              {item.description ? <p className="mt-2 text-sm text-slate-600">{truncate(item.description)}</p> : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
