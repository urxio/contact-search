# OTMRT Helper

This is a Next.js 14 project (app directory) for managing and verifying contacts (OTM helper).

Quick start

```bash
# Install dependencies (npm)
npm install

# Run dev server
npm run dev

# Build for production
npm run build
npm start
```

Notes
- The project uses Next.js 14, Tailwind CSS, and several Radix UI components.
- There are no required environment variables detected in the codebase.
- The project includes a `pnpm-lock.yaml` so you can use pnpm if desired.
 - You can add a new contact directly in the UI using the "Add contact" button in the Contacts view — added contacts are persisted to localStorage.
 - Keyboard shortcut: press Ctrl+J (or Cmd+J on macOS) to open the Add Contact dialog when viewing the contacts list.

what is .github/copilot-instructions.md and copilot-instructions.md for?

What it is: a short, repo-specific guide for AI coding agents (Copilot/assistant chat) that tells an agent the big picture, important files, data flows, conventions, and developer workflows so it can act productively without guessing.

Why it exists: to reduce noisy back-and-forth and prevent the agent from making wrong assumptions (server vs client, storage keys, upload format, etc.). It drives safe, consistent edits and prioritizes project-specific constraints.

Where to put it: copilot-instructions.md is the canonical place in this repo (we added it). Some tooling/agents also accept a copilot-instructions.md at the repository root, but .github is preferred for repo-level metadata.

Difference between the two: there’s no functional difference in intent — both are instruction carriers — but .github is the conventional location for repository guidance and is less likely to be missed by reviewers or automation.

by reviewers or automation.

What agents read from it (examples from this repo):

Big picture: Next.js 14 app directory, client-heavy UI in page.tsx.
Persistence: contacts stored in localStorage under the contacts key and managed by contact-actions.ts.
Upload parsing: handled by page.tsx with FIXED_COLUMNS and xlsx.
Name detection: french-name-detection.ts loads name-dictionary-cleaned-suggestion.txt and returns false if the dictionary isn’t loaded.
Build/dev: npm install, npm run dev, npm run build, npm start. Note next.config.mjs ignores TS/ESLint build errors.
How to maintain it: keep it short (20–50 lines), factual, reference concrete files/keys, and update when you change architecture (e.g., move persistence off-client). Avoid speculative or aspirational items.