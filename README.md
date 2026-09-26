# Search Helper

Search Helper is a private, multi-congregation Next.js application for contact review and Team Progress territory tracking. Each congregation has isolated members, submissions, drafts, OTM files, ZIP codes, segments, feedback, and settings.

## Local development

```bash
npm install
npm run dev
npm test
npm run build
```

Copy the values documented in `.env.example` into `.env.local`. Use a `SESSION_SECRET` of at least 32 random characters.

### Feedback email

Bug reports and feedback submitted from **My settings → Help & feedback** are sent by the server to `borisnikaz@gmail.com`. Configure `RESEND_API_KEY` and `FEEDBACK_FROM_EMAIL` with a verified Resend sender address in every deployment environment. The reporter's email is used as the message Reply-To address.

## Multi-congregation rollout

The tenant-aware routes and APIs are gated by `MULTI_TENANT_ENABLED`.

1. Deploy with `MULTI_TENANT_ENABLED=false` and configure `DATABASE_URL`, `SESSION_SECRET`, and a one-time `PLATFORM_SETUP_TOKEN`.
2. Rehearse `npm run db:migrate` against a temporary Neon branch. For the automated isolation suite, set only `TEST_DATABASE_URL`; tests never fall back to `DATABASE_URL`.
3. Run the migration against production. It seeds all existing data into **Central French Alexandria** at `central-french-alexandria` and preserves the existing OTM file and Team Progress data.
4. Open `/setup` and create the first platform owner. Setup becomes unavailable after a platform owner exists.
5. Validate the Central workspace, then deploy with `MULTI_TENANT_ENABLED=true`.

Do not roll back to a pre-tenant release after a second congregation contains data. Roll back only to another tenant-aware release.

## Canonical routes

- `/auth/sign-in`, `/setup`, `/join/[token]`, `/auth/reset/[token]`
- `/workspaces`
- `/c/[slug]` and `/c/[slug]/team`
- `/c/[slug]/admin` and `/c/[slug]/settings`
- `/platform` and `/platform/dictionary`

Legacy pages and APIs remain available only while the feature flag is off. Once enabled, legacy global APIs return `404` to prevent accidental cross-congregation access.

## Surname origin research

In a workspace, the Origin button in the contact list or grid opens a floating bottom panel aligned with the contacts table. The panel uses GPT-6 Luna with web search to suggest up to two likely historical or linguistic countries of origin for the surname, with links to the sources used. It can report that the origin is unclear. The contact list remains usable while the panel is open, and the result is a clue about the surname, not evidence of a contact's ancestry or nationality.

Set `OPENROUTER_API_KEY` on the server to enable research. The app sends only the surname to OpenRouter for GPT-6 Luna to research, never the contact's other details or the API key to the browser. Results and source links are shared within the workspace and cached by surname; **Research again** refreshes one surname. A contact's Origin button turns green after a result with at least one sourced country is opened. The bottom panel retains an **Open Forebears** link for manual checking. Existing OnoGraph distribution data is kept separately and is never presented as origin research.
