# Shared Excel progress handoffs

An Excel now retains its saved contact reviews, contact and global notes, research checks, edited contact details, contact IDs, and last reviewed contact. Opening it again restores that progress. New Excels still start with fresh contacts.

Autosave writes the member's draft and the Excel's saved progress in one transaction. Releasing through Browse Excels or Team Progress makes the Excel available without clearing saved progress, the stopped-at page, or segment notes. Administrator reassignment preserves the same information. The next member claims the Excel and continues from its latest successful save.

Clearing a personal draft does not erase the Excel's saved progress. Importing a separate JSON draft detaches that draft from the Excel. Deleting an Excel retains the former member's personal draft. Completed Excels remain closed until an administrator releases or reassigns them.

An assignment revision prevents an old tab or former assignee from overwriting the next member's work, including when an Excel later returns to the same member. A stale assignment produces a conflict; the member can reopen the Excel or keep their work as a separate draft. Draft revision checks remain in place. Automatic name detection does not rerun over restored review statuses.

## Existing data and deployment

Migration 10 adds saved progress and the draft-to-Excel link. It recovers an existing draft only when its congregation, current segment owner, ZIP, and canonical page range match the Excel. Unmatched drafts remain personal. Original imported contacts remain available in the package record.

The existing schema initialization runs this additive migration before authenticated workspace requests. It can also be run with the project's normal `npm run db:migrate` command. The migration was exercised in an isolated PGlite PostgreSQL database, including recovery of an existing draft and repeat migration initialization.

## Validation

The handoff suite uses the actual migration, SQL, and API handlers with a temporary PostgreSQL engine; authentication is stubbed for the test users. It covers release/claim, same-owner reopening, administrator reassignment, Team Progress release, stale saves and submissions, draft clearing, independent imports, revision conflicts, congregation isolation, package deletion, completion/reopening, and deliberate contact deletions.

Full suite: 130 passed, including 17 handoff database tests; 10 older external-database tests remain skipped without `TEST_DATABASE_URL`. Production build passed. The separate type check still reports the previously identified errors in the unchanged legacy contact components. No authenticated browser walkthrough was performed.

Only successfully saved progress transfers. Changes still pending in an offline or unsaved tab are not part of a handoff.
