/** Turns a pasted video link into an embeddable, allow-listed URL (or reports it as a plain file / unsupported). */
export type VideoSource =
  | { kind: 'embed'; provider: 'youtube' | 'vimeo'; src: string }
  | { kind: 'file'; src: string }
  | null;

export function resolveVideo(raw: string): VideoSource {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = u.pathname === '/watch' ? u.searchParams.get('v') : u.pathname.startsWith('/embed/') ? u.pathname.split('/')[2] : null;
    return id && /^[\w-]{6,20}$/.test(id) ? { kind: 'embed', provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1);
    return /^[\w-]{6,20}$/.test(id) ? { kind: 'embed', provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === 'vimeo.com') {
    const id = u.pathname.split('/').filter(Boolean)[0];
    return id && /^\d{5,12}$/.test(id) ? { kind: 'embed', provider: 'vimeo', src: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (/\.(mp4|webm)(\?.*)?$/i.test(u.pathname + u.search)) return { kind: 'file', src: u.toString() };
  if (host === 'firebasestorage.googleapis.com' && /\.(mp4|webm)/i.test(u.pathname)) return { kind: 'file', src: u.toString() };
  return null;
}
