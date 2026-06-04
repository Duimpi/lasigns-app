# LA Signs Development Rules

## Never Assume

If uncertain:
- inspect code first
- search project first
- ask questions

## Before Editing

Always:
1. Read related files
2. Explain findings
3. Create plan
4. Wait for approval

## Architecture

- Next.js App Router
- TypeScript only
- No any types
- TailwindCSS
- Supabase backend

## Modification Rules

- Change minimum code possible
- Never rewrite working components
- Never refactor unrelated code
- Never rename files without approval

## Testing

After every change:
- npm run build
- npm run lint

Fix all errors before continuing

## Bug Log

Every mistake must be added below.

### Bug 001
Problem:
Root Cause:
Prevention:

## Critical Rules

NEVER assume a file is empty because findstr returns nothing.

Before modifying any file:

1. Open the entire file.
2. Show the first 50 lines.
3. Show the last 50 lines.
4. Explain what the file does.
5. Wait for approval.

Never generate a replacement page.tsx unless explicitly instructed.

Never rebuild working pages.

Fix only the affected component.

Never use:
- git update-index --assume-unchanged
- git update-index --skip-worktree

as a bug fix.

These are not fixes.
They only hide files from git.