import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE } from '@/config/site';
import { detectLocale, isLocale, splitLocale } from '@/i18n/locales';

/**
 * Every public page lives under /bn or /en. A bare URL (/, /projects …) is sent to the visitor's language:
 * remembered choice (cookie) → browser language → Bangla. Static files, /api and /admin are left alone (see matcher).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (splitLocale(pathname).locale) return NextResponse.next();
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : detectLocale(request.headers.get('accept-language'));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!api|_next|admin|.*\\..*).*)'] };
