'use client';

type MediaType = 'text' | 'pdf' | 'image' | 'audio' | 'video';

const COLORS: Record<MediaType, string> = {
  text: 'bg-emerald-100 text-emerald-800',
  pdf: 'bg-orange-100 text-orange-800',
  image: 'bg-sky-100 text-sky-800',
  audio: 'bg-indigo-100 text-indigo-800',
  video: 'bg-rose-100 text-rose-800'
};

const ICONS: Record<MediaType, string> = {
  text: '📝',
  pdf: '📄',
  image: '🖼️',
  audio: '🎧',
  video: '🎬'
};

export function MediaBadge({ mediaType }: { mediaType: MediaType }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-wide ${COLORS[mediaType]}`}
      aria-label={`Media type ${mediaType}`}
    >
      <span aria-hidden>{ICONS[mediaType]}</span>
      {mediaType}
    </span>
  );
}
