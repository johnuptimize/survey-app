# Branching Survey App

A 5-question A/B survey. The sequence of answers forms a 5-character pattern
(e.g. `AABAB`); each of the 32 possible patterns maps to a distinct outcome page
with 3 follow-up A/B prompts. One option per prompt is the "tuned" response, the
other is "regular". After submitting, respondents see how often they picked the
tuned option and a results page that branches on that. All responses are logged
to a Google Sheet, and all content is edited in that same Google Sheet.

## How it works

```
/                     5 sequential A/B questions  (app/SurveyClient.tsx)
   -> builds pattern from the 5 answers           (lib/patterns.ts)
/outcome/<PATTERN>    title + 3 follow-up prompts  (app/outcome/[pattern]/)
   -> looks up PATTERN in the mapping table        (lib/outcomes.ts + data/outcomes.json)
   -> on submit: tally tuned vs regular picks      (lib/tally.ts)
   -> 2-3 tuned -> "tuned" results page,           (lib/results.ts + data/results.json)
      0-1 tuned -> "regular" results page
POST /api/log         validates + appends one row  (app/api/log/route.ts)
   -> derives tuned/regular result server-side, then
   -> Google Apps Script web app -> Sheet          (google-apps-script/Code.gs)

build time:  scripts/pull-content.mjs  pulls content from the Sheet -> data/*.json
             scripts/check-content.mjs validates it -> build fails if broken
```

The 32 outcome pages are pre-rendered at build time (`generateStaticParams`).
An unknown pattern (e.g. `/outcome/ZZZZZ`) returns 404.

## Editing content in the Google Sheet

Once the Sheet is set up (see below), all content lives in four tabs:

| Tab | Rows | Columns |
| --- | --- | --- |
| **Intro** | 1 data row | `title`, `description` |
| **Questions** | 5 rows | `id`, `text`, `optionA`, `optionB` |
| **Outcomes** | 32 rows (one per pattern, pre-filled) | `pattern`, `title`, `prompt1_text`, `prompt1_optionA`, `prompt1_optionB`, `prompt2_*`, `prompt3_*`, then `prompt1_tuned`, `prompt2_tuned`, `prompt3_tuned` (each `A` or `B` — which option is the tuned response) |
| **Results** | 2 rows (`tuned`, `regular`) | `key`, `heading`, `body`, `ctaLabel`, `ctaUrl` |

To edit: change cells in the Sheet, then **Survey menu → Publish changes to
site**. The site rebuilds and goes live in ~1–2 minutes.

- The 32 `pattern` values in the Outcomes tab are generated for you by
  `firstTimeSetup` — don't retype or reorder them. Edit only the content columns.
- `promptN_tuned` = `A` or `B`, the option that is the tuned response for that
  prompt. Blank or anything else fails the build.
- **Results** tab: `body` supports line breaks (Alt+Enter in the cell). The CTA
  button shows only when **both** `ctaLabel` and `ctaUrl` are filled — so you
  decide per variant whether there's a button. `ctaUrl` must start with `http`.
- If the pull returns bad content (missing a pattern, wrong number of questions,
  a bad `tuned` value, an empty cell), the build **fails** and the currently-live
  site stays up. Vercel's deploy log shows exactly which row is wrong.

### What you can safely add to the spreadsheet

The build only ever reads four tabs by name (`Intro`, `Questions`, `Outcomes`,
`Results`) and a fixed block of columns in each.

**Always safe:**

- **New tabs with any other name** (`Scratch`, `Analysis`, `Notes`, a VLOOKUP
  staging tab, charts, pivot tables). Anything that isn't one of the four is
  ignored — the `Sheet1` responses tab already works this way.
- **Extra columns to the right of the data:** `Intro` from column **C** on,
  `Questions` from column **E** on, `Outcomes` from column **O** on, `Results`
  from column **F** on. Good for editor notes, word counts, helper formulas —
  all ignored by the build.
- Formatting, filters, conditional formatting, frozen rows, cell comments, and
  trailing blank rows.

**Breaks the build (but not the live site):**

- Inserting or reordering columns *inside* the read block (e.g. a new column
  between `optionA` and `optionB`) — every following value shifts into the wrong
  field.
- `Questions`: a row with text in **column A** that isn't a real question — the
  count stops being 5. (A row with column A blank is fine.)
- `Outcomes`: renaming, reordering, or deleting **column A** values, or adding one
  that isn't a valid pattern; a blank/invalid `promptN_tuned`.
- `Results`: removing the `tuned` or `regular` row, an empty `heading`/`body`,
  or filling only one of `ctaLabel`/`ctaUrl`.
- Deleting row 1 (the header) of any of the four tabs.
- Renaming the `Intro`, `Questions`, `Outcomes`, `Results`, or `Sheet1` tabs
  without also updating the matching name at the top of `Code.gs` and redeploying.

If you do hit one of these, **Publish** fails the build, the current live survey
stays untouched, and Vercel's deploy log names the offending row or key.

### Loading the supplied 32-row content

Paste the handoff data into the Outcomes tab, matching it to the existing
`pattern` rows (a `VLOOKUP` from a scratch tab keyed on pattern is the safe way).
Then Publish.

The committed `data/questions.json` / `data/outcomes.json` / `data/results.json`
are a fallback copy used only when no Sheet URL is configured (e.g. a fresh local
checkout). The Sheet is the source of truth once wired up.

### `data/outcomes.json` shape (what the Sheet is converted into)

```json
{
  "AAAAA": {
    "title": "…",
    "prompts": [
      { "text": "…", "optionA": "…", "optionB": "…", "tuned": "A" },
      { "text": "…", "optionA": "…", "optionB": "…", "tuned": "B" },
      { "text": "…", "optionA": "…", "optionB": "…", "tuned": "A" }
    ]
  },
  "AAAAB": { "…": "…" }
}
```

### `data/results.json` shape

```json
{
  "tuned":   { "heading": "…", "body": "…", "ctaLabel": "Join Frequency", "ctaUrl": "https://…" },
  "regular": { "heading": "…", "body": "…", "ctaLabel": "", "ctaUrl": "" }
}
```

### The results screen

After submit, the app compares each of the 3 follow-up picks to that prompt's
`tuned` letter. `2` or `3` tuned picks → the `tuned` variant; `0` or `1` → the
`regular` variant. The screen shows:

> ✓ Your responses have been recorded.
> **You preferred the tuned response N of 3 times.**
> *(variant heading)*
> *(variant body)*
> *(CTA button, if configured)*
> Start over

The same tally is recomputed server-side in `/api/log` and written to the
response row, so you never have to reconstruct it from the raw A/B picks.

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
   `Intro`, `Questions`, `Outcomes`, and `Results` tabs with headers and seed rows.
5. **Deploy → New deployment → Web app.** Execute as **Me**, Who has access
   **Anyone**. Copy the **Web app URL** (ends in `/exec`).
6. Reload the spreadsheet — a **Survey** menu appears.

That one URL is used for everything. After any later edit to `Code.gs`:
**Deploy → Manage deployments → ✏️ → Version: New version → Deploy.**

Each response is one row in `Sheet1`: `submittedAt, receivedAt, pattern, q1..q5,
followup1..followup3, pickedType1..3` (`tuned`/`regular`), `tunedCount` (0–3),
`resultVariant`.

### Upgrading a sheet that predates the tuned columns / Results tab

1. Paste the new `Code.gs`, save, redeploy (new version).
2. Run **`firstTimeSetup`** → adds the `Results` tab (leaves your other tabs alone).
3. Run **`setResponseHeaders`** (Survey menu, or the function dropdown) → rewrites
   row 1 of `Sheet1` with the new columns. Existing rows keep their values.
4. Add the `prompt1_tuned` / `prompt2_tuned` / `prompt3_tuned` columns to the
   `Outcomes` tab — paste [`google-apps-script/outcomes-tuned-columns.tsv`](google-apps-script/outcomes-tuned-columns.tsv)
   into cell **L1** (header + 32 rows, already in pattern order).
5. Fill in the `Results` tab copy, then **Publish**.

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
  results.json                 fallback copy of the tuned / regular results copy
lib/
  patterns.ts                  pattern generation + validation (single source of truth)
  outcomes.ts                  loads + validates outcomes.json at startup
  results.ts                   loads + validates results.json at startup
  tally.ts                     tuned-vs-regular tally (shared: results page + logging)
  types.ts                     shared LogPayload type
scripts/
  pull-content.mjs             build step: Sheet -> data/*.json (npm run pull:content)
  check-content.mjs            build guard: validate data/*.json (npm run check:content)
  generate-outcomes.mjs        (re)create the 32-key skeleton offline
google-apps-script/
  Code.gs                      paste into the Sheet's Apps Script (logging + content API)
  outcomes-tuned-columns.tsv   paste block for the Outcomes tab's tuned columns
```
