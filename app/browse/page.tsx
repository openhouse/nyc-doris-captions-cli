import Link from 'next/link';
import { getRecentItems } from '../../lib/queries';
import { MediaBadge } from '../../components/media-badge';
import { formatItemDate, truncate } from '../../lib/format';

export const metadata = {
  title: 'Browse | NYC Collections Browser'
};

export default async function BrowsePage() {
  const items = await getRecentItems(50);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-brand">Browse recent additions</h1>
      <p className="text-sm text-slate-600">
        Showing the 50 most recently added items. Use search for the full catalogue and advanced filters.
      </p>
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
    </div>
  );
}
