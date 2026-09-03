# Branching Survey App

A 5-question A/B survey. The sequence of answers forms a 5-character pattern
(e.g. `AABAB`); each of the 32 possible patterns maps to a distinct outcome page
with 3 follow-up A/B prompts. All responses are logged to a Google Sheet.

## How it works

```
/                     5 sequential A/B questions  (app/SurveyClient.tsx)
   -> builds pattern from the 5 answers           (lib/patterns.ts)
/outcome/<PATTERN>    title + 3 follow-up prompts  (app/outcome/[pattern]/)
   -> looks up PATTERN in the mapping table        (lib/outcomes.ts + data/outcomes.json)
POST /api/log         validates + appends one row  (app/api/log/route.ts)
   -> Google Apps Script web app -> Sheet          (google-apps-script/Code.gs)
```

The 32 outcome pages are pre-rendered at build time (`generateStaticParams`).
An unknown pattern (e.g. `/outcome/ZZZZZ`) returns 404.

## Editing content (no code changes needed)

| To change… | Edit… |
| --- | --- |
| Outcome titles / prompt wording / A-B labels | [`data/outcomes.json`](data/outcomes.json) |
| The 5 survey questions + intro text | [`data/questions.json`](data/questions.json) |

`data/outcomes.json` is keyed by pattern. Its shape:

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

### Loading the real 32-row content

Map the supplied spreadsheet/list directly into `data/outcomes.json` — one JSON
object per pattern, following the shape above. Then:

```bash
npm run check:outcomes
```

This fails loudly if any of the 32 keys is missing, misspelled, duplicated, or
structurally wrong (missing title, not exactly 3 prompts, missing A/B option).
The same check runs automatically before `npm run dev` and `npm run build`, so a
broken table can never start or deploy.

If you ever need a fresh, correctly-keyed skeleton (e.g. after changing the
question count), run `npm run generate:outcomes` — it adds any missing keys with
placeholder content and never overwrites existing entries.

> Changing the number of questions also means updating `QUESTION_COUNT` in
> [`lib/patterns.ts`](lib/patterns.ts) and regenerating the table (the number of
> patterns is `2 ^ QUESTION_COUNT`).

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without `GOOGLE_SHEET_WEBHOOK_URL` set, submissions
are accepted and written to the server console instead of a sheet, so you can
test the full flow with no external setup.

## Response logging (Google Sheet)

1. Create a Google Sheet. Note the first tab's name (default `Sheet1`).
2. **Extensions → Apps Script**. Replace the sample code with
   [`google-apps-script/Code.gs`](google-apps-script/Code.gs).
3. (Optional) set `SECRET` in that script to a random string.
4. In the Apps Script editor, run the `setupHeaders` function once (authorize
   when prompted). This writes the header row.
5. **Deploy → New deployment → Web app.** Execute as **Me**, access **Anyone**.
   Copy the **Web app URL**.
6. Set env vars for the app (locally in `.env.local`, on Vercel in project
   settings):

   ```
   GOOGLE_SHEET_WEBHOOK_URL=<the Web app URL>
   GOOGLE_SHEET_WEBHOOK_SECRET=<same value as SECRET, or leave blank>
   ```

After any edit to `Code.gs`, redeploy: **Deploy → Manage deployments → edit
(pencil) → Version: New version → Deploy.**

Each response is one row: `submittedAt, receivedAt, pattern, q1..q5,
followup1..followup3`.

## Deploy to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. Import it at [vercel.com/new](https://vercel.com/new). Framework preset:
   **Next.js** (auto-detected). No build settings to change.
3. Add the two environment variables from above under **Settings → Environment
   Variables** (Production + Preview).
4. Deploy. You get one shareable URL.

`npm run build` runs the outcome-table check first, so a deploy fails fast if
`data/outcomes.json` is incomplete.

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
  questions.json               5 questions + intro copy
  outcomes.json                the 32-pattern mapping table  ← content lives here
lib/
  patterns.ts                  pattern generation + validation (single source of truth)
  outcomes.ts                  loads + validates outcomes.json at startup
  types.ts                     shared LogPayload type
scripts/
  check-outcomes.mjs           build/startup guard (npm run check:outcomes)
  generate-outcomes.mjs        (re)create the 32-key skeleton
google-apps-script/Code.gs     paste into the Sheet's Apps Script
```
