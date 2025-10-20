import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MediaBadge } from '../../../components/media-badge';
import { formatItemDate } from '../../../lib/format';
import { getItemById } from '../../../lib/queries';

interface ItemPageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: ItemPageProps) {
  const item = getItemById(params.id);
  if (!item) return {};
  return { title: `${item.title} | NYC Collections Browser` };
}

export default function ItemPage({ params }: ItemPageProps) {
  const item = getItemById(params.id);
  if (!item) return notFound();

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <MediaBadge mediaType={item.mediaType} />
        <h1 className="text-3xl font-bold text-brand">{item.title}</h1>
        <p className="text-sm text-slate-600">{formatItemDate(item.date)}</p>
      </header>

      {item.sourceUrl && !item.localPath ? (
        <a
          href={item.sourceUrl}
          className="inline-flex w-fit items-center justify-center rounded bg-brand-accent px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-brand-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
          aria-label="View this item on NYC Municipal Archives (opens external site)"
        >
          View on NYC Municipal Archives
        </a>
      ) : null}

      {Boolean(item.advisory) ? (
        <div className="rounded border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900" role="note">
          Content advisory: this item may include outdated, offensive, or harmful language. Review the context before
          reuse.
        </div>
      ) : null}

      <Preview item={item} />

      <section aria-labelledby="source-panel" className="space-y-2 rounded border border-slate-200 p-4">
        <h2 id="source-panel" className="text-lg font-semibold text-brand">
          Source & rights
        </h2>
        <dl className="grid gap-2 text-sm text-slate-700">
          <div>
            <dt className="font-medium text-slate-900">Collection / series</dt>
            <dd>{item.collection ?? 'Unfiled'} {item.series ? `→ ${item.series}` : ''}</dd>
          </div>
          {item.localPath ? (
            <div>
              <dt className="font-medium text-slate-900">Repository path</dt>
              <dd className="font-mono">{item.localPath}</dd>
            </div>
          ) : (
            <div>
              <dt className="font-medium text-slate-900">Storage</dt>
              <dd>Remote item (metadata only)</dd>
            </div>
          )}
          {item.citation ? (
            <div>
              <dt className="font-medium text-slate-900">Suggested citation</dt>
              <dd>{item.citation}</dd>
            </div>
          ) : null}
          {item.sourceUrl ? (
            <div>
              <dt className="font-medium text-slate-900">Source URL</dt>
              <dd>
                <a href={item.sourceUrl} className="break-words">
                  {item.sourceUrl}
                </a>
              </dd>
            </div>
          ) : null}
          {item.rights ? (
            <div>
              <dt className="font-medium text-slate-900">Rights / usage</dt>
              <dd>{item.rights}</dd>
            </div>
          ) : null}
          <div>
            <dt className="font-medium text-slate-900">Checksum (SHA-256)</dt>
            <dd className="font-mono">{item.checksumSha256}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-900">Added</dt>
            <dd>{formatItemDate(item.addedAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-brand">Report an issue</h2>
        <p className="text-sm text-slate-600">
          Found incorrect metadata or harmful description? Use the report form to let the archivists know.
        </p>
        <Link className="mt-2 inline-flex w-fit rounded bg-brand-accent px-4 py-2 text-sm font-semibold text-white" href={`/report?item=${encodeURIComponent(item.id)}`}>
          Report an issue
        </Link>
      </section>
    </article>
  );
}

function Preview({ item }: { item: ReturnType<typeof getItemById> extends infer T ? (T extends undefined ? never : T) : never }) {
  if (!item.localPath) {
    return (
      <section className="space-y-3" aria-labelledby="preview">
        <h2 id="preview" className="text-lg font-semibold text-brand">
          Metadata preview
        </h2>
        <p className="text-sm text-slate-700">
          We do not host this media locally. Use the “View on NYC Municipal Archives” button to access the original item.
        </p>
        {item.description ? (
          <p className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">{item.description}</p>
        ) : null}
        {item.transcriptText ? (
          <div className="space-y-2">
            <h3 className="text-md font-semibold text-brand">Transcript</h3>
            <p className="whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
              {item.transcriptText.slice(0, 4000)}
            </p>
          </div>
        ) : null}
      </section>
    );
  }

  switch (item.mediaType) {
    case 'text':
      return (
        <section className="space-y-2" aria-labelledby="preview">
          <h2 id="preview" className="text-lg font-semibold text-brand">
            Transcript
          </h2>
          <p className="whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
            {(item.transcriptText ?? item.ocrText ?? item.description ?? 'No text available').slice(0, 2000)}
          </p>
        </section>
      );
    case 'pdf':
      return (
        <section className="space-y-2" aria-labelledby="preview">
          <h2 id="preview" className="text-lg font-semibold text-brand">
            PDF preview
          </h2>
          <iframe
            src={`/api/preview/pdf?path=${encodeURIComponent(item.localPath)}`}
            title="PDF preview"
            className="h-[600px] w-full rounded border border-slate-200"
          />
          <p className="text-sm text-slate-600">
            If the preview does not load,{' '}
            <a className="font-medium underline" href={`/api/download?path=${encodeURIComponent(item.localPath)}`}>
              download the original PDF
            </a>
            .
          </p>
        </section>
      );
    case 'image':
      return (
        <section className="space-y-2" aria-labelledby="preview">
          <h2 id="preview" className="text-lg font-semibold text-brand">
            Image preview
          </h2>
          <img
            src={`/thumbnails/${item.thumbnail ?? ''}`}
            alt={`Preview of ${item.title}`}
            className="max-h-[600px] w-full rounded border border-slate-200 object-contain"
          />
        </section>
      );
    case 'audio':
    case 'video':
      return (
        <section className="space-y-3" aria-labelledby="preview">
          <h2 id="preview" className="text-lg font-semibold text-brand">
            {item.mediaType === 'audio' ? 'Audio' : 'Video'} preview
          </h2>
          <media-controller>
            {item.mediaType === 'audio' ? (
              <audio controls src={`/media/${item.localPath}`} className="w-full" />
            ) : (
              <video controls src={`/media/${item.localPath}`} className="w-full" />
            )}
          </media-controller>
          {item.transcriptText ? (
            <div className="space-y-2">
              <h3 className="text-md font-semibold text-brand">Transcript</h3>
              <p className="whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                {item.transcriptText.slice(0, 4000)}
              </p>
            </div>
          ) : null}
        </section>
      );
    default:
      return null;
  }
}
