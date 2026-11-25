"use client";

import dynamic from "next/dynamic";
import { notFound } from "next/navigation";

// Dev-only: dashboard with demo data and no login, for layout checks. 404 in production.
const Inner = dynamic(() => import("./Inner"), { ssr: false });

export default function Preview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Inner />;
}
