"use client";

import { useState } from "react";
import { markUpdatesSeen, type Social, type SplitUpdate } from "@/lib/social";
import { describeUpdate } from "@/lib/splits";
import { Modal } from "@/components/sheets/Forms";
import { errText, settleShared } from "@/components/sheets/SplitSheet";
import { fmtDate } from "@/lib/format";

/**
 * Split updates pop-up: what other people changed since I last looked, one line each, Undo on settle lines.
 * `extra` lines (e.g. friends' stats nudges) share the list. Closing marks everything seen.
 */
export function UpdatesSheet({ open, updates, extra = [], social, demo, onChange, onClose }: {
  open: boolean; updates: SplitUpdate[]; extra?: { id: string; text: string }[]; social: Social; demo?: boolean;
  onChange: (s: Social) => void; onClose: () => void;
}) {
  const [undone, setUndone] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  function close() {
    if (!demo) void markUpdatesSeen(social.me).catch(() => {}); // worst case the same lines show again next time
    onClose();
  }
  async function undo(id: number, items: Parameters<typeof settleShared>[2]) {
    setBusy(id);
    try { await settleShared(social, demo, items, onChange); setUndone((u) => ({ ...u, [id]: "Undone" })); }
    catch (e) { setUndone((u) => ({ ...u, [id]: errText(e) })); }
    finally { setBusy(null); }
  }
  return (
    <Modal open={open} onClose={close} onSubmit={close} title="While you were away" submitLabel="Got it">
      <ul className="divide-y divide-line">
        {updates.map((u) => {
          const d = describeUpdate(u, social);
          return (
            <li key={u.id} className="flex items-center gap-2 py-2.5 text-sm">
              <span className="min-w-0 flex-1"><span className="block">{d.text}</span><span className="text-[11px] text-ink3">{fmtDate(u.at)}</span></span>
              {d.undo && (undone[u.id]
                ? <span className="max-w-[45%] text-right text-[11px] text-ink3">{undone[u.id]}</span>
                : <button type="button" disabled={busy !== null} onClick={() => undo(u.id, d.undo!)} className="shrink-0 rounded-full bg-soft px-3 py-1 text-[11px] font-bold disabled:opacity-60">Undo</button>)}
            </li>
          );
        })}
        {extra.map((x) => <li key={x.id} className="py-2.5 text-sm">{x.text}</li>)}
      </ul>
    </Modal>
  );
}
