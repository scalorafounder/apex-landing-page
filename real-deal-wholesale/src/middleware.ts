import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          res.cookies.set({ name, value, ...options })
        },
        remove: (name: string, options: CookieOptions) => {
          res.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )
  const { data: { session } } = await sb.auth.getSession()

  const url = req.nextUrl
  const isLogin = url.pathname.startsWith('/login')

  if (!session && !isLogin) {
    const redirectUrl = url.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('next', url.pathname)
    return NextResponse.redirect(redirectUrl)
  }
  if (session && isLogin) {
    const redirectUrl = url.clone()
    redirectUrl.pathname = '/inbox'
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
