'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

export const metadata = {
  title: 'Report an issue | NYC Collections Browser'
};

export default function ReportPage() {
  const params = useSearchParams();
  const itemId = params.get('item') ?? '';
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData.entries()))
    });
    if (response.ok) {
      setStatus('Thanks for your report. Our archivists will review it shortly.');
      event.currentTarget.reset();
    } else {
      setStatus('Something went wrong. Please try again.');
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold text-brand">Report an issue</h1>
      <p className="text-sm text-slate-600">
        Provide context so our archivists can review and remediate any descriptive harm or metadata errors.
      </p>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2 text-sm font-medium text-brand">
          <span>Item ID</span>
          <input
            name="itemId"
            defaultValue={itemId}
            className="rounded border border-slate-300 px-3 py-2"
            required
            aria-required="true"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-brand">
          <span>Your name</span>
          <input name="name" className="rounded border border-slate-300 px-3 py-2" required aria-required="true" />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-brand">
          <span>Email</span>
          <input
            name="email"
            type="email"
            className="rounded border border-slate-300 px-3 py-2"
            required
            aria-required="true"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-brand">
          <span>Message</span>
          <textarea
            name="message"
            className="min-h-[120px] rounded border border-slate-300 px-3 py-2"
            required
            aria-required="true"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-brand-accent px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
        >
          Submit report
        </button>
      </form>
      {status ? <p role="status" className="text-sm text-slate-600">{status}</p> : null}
    </div>
  );
}
