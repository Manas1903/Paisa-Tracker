"use client";

import dynamic from "next/dynamic";

// Client-only, like the main page: it reads the auth session, device storage and the
// code from the URL, so the route prerenders as an empty shell (Cache Components).
const Landing = dynamic(() => import("./Landing"), { ssr: false });

export default function InvitePage() {
  return <Landing />;
}
