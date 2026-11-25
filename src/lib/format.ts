const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export const fmt = (n: number) => inr.format(Math.round(n));

/** ₹1.2Cr / ₹4.5L / ₹12.3k: Indian units for axes and tight spots. */
export function fmtShort(n: number) {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `₹${Math.round(n)}`;
}

export const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
