/**
 * Google Apps Script for the branching survey app. One deployment does two jobs:
 *
 *   1. doPost  — receives a finished survey response and appends it as a row
 *                to the responses tab.
 *   2. doGet ?content=all — returns the editable survey content (intro, the 5
 *                questions, and all 32 outcomes) as JSON, so the app can pull it
 *                at build time (scripts/pull-content.mjs).
 *
 * TABS in this spreadsheet:
 *   Sheet1     (SHEET_NAME)     — one row per submission (script writes here;
 *                                rename via SHEET_NAME if your tab differs)
 *   Intro      (INTRO_TAB)      — row 2: [title, description]
 *   Questions  (QUESTIONS_TAB)  — 5 rows: [id, text, optionA, optionB]
 *   Outcomes   (OUTCOMES_TAB)   — 32 rows: [pattern, title, p1_text, p1_A, p1_B,
 *                                            p2_text, p2_A, p2_B, p3_text, p3_A, p3_B]
 *
 * FIRST-TIME SETUP
 *   1. Extensions -> Apps Script. Paste this file.
 *   2. (Optional) set SECRET below; use the same value for the app's
 *      GOOGLE_SHEET_WEBHOOK_SECRET env var.
 *   3. (Optional) set DEPLOY_HOOK_URL to a Vercel deploy hook so the "Survey"
 *      menu can trigger a rebuild after you edit content.
 *   4. Run `firstTimeSetup` once (creates all tabs + headers, seeds 32 outcome rows).
 *   5. Deploy -> New deployment -> Web app. Execute as: Me. Access: Anyone.
 *      Copy the /exec URL -> that is GOOGLE_SHEET_WEBHOOK_URL for the app.
 *   6. Reload the spreadsheet -> a "Survey" menu appears.
 *
 * AFTER EDITING THIS FILE: Deploy -> Manage deployments -> edit -> Version: New
 * version -> Deploy. (Content/response behaviour changes need a redeploy.)
 */

var SHEET_NAME = "Sheet1"; // the responses tab (Google's default first-tab name)
var INTRO_TAB = "Intro";
var QUESTIONS_TAB = "Questions";
var OUTCOMES_TAB = "Outcomes";

var SECRET = ""; // must match GOOGLE_SHEET_WEBHOOK_SECRET if that env var is set
var DEPLOY_HOOK_URL = ""; // Vercel: Settings -> Git -> Deploy Hooks (branch: main)

var QUESTION_COUNT = 5;

// Response row column order. Must match app/api/log/route.ts.
var RESPONSE_COLUMNS = [
  "submittedAt",
  "receivedAt",
  "pattern",
  "q1",
  "q2",
  "q3",
  "q4",
  "q5",
  "followup1",
  "followup2",
  "followup3",
];

var OUTCOME_COLUMNS = [
  "pattern",
  "title",
  "prompt1_text",
  "prompt1_optionA",
  "prompt1_optionB",
  "prompt2_text",
  "prompt2_optionA",
  "prompt2_optionB",
  "prompt3_text",
  "prompt3_optionA",
  "prompt3_optionB",
];

/* ------------------------------------------------------------------ */
/* Web app entry points                                               */
/* ------------------------------------------------------------------ */

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (SECRET && body.token !== SECRET) {
      return json_({ error: "unauthorized" });
    }

    var row = body.row || {};
    var values = RESPONSE_COLUMNS.map(function (key) {
      return row[key] != null ? row[key] : "";
    });

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      responsesSheet_().appendRow(values);
    } finally {
      lock.releaseLock();
    }

    return json_({ ok: true });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function doGet(e) {
  var what = e && e.parameter ? e.parameter.content : "";
  if (what === "all") {
    try {
      return json_(readContent_());
    } catch (err) {
      return json_({ error: String(err) });
    }
  }
  return json_({
    ok: true,
    hint: "POST responses here; GET ?content=all for survey content.",
  });
}

/* ------------------------------------------------------------------ */
/* Content read                                                       */
/* ------------------------------------------------------------------ */

function readContent_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var introSheet = mustGetSheet_(ss, INTRO_TAB);
  var introRow = introSheet.getRange(2, 1, 1, 2).getValues()[0];
  var intro = {
    title: String(introRow[0] || "").trim(),
    description: String(introRow[1] || "").trim(),
  };

  var qSheet = mustGetSheet_(ss, QUESTIONS_TAB);
  var qRows = qSheet.getDataRange().getValues();
  qRows.shift(); // header
  var questions = qRows
    .filter(function (r) {
      return String(r[0]).trim() !== "";
    })
    .map(function (r) {
      return {
        id: String(r[0]).trim(),
        text: String(r[1]).trim(),
        optionA: String(r[2]).trim(),
        optionB: String(r[3]).trim(),
      };
    });

  var oSheet = mustGetSheet_(ss, OUTCOMES_TAB);
  var oRows = oSheet.getDataRange().getValues();
  oRows.shift(); // header
  var outcomes = {};
  oRows.forEach(function (r) {
    var pattern = String(r[0]).trim().toUpperCase();
    if (!pattern) return;
    outcomes[pattern] = {
      title: String(r[1]).trim(),
      prompts: [
        { text: String(r[2]).trim(), optionA: String(r[3]).trim(), optionB: String(r[4]).trim() },
        { text: String(r[5]).trim(), optionA: String(r[6]).trim(), optionB: String(r[7]).trim() },
        { text: String(r[8]).trim(), optionA: String(r[9]).trim(), optionB: String(r[10]).trim() },
      ],
    };
  });

  return {
    questions: { intro: intro, questions: questions },
    outcomes: outcomes,
  };
}

/* ------------------------------------------------------------------ */
/* Spreadsheet menu                                                   */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Survey")
    .addItem("Publish changes to site", "publishToSite")
    .addSeparator()
    .addItem("Create / repair all tabs", "firstTimeSetup")
    .addToUi();
}

function publishToSite() {
  var ui = SpreadsheetApp.getUi();
  if (!DEPLOY_HOOK_URL) {
    ui.alert(
      "No deploy hook set.\n\nAdd a Vercel deploy hook URL to DEPLOY_HOOK_URL " +
        "at the top of the Apps Script, then redeploy the script."
    );
    return;
  }
  var res = UrlFetchApp.fetch(DEPLOY_HOOK_URL, {
    method: "post",
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code >= 200 && code < 300) {
    ui.alert("Publish started. The site updates in ~1-2 minutes.");
  } else {
    ui.alert(
      "Publish failed (HTTP " + code + "):\n" + res.getContentText().slice(0, 400)
    );
  }
}

/* ------------------------------------------------------------------ */
/* One-time setup                                                     */
/* ------------------------------------------------------------------ */

function firstTimeSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Responses
  var resp = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (resp.getLastRow() === 0) {
    resp.getRange(1, 1, 1, RESPONSE_COLUMNS.length).setValues([RESPONSE_COLUMNS]);
    resp.setFrozenRows(1);
  }

  // Intro
  var intro = ss.getSheetByName(INTRO_TAB) || ss.insertSheet(INTRO_TAB);
  if (intro.getLastRow() === 0) {
    intro.getRange(1, 1, 2, 2).setValues([
      ["title", "description"],
      [
        "Quick 5-question survey",
        "Answer 5 short A/B questions. Your answers lead to a tailored set of follow-up prompts at the end.",
      ],
    ]);
    intro.setFrozenRows(1);
  }

  // Questions
  var q = ss.getSheetByName(QUESTIONS_TAB) || ss.insertSheet(QUESTIONS_TAB);
  if (q.getLastRow() === 0) {
    var qRows = [["id", "text", "optionA", "optionB"]];
    for (var i = 1; i <= QUESTION_COUNT; i++) {
      qRows.push(["q" + i, "Question " + i + " text", "Option A", "Option B"]);
    }
    q.getRange(1, 1, qRows.length, 4).setValues(qRows);
    q.setFrozenRows(1);
  }

  // Outcomes — seed all 32 pattern rows so keys are never mistyped
  var o = ss.getSheetByName(OUTCOMES_TAB) || ss.insertSheet(OUTCOMES_TAB);
  if (o.getLastRow() === 0) {
    var rows = [OUTCOME_COLUMNS];
    allPatterns_().forEach(function (p) {
      rows.push([
        p,
        "Outcome " + p,
        "Follow-up prompt 1",
        "Option A",
        "Option B",
        "Follow-up prompt 2",
        "Option A",
        "Option B",
        "Follow-up prompt 3",
        "Option A",
        "Option B",
      ]);
    });
    o.getRange(1, 1, rows.length, OUTCOME_COLUMNS.length).setValues(rows);
    o.setFrozenRows(1);
  }

  SpreadsheetApp.getActiveSpreadsheet().toast("Tabs ready.", "Survey setup", 5);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function responsesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

function mustGetSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('missing tab "' + name + '" (run firstTimeSetup)');
  return sh;
}

function allPatterns_() {
  var out = [];
  var total = 1 << QUESTION_COUNT;
  for (var i = 0; i < total; i++) {
    var s = "";
    for (var b = QUESTION_COUNT - 1; b >= 0; b--) {
      s += (i >> b) & 1 ? "B" : "A";
    }
    out.push(s);
  }
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
