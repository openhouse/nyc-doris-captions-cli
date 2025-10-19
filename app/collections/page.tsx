import Link from 'next/link';
import { getCollections } from '../../lib/queries';

export const metadata = {
  title: 'Collections overview | NYC Collections Browser'
};

export default function CollectionsPage() {
  const collections = getCollections();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-brand">Collections overview</h1>
      <p className="text-sm text-slate-600">
        Collections group items by source program, project folder, or archival provenance.
      </p>
      <ul className="grid gap-4 md:grid-cols-2">
        {collections.map((collection) => (
          <li key={collection.id} className="rounded border border-slate-200 p-4 shadow-sm">
            <h2 className="text-xl font-semibold text-brand">{collection.title}</h2>
            {collection.description ? <p className="text-sm text-slate-600">{collection.description}</p> : null}
            <Link className="mt-2 inline-flex text-sm font-semibold" href={`/search?collection=${collection.id}`}>
              View items
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
