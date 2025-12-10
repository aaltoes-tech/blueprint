import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  return new NextResponse(null, { status: 404 })
}

export const config = {
  matcher: '/:path*',
}

