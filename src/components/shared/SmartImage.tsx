import Image from 'next/image';
import { firebaseConfig } from '@/config/firebase';
import { isBucketImage } from '@/lib/utils/images';

interface Props {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  /** Fill the (positioned) parent instead of using intrinsic dimensions. */
  fill?: boolean;
  width?: number;
  height?: number;
}

/** Optimised <Image> for our own bucket; a plain lazy <img> for anything else, so an unexpected host can never break a page. */
export function SmartImage({ src, alt, sizes, priority, className, fill, width, height }: Props) {
  const own = isBucketImage(src, firebaseConfig.storageBucket);
  if (own && fill) return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={className} />;
  if (own && width && height) return <Image src={src} alt={alt} width={width} height={height} sizes={sizes} priority={priority} className={className} />;
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={src} alt={alt} width={fill ? undefined : width} height={fill ? undefined : height} loading={priority ? 'eager' : 'lazy'} decoding="async" className={className} style={fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' } : undefined} />;
}
