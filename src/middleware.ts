import { NextRequest, NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);
export default clerkMiddleware(async (auth, req: NextRequest) => {
  const { userId } = await auth();

  // A signed-in user landing on a public page is dropped into a fresh chat.
  if (userId && isPublicRoute(req)) {
    const chatId = Date.now();
    console.log("chatId", chatId);
    const newUrl = new URL(`/c/${chatId}`, req.url);
    return NextResponse.redirect(newUrl);
  }

  // Auth is optional: guests (no Clerk session) may use the app. Landing on "/"
  // starts a new guest chat session. /c/* and the sign-in/up pages stay
  // reachable without auth, so we no longer bounce guests to /sign-in.
  if (!userId && req.nextUrl.pathname === "/") {
    const chatId = Date.now();
    const newUrl = new URL(`/c/${chatId}`, req.url);
    return NextResponse.redirect(newUrl);
  }

  return NextResponse.next(); //passing the control to the next middleware
});

export const config = {
  matcher: [
    // Run on all app routes except Next.js internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes so auth() has middleware context in route handlers.
    "/(api|trpc)(.*)",
  ],
};
