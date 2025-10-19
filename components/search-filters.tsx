'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export default function SearchFilters({
  collections
}: {
  collections: { id: string; title: string; description: string | null }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <form className="grid gap-4 border border-slate-200 p-4" aria-label="Filter search results">
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="text-xs uppercase tracking-wide text-slate-500">Media type</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="mediaType"
            value=""
            checked={!params.get('mediaType')}
            onChange={() => setParam('mediaType', '')}
          />
          Any
        </label>
        {['text', 'pdf', 'image', 'audio', 'video'].map((type) => (
          <label key={type} className="flex items-center gap-2">
            <input
              type="radio"
              name="mediaType"
              value={type}
              checked={params.get('mediaType') === type}
              onChange={() => setParam('mediaType', type)}
            />
            {type}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-2 text-sm">
        <span>Collection</span>
        <select
          value={params.get('collection') ?? ''}
          onChange={(event) => setParam('collection', event.target.value)}
          className="rounded border border-slate-300 px-2 py-1"
        >
          <option value="">Any collection</option>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.title}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-sm">
        <span>Sort by</span>
        <select
          value={params.get('sort') ?? 'relevance'}
          onChange={(event) => setParam('sort', event.target.value)}
          className="rounded border border-slate-300 px-2 py-1"
        >
          <option value="relevance">Relevance</option>
          <option value="date">Date (newest)</option>
        </select>
      </label>
    </form>
  );
}
