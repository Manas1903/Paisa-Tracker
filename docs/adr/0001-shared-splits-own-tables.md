# Shared splits live in their own tables, not in transactions

Every table is private to one user (RLS `user_id = auth.uid()`), but a split with a linked friend must be read and edited by every participant. So shared splits move out of the per-user `transactions.split` JSON into `splits`, `split_shares` and `split_history`, readable and writable by participants only; friendships and invites get their own tables too. Each user's spending, bank and card figures are still derived in the app from their own share, and the payment method stays in the payer's own transaction, never in the shared rows.

## Considered Options

- **Copy the split into each participant's `transactions`**: rejected, because any edit by one person would have to rewrite rows another user owns, and copies drift.
- **Keep `transactions.split` JSON and open RLS on it**: rejected, because opening a user's transaction rows to friends would expose their other spending.

## Consequences

- Name-only friends stay in `transactions.split`; only splits with linked friends use the shared tables.
- `split_history` is the audit trail and the source of split updates; anyone can edit or delete, so history must never be lost.
