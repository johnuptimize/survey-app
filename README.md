# Branching Survey App

A 5-question A/B survey. The sequence of answers forms a 5-character pattern
(e.g. `AABAB`); each of the 32 possible patterns maps to a distinct outcome page
with 3 follow-up A/B prompts. All responses are logged to a Google Sheet, and the
survey content (questions + outcomes) is edited in that same Google Sheet.

## How it works

```
/                     5 sequential A/B questions  (app/SurveyClient.tsx)
   -> builds pattern from the 5 answers           (lib/patterns.ts)
/outcome/<PATTERN>    title + 3 follow-up prompts  (app/outcome/[pattern]/)
   -> looks up PATTERN in the mapping table        (lib/outcomes.ts + data/outcomes.json)
POST /api/log         validates + appends one row  (app/api/log/route.ts)
   -> Google Apps Script web app -> Sheet          (google-apps-script/Code.gs)

build time:  scripts/pull-content.mjs  pulls content from the Sheet -> data/*.json
             scripts/check-content.mjs validates it -> build fails if broken
```

The 32 outcome pages are pre-rendered at build time (`generateStaticParams`).
An unknown pattern (e.g. `/outcome/ZZZZZ`) returns 404.

## Editing content in the Google Sheet

Once the Sheet is set up (see below), all content lives in three tabs:

| Tab | Rows | Columns |
| --- | --- | --- |
| **Intro** | 1 data row | `title`, `description` |
| **Questions** | 5 rows | `id`, `text`, `optionA`, `optionB` |
| **Outcomes** | 32 rows (one per pattern, pre-filled) | `pattern`, `title`, `prompt1_text`, `prompt1_optionA`, `prompt1_optionB`, `prompt2_*`, `prompt3_*` |

To edit: change cells in the Sheet, then **Survey menu → Publish changes to
site**. The site rebuilds and goes live in ~1–2 minutes.

- The 32 `pattern` values in the Outcomes tab are generated for you by
  `firstTimeSetup` — don't retype or reorder them. Edit only the content columns.
- If the pull returns bad content (missing a pattern, wrong number of questions,
  an empty cell), the build **fails** and the currently-live site stays up.
  Vercel's deploy log shows exactly which row is wrong.

### What you can safely add to the spreadsheet

The build only ever reads three tabs by name (`Intro`, `Questions`, `Outcomes`)
and a fixed block of columns in each.

**Always safe:**

- **New tabs with any other name** (`Scratch`, `Analysis`, `Notes`, a VLOOKUP
  staging tab, charts, pivot tables). Anything that isn't `Intro` / `Questions` /
  `Outcomes` is ignored — the `Sheet1` responses tab already works this way.
- **Extra columns to the right of the data:** `Intro` from column **C** on,
  `Questions` from column **E** on, `Outcomes` from column **L** on. Good for
  editor notes, word counts, helper formulas — all ignored by the build.
- Formatting, filters, conditional formatting, frozen rows, cell comments, and
  trailing blank rows.

**Breaks the build (but not the live site):**

- Inserting or reordering columns *inside* the read block (e.g. a new column
  between `optionA` and `optionB`) — every following value shifts into the wrong
  field.
- `Questions`: a row with text in **column A** that isn't a real question — the
  count stops being 5. (A row with column A blank is fine.)
- `Outcomes`: renaming, reordering, or deleting **column A** values, or adding one
  that isn't a valid pattern.
- Deleting row 1 (the header) of any of the three tabs.
- Renaming the `Intro`, `Questions`, `Outcomes`, or `Sheet1` tabs without also
  updating the matching name at the top of `Code.gs` and redeploying.

If you do hit one of these, **Publish** fails the build, the current live survey
stays untouched, and Vercel's deploy log names the offending row or key.

### Loading the supplied 32-row content

Paste the handoff data into the Outcomes tab, matching it to the existing
`pattern` rows (a `VLOOKUP` from a scratch tab keyed on pattern is the safe way).
Then Publish.

The committed `data/questions.json` / `data/outcomes.json` are a fallback copy
used only when no Sheet URL is configured (e.g. a fresh local checkout). The
Sheet is the source of truth once wired up.

### `data/outcomes.json` shape (what the Sheet is converted into)

```json
{
  "AAAAA": {
    "title": "…",
    "prompts": [
      { "text": "…", "optionA": "…", "optionB": "…" },
      { "text": "…", "optionA": "…", "optionB": "…" },
      { "text": "…", "optionA": "…", "optionB": "…" }
    ]
  },
  "AAAAB": { "…": "…" }
}
```

### Changing the number of questions

Update `QUESTION_COUNT` in [`lib/patterns.ts`](lib/patterns.ts) **and**
`QUESTION_COUNT` in [`google-apps-script/Code.gs`](google-apps-script/Code.gs),
redeploy the script, and re-run `firstTimeSetup` (it adds the new pattern rows;
number of patterns is `2 ^ QUESTION_COUNT`).

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

- With no `GOOGLE_SHEET_WEBHOOK_URL` set: the build uses the committed
  `data/*.json`, and submissions are written to the dev-server console instead of
  a sheet. Zero setup needed to click through the flow.
- With `GOOGLE_SHEET_WEBHOOK_URL` set (in `.env.local`): `npm run dev` and
  `npm run build` pull live content from the Sheet first, and submissions go to
  the Sheet.

Handy scripts: `npm run pull:content` (pull now), `npm run check:content`
(validate the local JSON), `npm run generate:outcomes` (rebuild the 32-key
skeleton locally).

## One-time Google Sheet setup

1. Create a Google Sheet.
2. **Extensions → Apps Script.** Delete the sample, paste all of
   [`google-apps-script/Code.gs`](google-apps-script/Code.gs). **Ctrl+S** to save.
3. *(Optional)* set `SECRET` to a random string (for POST auth) and, once you
   have a Vercel deploy hook, paste it into `DEPLOY_HOOK_URL`.
4. In the editor's toolbar, pick **`firstTimeSetup`** in the function dropdown and
   click **Run**. Authorize when prompted. This creates the `Sheet1` (responses),
   `Intro`, `Questions`, and `Outcomes` tabs with headers and the 32 seed rows.
5. **Deploy → New deployment → Web app.** Execute as **Me**, Who has access
   **Anyone**. Copy the **Web app URL** (ends in `/exec`).
6. Reload the spreadsheet — a **Survey** menu appears.

That one URL is used for everything. After any later edit to `Code.gs`:
**Deploy → Manage deployments → ✏️ → Version: New version → Deploy.**

Each response is one row in `Sheet1`: `submittedAt, receivedAt, pattern, q1..q5,
followup1..followup3`.

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new). Framework preset
   **Next.js** is auto-detected — no build settings to change.
3. **Settings → Environment Variables** (Production + Preview):

   | Name | Value |
   | --- | --- |
   | `GOOGLE_SHEET_WEBHOOK_URL` | the `/exec` Web app URL |
   | `GOOGLE_SHEET_WEBHOOK_SECRET` | same as `SECRET` in `Code.gs`, or omit |

4. Deploy. You get one shareable `*.vercel.app` URL.
5. **Create a deploy hook:** Settings → Git → Deploy Hooks → add one on branch
   `main`. Copy its URL into `DEPLOY_HOOK_URL` in `Code.gs` and redeploy the
   script. Now the Sheet's **Survey → Publish changes to site** works.

`npm run build` pulls + validates content first, so an incomplete Sheet or a
broken pull fails the deploy instead of shipping bad content.

## Project layout

```
app/
  page.tsx                     survey entry (server) — reads data/questions.json
  SurveyClient.tsx             5-question stepper (client)
  outcome/[pattern]/page.tsx   outcome route (server) — validates pattern, 404s
  outcome/[pattern]/OutcomeClient.tsx   3 follow-up prompts + submit (client)
  api/log/route.ts             validates payload, forwards to the sheet
  not-found.tsx
data/
  questions.json               fallback copy of intro + questions
  outcomes.json                fallback copy of the 32-pattern mapping table
lib/
  patterns.ts                  pattern generation + validation (single source of truth)
  outcomes.ts                  loads + validates outcomes.json at startup
  types.ts                     shared LogPayload type
scripts/
  pull-content.mjs             build step: Sheet -> data/*.json (npm run pull:content)
  check-content.mjs            build guard: validate data/*.json (npm run check:content)
  generate-outcomes.mjs        (re)create the 32-key skeleton offline
google-apps-script/Code.gs     paste into the Sheet's Apps Script (logging + content API)
```
