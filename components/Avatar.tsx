import type {CSSProperties} from 'react';

export function Avatar({
  name,
  src,
  size = 40,
  priority = false,
}: {
  name: string | undefined;
  src?: string;
  size?: number;
  /**
   * `priority` marks an above-the-fold avatar that should load eagerly
   * (e.g. the manager card at the top of the draft workspace). Defaults
   * false so the default behavior for list items is lazy-loading — most
   * avatars live in rosters / search results that scroll into view.
   */
  priority?: boolean;
}) {
  const safeName = name?.trim() || '?';
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        {...(priority ? {fetchPriority: 'high' as const} : {})}
        style={imageStyle(size)}
      />
    );
  }
  return (
    <span style={initialsStyle(size, safeName)} aria-hidden>
      {initialsFor(safeName)}
    </span>
  );
}

function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function imageStyle(size: number): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
    border: '1px solid rgba(148, 163, 184, 0.2)',
  };
}

function initialsStyle(size: number, name: string): CSSProperties {
  const hue = hashHue(name);
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: `hsl(${hue}, 45%, 30%)`,
    color: `hsl(${hue}, 80%, 85%)`,
    fontSize: Math.max(11, Math.round(size * 0.38)),
    fontWeight: 700,
    letterSpacing: 0.3,
    flexShrink: 0,
    border: '1px solid rgba(148, 163, 184, 0.2)',
  };
}

function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}
