# Copilot / AI Agent Instructions — OTM Helper

Purpose: give an AI coding agent the minimal, repo-specific facts and patterns so it can be productive immediately.

1) Big picture
- This is a Next.js 14 TypeScript app using the `app/` directory (server components by default) and Tailwind CSS. See [README.md](README.md#L1).
- Primary UI/logic lives in `app/page.tsx` (client-heavy contacts UI). Reusable UI primitives live under `components/ui/`.

2) Data flow and storage
- Contacts are handled entirely client-side and persisted to `localStorage` under the key `contacts`. See `actions/contact-actions.ts` for the canonical CRUD stubs.
- File upload/parsing is performed in `app/page.tsx` using `xlsx` and maps sheet columns via `FIXED_COLUMNS` constants. Keep column indices in sync when changing imports/exports.
- Name detection uses a dictionary fetched from `public/name-dictionary-cleaned-suggestion.txt` via `utils/french-name-detection.ts`. Do not assume heuristics if the dictionary isn't loaded.

3) Important files to inspect when making changes
- App entry / layout: [app/layout.tsx](app/layout.tsx#L1)
- Main UI and upload logic: [app/page.tsx](app/page.tsx#L1)
- Local persistence actions: [actions/contact-actions.ts](actions/contact-actions.ts#L1)
- Name-detection util: [utils/french-name-detection.ts](utils/french-name-detection.ts#L1)
- Public dictionary resource: [public/name-dictionary-cleaned-suggestion.txt](public/name-dictionary-cleaned-suggestion.txt)
- Build config: [next.config.mjs](next.config.mjs#L1) — note `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` are enabled.

4) Project-specific conventions & gotchas
- Many UI files are small wrappers around Radix/Tailwind primitives in `components/ui/`. Prefer using those primitives when adding UI.
- Use the `use client` directive in files that use browser-only APIs (localStorage, window, file inputs, fetch to public assets). The app default is server components.
- Local persistence: modify `actions/contact-actions.ts` for shared mutations; other components update `localStorage` directly — follow existing optimistic/local patterns.
- Dictionary matching: `isPotentiallyFrench()` returns false if the dictionary hasn't loaded. If you add heuristics, do so explicitly and conservatively.

5) Build / dev / debug
- Install: `npm install` (pnpm supported; a lockfile exists).
- Dev: `npm run dev` (Next dev server). Build: `npm run build`; Start production: `npm start`.
- Lint/types: Next config ignores build-time TypeScript & ESLint errors. Be cautious: type/lint issues may exist but won't block builds by config.

6) Testing & CI
- No tests or CI configured in the repo. If you add tests, document scripts in `package.json` and avoid changing Next config behavior without explicit tests.

7) Examples of common edits
- To change upload parsing: update `FIXED_COLUMNS` and the mapping logic in `app/page.tsx` to keep UI and export/import aligned.
- To extend contact persistence: update `actions/contact-actions.ts` and ensure callers keep using the `contacts` localStorage key.
- To tweak name detection: update `utils/french-name-detection.ts` and the source file in `public/` (normalize format, one name per line).

8) When to ask the user
- If a change affects server vs client boundaries (moving code between `app/` server components and client components), confirm whether to keep code client-only (e.g., localStorage, window) or introduce an API.
- If modifying the dictionary or adding heuristics, confirm expected false-positive tolerance and update `public/name-dictionary-cleaned-suggestion.txt` accordingly.

If anything here is unclear or you want more detail about a specific subsystem (upload parsing, persistence, or UI primitives), tell me which area and I will expand or adjust these notes.
