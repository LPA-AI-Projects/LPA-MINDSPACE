/**
 * Google Apps Script — installable On Form Submit trigger
 *
 * Setup:
 * 1. Open the Google Sheet linked to your Form → Extensions → Apps Script
 * 2. Paste this file
 * 3. Set HR_WEBHOOK_URL to your Railway (or local tunnel) URL
 * 4. Set HR_WEBHOOK_SECRET to the same value as HR_FORM_WEBHOOK_SECRET on the server
 * 5. Save → Triggers → Add trigger:
 *      Function: onFormSubmit
 *      Event source: From spreadsheet
 *      Event type: On form submit
 * 6. Authorize the script when prompted
 *
 * Production example:
 *   https://lpa-mindspace-production.up.railway.app/api/hr-agent/form-submit
 */

var HR_WEBHOOK_URL = 'https://lpa-mindspace-production.up.railway.app/api/hr-agent/form-submit';
// Must match HR_FORM_WEBHOOK_SECRET on the server / Railway
var HR_WEBHOOK_SECRET = 'PASTE_SAME_SECRET_AS_SERVER';

/**
 * Installable trigger entry point.
 * @param {Object} e Google Forms / Sheets form-submit event
 */
function onFormSubmit(e) {
  if (!e) {
    console.error('onFormSubmit called without event object');
    return;
  }

  var namedValues = e.namedValues || {};
  var values = e.values || [];
  var headers = [];

  try {
    if (e.range) {
      var sheet = e.range.getSheet();
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
    }
  } catch (err) {
    console.warn('Could not read sheet headers', err);
  }

  var payload = {
    secret: HR_WEBHOOK_SECRET,
    timestamp: values[0] || new Date().toISOString(),
    values: values,
    namedValues: namedValues,
    headers: headers,
    range: e.range
      ? {
          row: e.range.getRow(),
          sheet: e.range.getSheet().getName(),
        }
      : null,
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: {
      'X-HR-Webhook-Secret': HR_WEBHOOK_SECRET,
    },
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch(HR_WEBHOOK_URL, options);
  var code = response.getResponseCode();
  var body = response.getContentText();
  console.log('HR AGENT webhook status=' + code + ' body=' + body);

  if (code < 200 || code >= 300) {
    throw new Error('HR AGENT webhook failed (' + code + '): ' + body);
  }
}
