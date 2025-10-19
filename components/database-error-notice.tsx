import { DatabaseUnavailableError } from '../lib/db';

interface DatabaseErrorNoticeProps {
  error: DatabaseUnavailableError;
}

export default function DatabaseErrorNotice({ error }: DatabaseErrorNoticeProps) {
  return (
    <div
      role="alert"
      className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm"
    >
      <div>
        <p className="font-semibold">Database unavailable</p>
        <p className="mt-1">
          {error.message}
          {error.dbPath ? ` (Path: ${error.dbPath})` : null}
        </p>
      </div>
      {error.troubleshooting.length > 0 ? (
        <div className="space-y-1">
          <p className="font-semibold">Try the following steps:</p>
          <ol className="list-decimal space-y-1 pl-5">
            {error.troubleshooting.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {error.cause instanceof Error ? (
        <details className="rounded border border-amber-200 bg-white/60 p-3 text-xs text-amber-900">
          <summary className="cursor-pointer font-semibold">Technical details</summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs">{error.cause.message}</pre>
        </details>
      ) : null}
    </div>
  );
}
