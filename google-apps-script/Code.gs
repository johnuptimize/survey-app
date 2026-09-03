/**
 * Google Apps Script — response sink for the branching survey app.
 *
 * SETUP
 * 1. Create a Google Sheet. Note its first tab name (default "Sheet1").
 * 2. Extensions -> Apps Script. Delete the sample, paste this file.
 * 3. (Optional) set a shared secret in SECRET below and use the same value for
 *    the GOOGLE_SHEET_WEBHOOK_SECRET env var in the Next.js app.
 * 4. Deploy -> New deployment -> type "Web app".
 *      Execute as: Me
 *      Who has access: Anyone
 *    Copy the Web app URL -> that is GOOGLE_SHEET_WEBHOOK_URL in the app.
 * 5. Run `setupHeaders` once from the editor to write the header row.
 *
 * Re-deploy (Deploy -> Manage deployments -> edit -> new version) after any edit.
 */

var SHEET_NAME = "Sheet1";
var SECRET = ""; // must match GOOGLE_SHEET_WEBHOOK_SECRET if that env var is set

// Column order. Must match the keys sent by app/api/log/route.ts.
var COLUMNS = [
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

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

function setupHeaders() {
  var sh = sheet_();
  sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
  sh.setFrozenRows(1);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (SECRET && body.token !== SECRET) {
      return json_({ error: "unauthorized" }, 401);
    }

    var row = body.row || {};
    var values = COLUMNS.map(function (key) {
      return row[key] != null ? row[key] : "";
    });

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      sheet_().appendRow(values);
    } finally {
      lock.releaseLock();
    }

    return json_({ ok: true }, 200);
  } catch (err) {
    return json_({ error: String(err) }, 500);
  }
}

function doGet() {
  return json_({ ok: true, hint: "POST survey responses here." }, 200);
}

function json_(obj, status) {
  // Apps Script web apps can't set arbitrary status codes; callers should treat
  // a 200 with {ok:true} as success. Status arg kept for readability.
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
