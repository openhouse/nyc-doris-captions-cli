'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';

export default function SearchForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initialQuery);

  const mediaType = params.get('mediaType') ?? '';
  const collection = params.get('collection') ?? '';
  const sort = params.get('sort') ?? 'relevance';

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const search = new URLSearchParams();
    if (value.trim().length > 0) search.set('q', value.trim());
    if (mediaType) search.set('mediaType', mediaType);
    if (collection) search.set('collection', collection);
    if (sort) search.set('sort', sort);
    router.push(`/search?${search.toString()}`);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Search the archive">
      <label className="flex flex-col gap-2 text-sm font-medium text-brand">
        <span>Search the archive</span>
        <input
          type="search"
          name="q"
          id="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="rounded border border-slate-300 px-3 py-2 text-base text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
        />
      </label>
      <button
        type="submit"
        className="w-fit rounded bg-brand-accent px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
      >
        Search
      </button>
    </form>
  );
}
