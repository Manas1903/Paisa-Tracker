/**
 * Friends stage 1 logic checks (invite links, display names), no browser or database.
 * Run: node --import tsx scripts/selftest-friends.ts
 */
// Invite.tsx imports social.ts → store.ts, which needs the public Supabase config at import time. Dummy values: nothing here calls the network.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test";
import("../src/components/sheets/Invite").then(({ isInviteCode, nameError, inviteText, whatsappLink, inviteRedirect }) => {

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(got));
};

// --- invite codes: 32 hex chars (uuid without dashes)
const code = "3f2a9c1e8b7d4e6fa0b1c2d3e4f5a6b7";
ok("real code accepted", isInviteCode(code));
ok("uuid with dashes rejected", !isInviteCode("3f2a9c1e-8b7d-4e6f-a0b1-c2d3e4f5a6b7"));
ok("demo link rejected", !isInviteCode("demo-link-not-real"));
ok("uppercase rejected", !isInviteCode(code.toUpperCase()));
ok("trailing junk rejected", !isInviteCode(code + "/"));
ok("empty rejected", !isInviteCode(""));

// --- sign-up email returns to the invite page only for a real code
ok("redirect keeps invite", inviteRedirect("https://x.app", code) === `https://x.app/invite/${code}`);
ok("redirect without invite", inviteRedirect("https://x.app", null) === "https://x.app");
ok("redirect ignores bad code", inviteRedirect("https://x.app", "../evil") === "https://x.app");

// --- display name: 1–40 chars after trimming
ok("blank name refused", nameError("   ") !== "");
ok("1 char ok", nameError("A") === "");
ok("40 chars ok", nameError("x".repeat(40)) === "");
ok("41 chars refused", nameError("x".repeat(41)) !== "");
ok("spaces trimmed before counting", nameError(`  ${"x".repeat(40)}  `) === "");

// --- share text
const url = `https://x.app/invite/${code}`;
const t = inviteText("Riya", url);
ok("text names inviter and link", t.startsWith("Riya invited you") && t.endsWith(url), t);
ok("WhatsApp link encodes text", whatsappLink("a & b?") === "https://wa.me/?text=a%20%26%20b%3F", whatsappLink("a & b?"));
ok("WhatsApp link round-trips url", decodeURIComponent(whatsappLink(t).split("text=")[1]) === t);

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
});
