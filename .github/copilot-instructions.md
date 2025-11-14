<!-- Repository-specific Copilot instructions for AI coding agents -->
# Copilot instructions — Inventory Management System

This file documents the immediate, concrete knowledge an AI coding agent needs to be productive editing this repo.

1) Project Overview
- **Type:** Single-page React + TypeScript app built with `vite`.
- **Source of truth:** `transactions` and `settings` persisted to `localStorage` (see `hooks/useInventory.ts`). Inventory is a derived value recalculated from transactions.
- **Core logic:** `hooks/useInventory.ts` drives app state. Calculation of material deductions for shipments lives in `utils.ts` (`calculateDeductions`). Product/formula definitions and inventory items live in `constants.ts` and types in `types.ts`.

2) Key files to reference
- `hooks/useInventory.ts`: main state management and persistence rules. OUT transactions store `productId` + `cartonsShipped` (details are derived at render/recalc time).
- `utils.ts`: `calculateDeductions(productId, cartonsShipped, settings)` — modify carefully; other code relies on its return shape (`TransactionDetail[]`).
- `types.ts`: canonical types (`InventoryItemId`, `Transaction`, `AppSettings`, `DeductionRule`) — update here if adding new fields.
- `components/*`: UI is split into small components (e.g., `InventoryList.tsx`, `TransactionLog.tsx`, `Header.tsx`) demonstrating patterns for props and derived rendering.
- `constants.ts`: inventory items, finished products and deduction rules. Update here when adding products or materials.
- `package.json`: dev scripts. Use `npm run dev`, `npm run build`, `npm run preview`, and `npm run deploy` (deploy uses `gh-pages`).

3) Architectural conventions and patterns
- Transactions are stored newest-first in `transactions` array. Effects reverse them to process chronologically.
- OUT transactions intentionally do NOT persist detailed deduction lines; they persist `productId` and `cartonsShipped` so calculations are dynamic and reflect current `settings`.
- Settings are merged with defaults via `mergeSettings` in `useInventory.ts` — when adding new nested settings, use the same merge strategy.
- `inventory` is derived only in a `useEffect` from `transactions` + `settings` and is not saved to `localStorage` (prevents drift).
- UI uses Tailwind-like utility classes (presently inlined) and small presentational components.

4) Developer workflows (how to run, build, debug)
- Local dev: install deps then run vite:
  - `npm install`
  - `npm run dev` (open `http://localhost:5173`)
- Build: `npm run build` (runs `tsc` then `vite build`). Preview production locally: `npm run preview`.
- Deploy: `npm run deploy` (uses `gh-pages -d dist`).
- Environment: README mentions `GEMINI_API_KEY` in `.env.local` — set only if integrating external AI services. No backend keys are required for core app behavior.

5) Editing guidelines and pitfalls
- When changing deduction logic, update `utils.ts` and ensure returned `TransactionDetail[]` items have `itemId`, `itemName` and `quantity` (quantities for OUT are negative). `TransactionLog.tsx` may call `calculateDeductions` at render time.
- If you add new `InventoryItemId` or product types, update `types.ts`, `constants.ts` and ensure `INITIAL_INVENTORY_STATE` in `constants.ts` includes initial values.
- Persisted shape: backups exported via `useInventory.exportData()` include only `transactions` and `settings`. Import expects these keys. Preserve compatibility when changing schema or provide migration logic in `useInventory.importData()`.
- Avoid persisting `inventory` directly; keep it derived to prevent inconsistencies.

6) Tests, linting, and non-obvious commands
- No tests or linters are present in this repo. Use the dev/build scripts from `package.json`.
- If adding TypeScript changes, ensure `tsc` passes (`npm run build` runs `tsc`). `tsconfig.json` uses `strict: true` — follow existing typings.

7) Examples and micro-patterns (copyable)
- Create an OUT transaction programmatically (newest-first):
  ```ts
  setTransactions(prev => [{ id: Date.now().toString(), type: 'OUT', productId: 'phsaL3Blue', cartonsShipped: 2, details: [], date: new Date().toISOString() }, ...prev]);
  ```
- Calculate deductions: follow `calculateDeductions(productId, cartonsShipped, settings)` and expect negative quantities in returned details.

8) When to ask the human
- If you need to change persistent schema (transactions/settings) that would break older backup files — ask before changing and propose a migration.
- If you intend to add a backend or external API (instead of `localStorage`) — clarify authentication and API contract first.

If anything above is unclear or you want more examples (e.g., sample transaction JSON, expected `constants.ts` shape, or migration snippet), tell me which area to expand.
