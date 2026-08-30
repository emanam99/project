/**
 * Google Apps Script — auto-kirim notifikasi BNI ke SPPG.
 *
 * Cara pasang (di akun mbeddien@gmail.com):
 * 1. Buka https://script.google.com → New project
 * 2. Ganti isi Code.gs dengan file ini
 * 3. Sesuaikan CRON_KEY jika perlu
 * 4. Simpan → Triggers (jam) → Add Trigger:
 *    - Function: pollBniEmails
 *    - Event source: Time-driven
 *    - Every 5 minutes
 * 5. Jalankan sekali manual → izinkan izin Gmail + URL eksternal
 */

var CRON_KEY = PropertiesService.getScriptProperties().getProperty('BNI_CRON_KEY');
if (!CRON_KEY) {
  throw new Error('BNI_CRON_KEY belum di-set. Buka Project Settings > Script Properties, tambah BNI_CRON_KEY');
}
var SPPG_HOOK_ALUTSMANI =
  'https://sppg.alutsmani.id/api/public/cron/bni-email-hook?key=' + CRON_KEY;
var SPPG_HOOK_CLOUDY =
  'https://sppg.cloudy.my.id/api/public/cron/bni-email-hook?key=' + CRON_KEY;
// Tenant cloudy: set hook ke SPPG_HOOK_CLOUDY bila sudah migrasi
var SPPG_HOOK = SPPG_HOOK_ALUTSMANI;

function pollBniEmails() {
  var query =
    'newer_than:3d (subject:("Bulk Payment") OR "No. Referensi BNI" OR "Reference No.")';
  var threads = GmailApp.search(query, 0, 20);
  var props = PropertiesService.getScriptProperties();

  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = 0; m < messages.length; m++) {
      var msg = messages[m];
      var id = msg.getId();
      var key = 'done_' + id;
      if (props.getProperty(key)) continue;

      var body = msg.getPlainBody() || msg.getBody();
      if (
        body.indexOf('Bulk Payment') === -1 &&
        body.indexOf('Referensi BNI') === -1 &&
        body.indexOf('Reference No') === -1
      ) {
        continue;
      }

      var res = UrlFetchApp.fetch(SPPG_HOOK, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          raw: body,
          message_id: id,
        }),
        muteHttpExceptions: true,
      });

      var code = res.getResponseCode();
      // Tandai sudah diproses agar tidak spam (sukses / duplicate / unmatched tetap dicatat)
      if (code >= 200 && code < 500) {
        props.setProperty(key, String(code));
      }
      Logger.log(id + ' => ' + code + ' ' + res.getContentText());
    }
  }
}
