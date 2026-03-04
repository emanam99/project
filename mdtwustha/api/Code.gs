// ============================================================
// GOOGLE APPS SCRIPT - MD Twustha
// Tempel ke script editor di Google Sheet (Extensions > Apps Script)
// ============================================================
// Sheet yang diperlukan:
// 1. "Pengurus" : id | nip | nama | pw | jabatan
//    - Jika kolom pw kosong = login pertama; password yang diisi akan di-hash dan disimpan.
// 2. "Santri"   : Baris pertama = header kolom (id, nomer_induk, nama, kelas, kamar, no_kk, nik,
//    tempat_lahir, tanggal_lahir, jenis_kelamin, dusun, rt, rw, desa, kecamatan, kabupaten, provinsi,
//    ayah, ibu, saudara_di_pesantren, idp). idp = id pengurus yang menyimpan (diisi otomatis dari login).
// Deploy: Deploy > New deployment > Web app > Execute as Me, Who has access: Anyone
// ============================================================

// Allow-all: agar Web App bisa diakses dari domain mana saja (GitHub Pages, dll).
// Catatan: GAS tidak memanggil doOptions untuk OPTIONS; frontend pakai Content-Type text/plain agar tidak preflight.
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Requested-With, Origin')
    .setHeader('Access-Control-Max-Age', '86400')
    .setHeader('Access-Control-Expose-Headers', '*');
}

// GET: dipanggil saat URL dibuka di browser. Agar deployment tidak error "doGet not found".
function doGet(e) {
  return jsonResponse({
    ok: true,
    app: 'MD Twustha API',
    message: 'Gunakan POST dengan body JSON: { "action": "login" atau "getSantri", ... }'
  });
}

function doPost(e) {
  try {
    var params = {};
    if (e.postData && e.postData.contents) {
      try {
        params = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        return jsonResponse({ success: false, message: 'Body bukan JSON valid. ' + String(parseErr.message) });
      }
    }
    var action = (params.action || '').toString().trim();

    if (action === 'login') {
      return login(params);
    }
    if (action === 'getSantri') {
      return getSantri();
    }
    if (action === 'createSantri') {
      return createSantri(params);
    }
    if (action === 'updateSantri') {
      return updateSantri(params);
    }

    if (!action) {
      return jsonResponse({
        success: false,
        message: 'Action kosong. Pastikan request POST dengan header Content-Type: application/json dan body berisi {"action":"createSantri","data":{...}}. Jika sudah benar, deploy ulang: Deploy > Manage deployments > Edit > Version pilih New version > Deploy.'
      });
    }
    return jsonResponse({
      success: false,
      message: 'Action tidak dikenal: "' + action + '". Yang valid: login, getSantri, createSantri, updateSantri. Deploy ulang script terbaru (Deploy > Manage deployments > Edit > New version > Deploy).'
    });
  } catch (err) {
    return jsonResponse({ success: false, message: String(err.message) });
  }
}

// Hash password SHA-256 (base64). Untuk login pertama, simpan hash ini di sheet.
function hashPassword(plain) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    plain,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(digest);
}

// Sheet Pengurus: id, nip, nama, pw, jabatan (kolom A=0, B=1, C=2, D=3, E=4)
// Login pengurus dengan NIP dan password.
function login(params) {
  const nip = (params.nip || '').toString().trim();
  const password = (params.password || '').toString();

  if (!nip || !password) {
    return jsonResponse({ success: false, message: 'NIP dan password wajib diisi' });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Pengurus');
  if (!sheet) {
    return jsonResponse({ success: false, message: 'Sheet "Pengurus" tidak ditemukan' });
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return jsonResponse({ success: false, message: 'Data pengurus kosong' });
  }

  for (let i = 1; i < data.length; i++) {
    const rowNip = (data[i][1] || '').toString().trim(); // kolom nip (index 1)
    if (rowNip !== nip) continue;

    const rowPw = (data[i][3] || '').toString().trim(); // kolom pw (index 3)
    const rowId = data[i][0] != null ? String(data[i][0]) : '';
    const nama = data[i][2] != null ? String(data[i][2]) : rowNip;
    const jabatan = data[i][4] != null ? String(data[i][4]) : '';

    // Login pertama: pw di sheet masih kosong → simpan hash password
    if (!rowPw) {
      const hashed = hashPassword(password);
      sheet.getRange(i + 1, 4).setValue(hashed); // kolom D = pw
      return jsonResponse({
        success: true,
        firstLogin: true,
        user: { id: rowId, nip: rowNip, name: nama, jabatan: jabatan }
      });
    }

    // Cek password dengan hash yang tersimpan
    const inputHash = hashPassword(password);
    if (inputHash === rowPw) {
      return jsonResponse({
        success: true,
        firstLogin: false,
        user: { id: rowId, nip: rowNip, name: nama, jabatan: jabatan }
      });
    }

    return jsonResponse({ success: false, message: 'Password salah' });
  }

  return jsonResponse({ success: false, message: 'NIP tidak ditemukan' });
}

// Satu-satunya acuan urutan kolom: baris pertama (row 1). Kolom 1 = headers[0], kolom 2 = headers[1], dst.
function getSantriHeaders(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  return headerRow.map(function(cell) { return (cell != null ? String(cell) : '').trim(); });
}

// Ubah objek (payload) jadi array nilai sesuai urutan kolom di sheet.
function objectToRowByHeaders(obj, headers) {
  return headers.map(function(col) {
    var val = obj[col];
    return (val != null ? String(val) : '').trim();
  });
}

// Baca data santri: urutan kolom HANYA dari baris pertama (header). Tiap baris data dibaca sesuai jumlah kolom header.
function getSantri() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Santri');
  if (!sheet) {
    return jsonResponse({ success: false, message: 'Sheet "Santri" tidak ditemukan', data: [] });
  }
  const headers = getSantriHeaders(sheet);
  if (!headers || headers.length === 0) {
    return jsonResponse({ success: true, data: [] });
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse({ success: true, data: [] });
  }
  const list = [];
  const numCols = headers.length;
  for (var i = 2; i <= lastRow; i++) {
    var rowValues = sheet.getRange(i, 1, 1, numCols).getValues()[0];
    var obj = {};
    for (var j = 0; j < numCols; j++) {
      obj[headers[j]] = rowValues[j] != null ? String(rowValues[j]) : '';
    }
    list.push(obj);
  }
  return jsonResponse({ success: true, data: list });
}

function createSantri(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Santri');
  if (!sheet) {
    return jsonResponse({ success: false, message: 'Sheet "Santri" tidak ditemukan' });
  }
  const headers = getSantriHeaders(sheet);
  if (!headers || headers.length === 0) {
    return jsonResponse({ success: false, message: 'Baris pertama Sheet Santri harus berisi header kolom' });
  }
  const lastRow = sheet.getLastRow();
  const newId = lastRow < 1 ? '1' : String(lastRow);
  const payload = params.data || params;
  const rowData = {};
  for (var k = 0; k < headers.length; k++) rowData[headers[k]] = '';
  for (var key in payload) if (payload.hasOwnProperty(key)) rowData[key] = payload[key];
  rowData['id'] = newId;
  const row = objectToRowByHeaders(rowData, headers);
  sheet.appendRow(row);
  return jsonResponse({ success: true, message: 'Santri ditambah' });
}

function updateSantri(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Santri');
  if (!sheet) {
    return jsonResponse({ success: false, message: 'Sheet "Santri" tidak ditemukan' });
  }
  const headers = getSantriHeaders(sheet);
  if (!headers || headers.length === 0) {
    return jsonResponse({ success: false, message: 'Baris pertama Sheet Santri harus berisi header kolom' });
  }
  const idCol = headers.indexOf('id');
  const nomerCol = headers.indexOf('nomer_induk');
  if (idCol < 0 && nomerCol < 0) {
    return jsonResponse({ success: false, message: 'Sheet Santri harus punya kolom "id" atau "nomer_induk"' });
  }
  const nomerInduk = (params.nomer_induk || (params.data && params.data.nomer_induk) || '').toString().trim();
  const id = (params.id || (params.data && params.data.id) || '').toString().trim();
  if (!nomerInduk && !id) {
    return jsonResponse({ success: false, message: 'nomer_induk atau id wajib untuk update' });
  }
  const lastRow = sheet.getLastRow();
  const numCols = headers.length;
  for (var i = 2; i <= lastRow; i++) {
    var rowValues = sheet.getRange(i, 1, 1, numCols).getValues()[0];
    var rowId = idCol >= 0 ? (rowValues[idCol] != null ? String(rowValues[idCol]) : '').trim() : '';
    var rowNomer = nomerCol >= 0 ? (rowValues[nomerCol] != null ? String(rowValues[nomerCol]) : '').trim() : '';
    if (rowNomer !== nomerInduk && rowId !== id) continue;
    var rowData = {};
    for (var k = 0; k < numCols; k++) rowData[headers[k]] = rowValues[k] != null ? String(rowValues[k]) : '';
    var payload = params.data || params;
    for (var key in payload) if (payload.hasOwnProperty(key)) rowData[key] = payload[key];
    var newRow = objectToRowByHeaders(rowData, headers);
    for (var c = 0; c < newRow.length; c++) {
      sheet.getRange(i, c + 1).setValue(newRow[c]);
    }
    return jsonResponse({ success: true, message: 'Santri diperbarui' });
  }
  return jsonResponse({ success: false, message: 'Santri tidak ditemukan' });
}

function jsonResponse(obj) {
  var out = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  try {
    out.setHeader('Access-Control-Allow-Origin', '*');
    out.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    out.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Requested-With, Origin');
    out.setHeader('Access-Control-Max-Age', '86400');
    out.setHeader('Access-Control-Expose-Headers', '*');
  } catch (err) {}
  return out;
}
