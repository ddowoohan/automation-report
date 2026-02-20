co# Repository Guidelines

## Project Structure & Module Organization
- Main app code lives in `src/` (Next.js App Router).
- Routes and API handlers are in `src/app/` (e.g., `src/app/api/analyze/route.ts`, `src/app/api/load-default/route.ts`).
- UI components are in `src/components/`:
  - `src/components/ui/` for reusable primitives.
  - `src/components/dashboard/` for page-specific widgets (map, dashboard layout).
- Data logic is separated into feature modules:
  - `src/features/preprocessing/` for CSV parsing/merge rules.
  - `src/features/metrics/` for KPI and analysis calculations.
- Shared helpers and session persistence are in `src/lib/`.
- Sample/default CSV data is stored in `docs/` and loaded by `/api/load-default`.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: start local dev server.
- `npm run typecheck`: run TypeScript checks (`tsc --noEmit`).
- `npm run lint`: run Next.js ESLint checks.
- `npm run build`: production build.
- `npm run start`: run production server after build.

## Coding Style & Naming Conventions
- Language: TypeScript (`strict` mode enabled).
- Indentation: 2 spaces; prefer readable, small functions.
- Components: PascalCase file/function names (e.g., `RegionSalesMap`).
- Utility and feature files: kebab-case (e.g., `csv-schema.ts`, `session-store.ts`).
- Use path alias imports with `@/` when possible.
- Keep domain types centralized in `src/types/domain.ts`.

## Testing Guidelines
- No dedicated unit/integration test framework is configured yet.
- Minimum validation before PR:
  - `npm run typecheck`
  - `npm run lint`
  - manual verification in `npm run dev` (default data load, agency switch, map rendering, API responses).
- If you add tests, place them near the feature or in `src/__tests__/` with clear scenario-based names.

## Commit & Pull Request Guidelines
- Git history is not available in this workspace snapshot; follow Conventional Commit style:
  - `feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`.
- PRs should include:
  - concise summary of behavior changes,
  - affected paths/modules,
  - screenshots for UI updates (especially map/insight sections),
  - notes on data assumptions (CSV columns, merge keys, session behavior).

## Security & Configuration Tips
- Do not commit secrets; use `.env.local` and keep `.env.example` updated.
- Default CSVs in `docs/` may contain business data; review before sharing externally.
- Session data is persisted to `/tmp`; avoid storing sensitive fields beyond required analysis scope.
