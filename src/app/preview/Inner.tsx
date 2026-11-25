"use client";

import { useState } from "react";
import Dashboard from "@/components/Dashboard";
import { demoBook, type Book } from "@/lib/data";

export default function Inner() {
  const [book, setBook] = useState<Book>(() => demoBook());
  return <Dashboard book={book} setBook={(f) => setBook(f)} email="preview@local" onReset={() => {}} />;
}
