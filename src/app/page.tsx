"use client";

import dynamic from "next/dynamic";

// Client-only: auth session, charts and the clock all live in the browser.
const App = dynamic(() => import("@/components/App"), { ssr: false });

export default function Page() {
  return <App />;
}
