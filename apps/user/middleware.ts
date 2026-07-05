import { NextRequest, NextResponse } from "next/server";

const REFRESH_COOKIE = "lucky_rt";

const protectedRoutes = [
  { prefix: "/v3/me", login: "/v3/login" },
  { prefix: "/v3/orders", login: "/v3/login" },
  { prefix: "/v3/inquiries", login: "/v3/login" },
  { prefix: "/me", login: "/login" },
  { prefix: "/orders", login: "/login" },
  { prefix: "/inquiries", login: "/login" },
];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const route = protectedRoutes.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!route || request.cookies.has(REFRESH_COOKIE)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = route.login;
  url.search = "";
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/me/:path*",
    "/orders/:path*",
    "/inquiries/:path*",
    "/v3/me/:path*",
    "/v3/orders/:path*",
    "/v3/inquiries/:path*",
  ],
};
