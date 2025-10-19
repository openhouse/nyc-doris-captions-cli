import { Suspense } from 'react';
import SearchForm from '../../components/search-form';
import SearchResults from '../../components/search-results';

export const metadata = {
  title: 'Search | NYC Collections Browser'
};

interface SearchPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default function SearchPage({ searchParams }: SearchPageProps) {
  const query = typeof searchParams.q === 'string' ? searchParams.q : '';

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-brand">Search the archive</h1>
      <SearchForm initialQuery={query} />
      <Suspense key={JSON.stringify(searchParams)} fallback={<p>Loading results…</p>}>
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
