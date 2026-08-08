/* ═══════════════════════════════════════════════════════════════
   BX Modules — Frontend (وحدات معزولة | Modular | قابلة للتعطيل)
   Barcode | QR Scan | Audit | Recycle | Suppliers | Stocktake
   Print Manager | Auto Update
   لا يعدّل أي دالة أصلية — يعتمد على Wrappers آمنة على window.*
   ═══════════════════════════════════════════════════════════════ */

/** ⚙️ مفاتيح تعطيل/تفعيل كل وحدة (Modular) */
var BX_CONFIG = {
  barcode: true, qrScan: true, audit: true, recycleBin: true,
  suppliers: true, stocktake: true, printManager: true, autoUpdate: true,
  autoBarcodeOnAdd: true
};
var BX_VERSION_CLIENT = '7.1.0';
var BX_TITLES = { suppliers: 'الموردين والمشتريات', stocktake: 'جرد المخزون', barcode: 'طباعة الباركود', activity: 'سجل النشاط', recycle: 'سلة المحذوفات', printers: 'إدارة الطابعات' };
var BX_LOAD = {};
var _bxAuditCache = [], _bxTrashCache = [], _bxSupCache = [], _bxScanStream = null;
/* ═══ تصحيح الظهور: تسجيل الصلاحيات الجديدة في PERMISSIONS ═══
   بهذه الطريقة تظهر الأقسام للمدير تلقائيًا، ويمكن منحها للموظفين */
/* ═══ تثبيت دائم: تسجيل الصلاحيات + تعزيز الأقسام الموجودة ═══ */
var BX_NEW_PERMS = [
  { id: 'suppliers', name: 'الموردين والمشتريات', icon: 'fa-truck' },
  { id: 'stocktake', name: 'جرد المخزون',         icon: 'fa-clipboard-check' },
  { id: 'barcode',   name: 'طباعة الباركود',      icon: 'fa-barcode' },
  { id: 'activity',  name: 'سجل النشاط',          icon: 'fa-clock-rotate-left' },
  { id: 'recycle',   name: 'سلة المحذوفات',       icon: 'fa-trash-arrow-up' },
  { id: 'printers',  name: 'الطابعات',            icon: 'fa-print' }
];
function bxRegisterPermissions() {
  if (typeof PERMISSIONS === 'undefined') return false;
  BX_NEW_PERMS.forEach(function (p) {
    if (!PERMISSIONS.some(function (x) { return x.id === p.id; })) PERMISSIONS.push(p);
  });
  return true;
}
bxRegisterPermissions();                                            // تنفيذ فوري عند التحميل
window.addEventListener('DOMContentLoaded', bxRegisterPermissions); // أمان لأي ترتيب تحميل

/* ═══ نسخة معززة من bxEnsureSection (تتجاوز القديمة تلقائيًا) ═══
   تجعل شاشات الموردين/سجل النشاط/سلة المحذوفات تعمل داخل الأقسام
   الموجودة مسبقًا في قالبك، وتخفي اللوحات التجريبية غير العاملة */
window.bxEnsureSection = function (id, icon, subtitle) {
  var main = document.querySelector('.main-content');
  var sec = document.getElementById(id);
  if (!sec) {
    if (!main) return;
    sec = document.createElement('section');
    sec.id = id; sec.className = 'section hidden-section';
    sec.innerHTML = '<div class="section-header"><div><h2>' + (BX_TITLES[id] || id) + '</h2><p>' + (subtitle || '') + '</p></div></div><div id="' + id + '-content"></div>';
    main.appendChild(sec);
    return;
  }
  if (!document.getElementById(id + '-content')) {
    var box = document.createElement('div'); box.id = id + '-content'; sec.appendChild(box);
  }
  Array.prototype.forEach.call(sec.children, function (ch) {
    if (ch.id === id + '-content') { ch.style.display = ''; return; }
    if (ch.classList && ch.classList.contains('section-header')) { ch.style.display = ''; return; }
    ch.style.display = 'none'; // إخفي اللوحات القديمة غير العاملة فقط
  });
};
/* ───────── أدوات عامة ───────── */
function bxGet(op, params) { params = params || {}; params.op = op; return apiGet('bx', params); }
function bxPost(op, data) { data = data || {}; data.op = op; return apiPost('bx', data); }

/** تسجيل حدث في سجل النشاط (fire & forget — لا يبطئ النظام) */
function bxLog(action, entity, before, after, details) {
  if (!BX_CONFIG.audit) return;
  try {
    bxPost('audit', {
      user: currentUser.username || '', role: currentUser.role || '', logAction: action,
      entity: entity || '', details: details || '',
      before: before ? JSON.stringify(before).slice(0, 1800) : '',
      after: after ? JSON.stringify(after).slice(0, 1800) : ''
    }).catch(function () {});
  } catch (e) {}
}

/** Wrapper آمن: يغلّف دالة موجودة دون تعديل مصدرها */
function bxWrap(name, hook) {
  var orig = window[name]; if (!orig) return;
  window[name] = function () { return hook(orig, arguments); };
}

/* ───────── محركات الباركود (EAN-13 + Code128) ───────── */
var BX_EAN_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
var BX_EAN_G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
var BX_EAN_PAR = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
function bxEanR(d) { return BX_EAN_L[d].split('').map(function (b) { return b === '0' ? '1' : '0'; }).join(''); }
function bxEanCheck(d12) { var s = 0; for (var i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 === 0 ? 1 : 3); return (10 - (s % 10)) % 10; }
function bxNormalizeEan13(code) {
  code = String(code).replace(/\D/g, '');
  if (code.length === 12) code += bxEanCheck(code);
  if (code.length === 13 && Number(code[12]) === bxEanCheck(code.slice(0, 12))) return code;
  return null;
}
/** رسم SVG لأي باركود — يختار EAN-13 أو Code-128 تلقائيًا */
function bxRenderBarcode(code, height) {
  height = height || 48;
  var ean = bxNormalizeEan13(code);
  if (ean) return bxRenderEan13(ean, height);
  return bxRenderCode128(String(code), height);
}
function bxRenderEan13(code, h) {
  var bits = '101', par = BX_EAN_PAR[Number(code[0])];
  for (var i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? BX_EAN_L : BX_EAN_G)[Number(code[i])];
  bits += '01010';
  for (var j = 7; j <= 12; j++) bits += bxEanR(Number(code[j]));
  bits += '101';
  var rects = '';
  for (var k = 0; k < bits.length; k++) if (bits[k] === '1') rects += '<rect x="' + k + '" y="0" width="1" height="' + h + '" />';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + bits.length + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:' + h + 'px" fill="#000">' + rects + '</svg>';
}
var BX_C128 = [[2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],[1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],[2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],[1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],[2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],[3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],[2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],[1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],[2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],[1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],[2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],[3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],[3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],[1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],[1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],[2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],[1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],[1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],[2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],[1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],[1,1,4,1,3,1],[3,1,1,1,4,1],[2,1,1,4,1,2],[2,1,1,2,1,4],[2,1,1,2,3,2],[2,3,3,1,1,1],[2,1,3,3,1,1],[2,1,1,2,3,2]];
var BX_C128_STOP = [2,3,3,1,1,1,2];
function bxRenderCode128(text, h) {
  var codes = [104], sum = 104;
  for (var i = 0; i < text.length; i++) { var v = text.charCodeAt(i) - 32; if (v < 0 || v > 94) v = 0; codes.push(v); sum += v * (i + 1); }
  codes.push(sum % 103);
  var x = 0, rects = '';
  codes.forEach(function (c) {
    var w = BX_C128[c];
    for (var j = 0; j < w.length; j++) { if (j % 2 === 0) rects += '<rect x="' + x + '" y="0" width="' + w[j] + '" height="' + h + '" />'; x += w[j]; }
  });
  var ws = BX_C128_STOP;
  for (var s = 0; s < ws.length; s++) { if (s % 2 === 0) rects += '<rect x="' + x + '" y="0" width="' + ws[s] + '" height="' + h + '" />'; x += ws[s]; }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + x + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:' + h + 'px" fill="#000">' + rects + '</svg>';
}

/* ───────── طباعة عامة (iframe — نفس نمط النظام الحالي) ───────── */
function bxPrintHTML(html) {
  /* Printing Manager Hook: نسخة EXE يمكنها اعتراض الطباعة */
  if (window.EXE_PRINT && typeof window.EXE_PRINT === 'function') { try { window.EXE_PRINT(html, bxGetPrintSettings()); return; } catch (e) {} }
  var iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  var doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  var done = false;
  var go = function () { if (done) return; done = true; try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { showToast('تعذرت الطباعة: ' + e.message, 'error'); } setTimeout(function () { if (iframe.parentNode) iframe.remove(); }, 2000); };
  iframe.contentWindow.onload = go; setTimeout(go, 600);
}

/* ═════════ 1) طباعة ملصقات الباركود ═════════ */
function bxPrintLabels(items, sizeKey) {
  var sizes = {
    small:  { w: '38mm', h: '24mm', f: 9,  bh: 30 },
    medium: { w: '50mm', h: '32mm', f: 11, bh: 40 },
    large:  { w: '62mm', h: '42mm', f: 13, bh: 52 }
  };
  var s = sizes[sizeKey] || sizes.medium;
  var labels = '';
  items.forEach(function (it) {
    var copies = Math.max(1, Number(it.copies) || 1);
    for (var c = 0; c < copies; c++) {
      labels += '<div class="lbl">' + bxRenderBarcode(it.barcode, s.bh) +
        '<div class="nm">' + escapeHtml(it.name) + '</div>' +
        '<div class="pr">' + safeNum(it.price).toFixed(2) + ' ' + (RECEIPT_CONFIG.currency || 'ج.م') + '</div>' +
        '<div class="cd">' + escapeHtml(it.barcode) + '</div></div>';
    }
  });
  bxPrintHTML('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Barcodes</title><style>' +
    '@page{size:A4;margin:8mm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Tahoma,Arial,sans-serif}' +
    '.grid{display:flex;flex-wrap:wrap;gap:4mm}.lbl{width:' + s.w + ';height:' + s.h + ';border:1px dashed #999;padding:2mm;text-align:center;overflow:hidden;page-break-inside:avoid}' +
    '.nm{font-size:' + s.f + 'px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}' +
    '.pr{font-size:' + (s.f - 1) + 'px;font-weight:bold}.cd{font-size:' + (s.f - 3) + 'px;color:#333;letter-spacing:1px}' +
    '</style></head><body><div class="grid">' + labels + '</div></body></html>');
  bxLog('طباعة باركود', items.length + ' ملصق', null, null, 'حجم: ' + sizeKey);
}

/* ═════════ 2) قسم طباعة الباركود ═════════ */
BX_LOAD.barcode = function () {
  var box = document.getElementById('barcode-content'); if (!box) return;
  box.innerHTML = '<div class="glass-panel"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i> جاري تحميل المنتجات...</div></div>';
  bxGet('catalog').then(function (cat) {
    if (!Array.isArray(cat)) throw new Error(cat.error || 'خطأ');
    var rows = cat.map(function (p) {
      return '<tr>' +
        '<td><input type="checkbox" class="bx-lbl-chk" data-name="' + escapeHtml(p.name) + '" data-code="' + escapeHtml(p.barcode || '') + '" data-price="' + safeNum(p.price) + '"></td>' +
        '<td style="font-weight:600">' + escapeHtml(p.name) + '</td>' +
        '<td style="font-family:var(--font-mono);font-size:12px">' + (p.barcode ? escapeHtml(p.barcode) : '<button class="btn-ghost" onclick="bxGenOneBarcode(\'' + encodeURIComponent(p.name) + '\')"><i class="fas fa-wand-magic-sparkles"></i> توليد</button>') + '</td>' +
        '<td><input type="number" class="bx-lbl-copies" data-name="' + escapeHtml(p.name) + '" value="1" min="1" style="width:64px;padding:6px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-sm);color:var(--text-primary)"></td>' +
        '<td>' + (p.barcode ? bxRenderBarcode(p.barcode, 34) : '—') + '</td>' +
        '</tr>';
    }).join('');
    box.innerHTML =
      '<div class="glass-panel">' +
      '<h3 class="panel-title"><i class="fas fa-barcode"></i> طباعة ملصقات الباركود</h3>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:14px">' +
      '<label style="font-weight:700;font-size:13px">حجم الملصق:</label>' +
      '<select id="bx-label-size" style="padding:8px 14px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary);font-family:inherit">' +
      '<option value="small">صغير 38×24مم</option><option value="medium" selected>متوسط 50×32مم</option><option value="large">كبير 62×42مم</option></select>' +
      '<button class="btn-ghost" onclick="bxSelectAllLabels(true)"><i class="fas fa-check-double"></i> تحديد الكل</button>' +
      '<button class="btn-ghost" onclick="bxSelectAllLabels(false)">إلغاء التحديد</button>' +
      '<button class="btn-magnetic btn-success" onclick="bxPrintSelectedLabels()"><span class="btn-bg"></span><span class="btn-content"><i class="fas fa-print"></i> طباعة المحدد</span></button>' +
      '</div>' +
      '<div class="table-responsive"><table class="table-modern"><thead><tr><th></th><th>المنتج</th><th>الباركود</th><th>عدد النسخ</th><th>معاينة</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p style="font-size:12px;color:var(--text-tertiary);margin-top:12px"><i class="fas fa-circle-info"></i> يدعم EAN-13 و Code-128 — يتم طباعة اسم المنتج والسعر أسفل الباركود تلقائيًا.</p>' +
      '</div>';
  }).catch(function (e) { box.innerHTML = '<div class="glass-panel"><div class="empty-state"><i class="fas fa-triangle-exclamation"></i> ' + escapeHtml(e.message) + '</div></div>'; });
};
function bxSelectAllLabels(v) { document.querySelectorAll('.bx-lbl-chk').forEach(function (c) { c.checked = v; }); }
function bxPrintSelectedLabels() {
  var items = [];
  document.querySelectorAll('.bx-lbl-chk:checked').forEach(function (c) {
    var name = c.getAttribute('data-name'), code = c.getAttribute('data-code');
    if (!code) { showToast('المنتج "' + name + '" ليس لديه باركود — ولّد واحدًا أولاً', 'warning'); return; }
    var cp = document.querySelector('.bx-lbl-copies[data-name="' + name.replace(/"/g, '\\"') + '"]');
    items.push({ name: name, barcode: code, price: c.getAttribute('data-price'), copies: cp ? cp.value : 1 });
  });
  if (!items.length) { showToast('حدد منتجًا واحدًا على الأقل', 'warning'); return; }
  bxPrintLabels(items, document.getElementById('bx-label-size').value);
}
async function bxGenOneBarcode(encodedName) {
  var name = decodeURIComponent(encodedName);
  var r = await bxPost('autoBarcode');
  if (r.error) { showToast(r.error, 'error'); return; }
  showToast('تم توليد الباركود ✅', 'success'); bxLog('توليد باركود', name); BX_LOAD.barcode();
}

/* ═════════ 3) قارئ QR بالكاميرا ═════════ */
function bxOpenScanner() {
  if (!BX_CONFIG.qrScan) return;
  var m = document.getElementById('bx-scanner-modal');
  if (!m) { m = document.createElement('div'); m.id = 'bx-scanner-modal'; m.className = 'command-palette'; m.style.zIndex = '10002'; document.body.appendChild(m); }
  m.innerHTML =
    '<div class="command-overlay" onclick="bxCloseScanner()"></div>' +
    '<div class="command-modal" style="max-width:480px"><div style="padding:24px">' +
    '<h3 style="font-size:19px;font-weight:800;margin-bottom:14px"><i class="fas fa-qrcode" style="color:var(--brand-blue-bright)"></i> Scan QR — مسح سريع</h3>' +
    '<div style="margin-bottom:10px"><select id="bx-cam-select" style="width:100%;padding:10px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary);font-family:inherit"><option>جاري كشف الكاميرات...</option></select></div>' +
    '<div style="position:relative;border-radius:var(--radius-md);overflow:hidden;background:#000;min-height:260px">' +
    '<video id="bx-scan-video" playsinline style="width:100%;display:block"></video>' +
    '<canvas id="bx-scan-canvas" style="display:none"></canvas>' +
    '<div id="bx-scan-manual" class="hidden" style="padding:20px;color:#fff;text-align:center"><i class="fas fa-video-slash" style="font-size:28px;margin-bottom:10px;display:block"></i>الكاميرا غير متاحة — أدخل الكود يدويًا:<br><input id="bx-manual-code" style="margin-top:10px;padding:10px;width:100%;border-radius:8px;border:none" placeholder="INV-... / باركود / تليفون"><button onclick="bxHandleScan(document.getElementById(\'bx-manual-code\').value)" style="margin-top:10px;padding:10px 20px;border:none;border-radius:8px;background:#3b82f6;color:#fff;font-weight:700;cursor:pointer">تنفيذ</button></div>' +
    '</div>' +
    '<button onclick="bxCloseScanner()" style="margin-top:14px;width:100%;padding:12px;background:var(--bg-hover);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary);font-weight:700;cursor:pointer;font-family:inherit">إغلاق</button>' +
    '</div></div>';
  m.classList.remove('hidden');
  bxStartCamera();
}
function bxStartCamera(deviceId) {
  var video = document.getElementById('bx-scan-video'); if (!video) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { document.getElementById('bx-scan-manual').classList.remove('hidden'); return; }
  var constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }, audio: false };
  navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
    _bxScanStream = stream; video.srcObject = stream; video.setAttribute('playsinline', true); video.play();
    /* اختيار الكاميرا (هاتف/لابتوب/USB) */
    navigator.mediaDevices.enumerateDevices().then(function (devs) {
      var sel = document.getElementById('bx-cam-select'); if (!sel) return;
      var cams = devs.filter(function (d) { return d.kind === 'videoinput'; });
      sel.innerHTML = cams.map(function (c, i) { return '<option value="' + c.deviceId + '">' + escapeHtml(c.label || ('كاميرا ' + (i + 1))) + '</option>'; }).join('');
      sel.onchange = function () { bxStopCamera(); bxStartCamera(sel.value); };
    }).catch(function () {});
    if (!window.jsQR) { showToast('مكتبة jsQR غير محملة — تأكد من الاتصال أو حمّلها محليًا لنسخة EXE', 'warning'); return; }
    requestAnimationFrame(bxScanLoop);
  }).catch(function () { var mm = document.getElementById('bx-scan-manual'); if (mm) mm.classList.remove('hidden'); });
}
function bxScanLoop() {
  var video = document.getElementById('bx-scan-video'), canvas = document.getElementById('bx-scan-canvas');
  if (!video || !canvas || !_bxScanStream) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0);
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var res = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    if (res && res.data) { bxCloseScanner(); bxHandleScan(res.data); return; }
  }
  requestAnimationFrame(bxScanLoop);
}
function bxStopCamera() { if (_bxScanStream) { _bxScanStream.getTracks().forEach(function (t) { t.stop(); }); _bxScanStream = null; } }
function bxCloseScanner() { bxStopCamera(); var m = document.getElementById('bx-scanner-modal'); if (m) m.classList.add('hidden'); }

/** توجيه نتيجة المسح: سريال فاتورة / باركود منتج / تليفون / اسم */
function bxHandleScan(text) {
  text = String(text || '').trim(); if (!text) return;
  bxLog('مسح QR/باركود', text);
  var clean = text.replace(/\s/g, '');
  /* سريال فاتورة INV-YYYYMMDD-XXX → فتح الفاتورة مباشرة */
  if (/^inv-\d{8}-\d{3}$/i.test(clean)) {
    apiGet('getCustomerStatementFull', { name: clean, searchType: 'serial' }).then(function (d) {
      if (d.found && d.sales && d.sales.length) { openInvoiceDetails(d.sales[0].rowId); showToast('تم العثور على الفاتورة ' + clean, 'success'); }
      else showToast('لا توجد فاتورة بهذا السريال', 'warning');
    }).catch(function (e) { showToast(e.message, 'error'); });
    return;
  }
  /* باركود منتج → إضافة للسلة إن كنا في POS */
  bxGet('lookup', { code: clean }).then(function (r) {
    if (r.found) {
      if (currentSection === 'pos') { addToCart(encodeURIComponent(r.name), r.price, r.stock, r.unlimited); showToast('أُضيف: ' + r.name, 'success'); }
      else showToast('المنتج: ' + r.name + ' — السعر ' + fmtMoney(r.price) + ' | المخزون ' + r.stock, 'info');
      return;
    }
    /* تليفون عميل */
    if (/^01[0-9]{9}$/.test(clean)) {
      showSection('customers', document.querySelector('[data-section="customers"]'));
      document.getElementById('customer-search').value = clean; doSearchCustomer(); return;
    }
    /* افتراضي: بحث بالاسم */
    showSection('customers', document.querySelector('[data-section="customers"]'));
    document.getElementById('customer-search').value = text; doSearchCustomer();
  });
}

/* ═════════ 4) سجل النشاط — واجهة ═════════ */
BX_LOAD.activity = function () {
  var box = document.getElementById('activity-content'); if (!box) return;
  box.innerHTML =
    '<div class="glass-panel">' +
    '<h3 class="panel-title"><i class="fas fa-clock-rotate-left"></i> سجل النشاط (Audit Log)</h3>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">' +
    '<input id="bx-aud-q" placeholder="بحث..." style="flex:1;min-width:150px;padding:10px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary)">' +
    '<select id="bx-aud-action" style="padding:10px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary);font-family:inherit"><option value="">كل العمليات</option>' +
    ['تسجيل دخول','تسجيل خروج','إضافة منتج','تعديل منتج','حذف منتج','استرجاع','إنشاء فاتورة','حذف فاتورة','إضافة مصروف','إضافة هالك','قبض','تعديل مستخدم','حذف مستخدم','تقفيل شيفت','فاتورة شراء','جرد','طباعة باركود','مسح QR/باركود'].map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select>' +
    '<input id="bx-aud-from" type="date" style="padding:10px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary)">' +
    '<input id="bx-aud-to" type="date" style="padding:10px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary)">' +
    '<button class="btn-magnetic" onclick="bxLoadAudit()"><span class="btn-bg"></span><span class="btn-content"><i class="fas fa-filter"></i> تطبيق</span></button>' +
    '<button class="btn-ghost" onclick="bxExportAuditCSV()"><i class="fas fa-file-excel"></i> Excel</button>' +
    '<button class="btn-ghost" onclick="bxExportAuditPDF()"><i class="fas fa-file-pdf"></i> PDF</button>' +
    '</div><div id="bx-aud-table"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div></div></div>';
  bxLoadAudit();
};
function bxLoadAudit() {
  var p = { q: (document.getElementById('bx-aud-q') || {}).value || '', action: (document.getElementById('bx-aud-action') || {}).value || '',
    from: (document.getElementById('bx-aud-from') || {}).value || '', to: (document.getElementById('bx-aud-to') || {}).value || '' };
  bxGet('audit', p).then(function (rows) {
    _bxAuditCache = Array.isArray(rows) ? rows : [];
    var t = document.getElementById('bx-aud-table'); if (!t) return;
    if (!_bxAuditCache.length) { t.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> لا توجد سجلات</div>'; return; }
    t.innerHTML = '<div class="table-responsive" style="max-height:60vh;overflow:auto"><table class="table-modern"><thead><tr><th>التاريخ</th><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>الكيان</th><th>تفاصيل</th></tr></thead><tbody>' +
      _bxAuditCache.map(function (r) {
        var tip = '';
        if (r.before || r.after) tip = ' title="قبل: ' + escapeHtml(String(r.before || '—').slice(0, 300)) + '\nبعد: ' + escapeHtml(String(r.after || '—').slice(0, 300)) + '"';
        return '<tr' + tip + '><td class="mono">' + escapeHtml(r.date) + '</td><td class="mono">' + escapeHtml(r.time || '') + '</td><td style="font-weight:600">' + escapeHtml(r.user || '—') + ' <span style="font-size:10px;color:var(--text-tertiary)">(' + escapeHtml(r.role || '') + ')</span></td><td><span class="badge badge-blue">' + escapeHtml(r.action) + '</span></td><td>' + escapeHtml(r.entity || '—') + '</td><td style="font-size:12px;color:var(--text-tertiary)">' + escapeHtml(r.details || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }).catch(function (e) { showToast(e.message, 'error'); });
}
function bxExportAuditCSV() {
  if (!_bxAuditCache.length) { showToast('لا توجد بيانات للتصدير', 'warning'); return; }
  var head = ['التاريخ','الوقت','المستخدم','الدور','العملية','الكيان','قبل','بعد','تفاصيل'];
  var csv = '\uFEFF' + head.join(',') + '\n' + _bxAuditCache.map(function (r) {
    return [r.date, r.time, r.user, r.role, r.action, r.entity, r.before, r.after, r.details].map(function (c) { return '"' + String(c || '').replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'ActivityLog_' + todayStr() + '.csv'; a.click();
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  bxLog('تصدير سجل النشاط', _bxAuditCache.length + ' صف');
}
function bxExportAuditPDF() {
  if (!_bxAuditCache.length) { showToast('لا توجد بيانات', 'warning'); return; }
  var rows = _bxAuditCache.map(function (r) { return '<tr><td>' + escapeHtml(r.date) + '</td><td>' + escapeHtml(r.time || '') + '</td><td>' + escapeHtml(r.user || '') + '</td><td>' + escapeHtml(r.action) + '</td><td>' + escapeHtml(r.entity || '') + '</td><td>' + escapeHtml(r.details || '') + '</td></tr>'; }).join('');
  bxPrintHTML('<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>سجل النشاط</title><style>body{font-family:Tahoma}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:6px;font-size:11px;text-align:right}th{background:#eee}</style></head><body><h2>سجل النشاط — ROR Print Store</h2><table><thead><tr><th>التاريخ</th><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>الكيان</th><th>تفاصيل</th></tr></thead><tbody>' + rows + '</tbody></table></body></html>');
}

/* ═════════ 5) سلة المحذوفات — واجهة ═════════ */
BX_LOAD.recycle = function () {
  var box = document.getElementById('recycle-content'); if (!box) return;
  bxGet('trash').then(function (rows) {
    _bxTrashCache = Array.isArray(rows) ? rows : [];
    var icons = { invoice: 'fa-file-invoice', product: 'fa-box', supplier: 'fa-truck' };
    var types = { invoice: 'فاتورة', product: 'منتج', supplier: 'مورد' };
    box.innerHTML =
      '<div class="glass-panel"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">' +
      '<h3 class="panel-title" style="margin:0"><i class="fas fa-trash-arrow-up"></i> سلة المحذوفات (' + _bxTrashCache.length + ')</h3>' +
      (_bxTrashCache.length ? '<button class="btn-ghost" style="color:var(--danger-bright)" onclick="bxPurgeAllUI()"><i class="fas fa-fire"></i> إفراغ نهائي</button>' : '') +
      '</div>' +
      (_bxTrashCache.length ? '<div class="table-responsive"><table class="table-modern"><thead><tr><th>النوع</th><th>الاسم</th><th>حذف بواسطة</th><th>التاريخ</th><th>إجراءات</th></tr></thead><tbody>' +
        _bxTrashCache.map(function (t) {
          return '<tr><td><span class="badge badge-orange"><i class="fas ' + (icons[t.type] || 'fa-box') + '"></i> ' + (types[t.type] || t.type) + '</span></td>' +
            '<td style="font-weight:600">' + escapeHtml(t.name) + '</td><td>' + escapeHtml(t.deletedBy || '—') + '</td>' +
            '<td class="mono">' + escapeHtml(t.date) + ' ' + escapeHtml(t.time || '') + '</td>' +
            '<td><button class="btn-ghost" onclick="bxRestoreUI(' + t.id + ')"><i class="fas fa-rotate-left"></i> استرجاع</button> ' +
            '<button class="btn-ghost" style="color:var(--danger-bright)" onclick="bxPurgeUI(' + t.id + ')"><i class="fas fa-trash"></i> نهائي</button></td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="empty-state"><i class="fas fa-circle-check"></i> سلة المحذوفات فارغة</div>') +
      '</div>';
  }).catch(function (e) { showToast(e.message, 'error'); });
};
async function bxRestoreUI(id) {
  var ok = await showConfirm({ title: 'استرجاع العنصر', message: 'سيتم إرجاع العنصر إلى مكانه الأصلي.', confirmText: 'استرجاع', cancelText: 'إلغاء', icon: 'fa-rotate-left' });
  if (!ok) return;
  showLoading();
  bxPost('restore', { id: id, user: currentUser.username }).then(function (r) {
    hideLoading();
    if (r.error) { showToast(r.error, 'error'); return; }
    showToast(r.message, 'success'); bxLog('استرجاع من السلة', '#' + id); BX_LOAD.recycle();
  }).catch(function (e) { hideLoading(); showToast(e.message, 'error'); });
}
async function bxPurgeUI(id) {
  var ok = await showConfirm({ title: 'حذف نهائي', message: 'لا يمكن التراجع بعد الحذف النهائي!', confirmText: 'احذف نهائيًا', cancelText: 'إلغاء', icon: 'fa-skull-crossbones' });
  if (!ok) return;
  bxPost('purge', { id: id }).then(function (r) { showToast(r.message || 'تم', 'success'); bxLog('حذف نهائي من السلة', '#' + id); BX_LOAD.recycle(); });
}
async function bxPurgeAllUI() {
  var ok = await showConfirm({ title: 'إفراغ السلة نهائيًا', message: 'سيتم حذف جميع العناصر نهائيًا!', confirmText: 'نعم، أفرغ', cancelText: 'إلغاء', icon: 'fa-fire' });
  if (!ok) return;
  bxPost('purgeAll', {}).then(function (r) { showToast(r.message, 'success'); bxLog('إفراغ سلة المحذوفات'); BX_LOAD.recycle(); });
}

/* ═════════ 6) الموردين والمشتريات ═════════ */
BX_LOAD.suppliers = function () {
  var box = document.getElementById('suppliers-content'); if (!box) return;
  bxGet('suppliers').then(function (list) {
    _bxSupCache = Array.isArray(list) ? list : [];
    var rows = _bxSupCache.map(function (s) {
      return '<tr><td style="font-weight:600">' + escapeHtml(s.name) + '</td><td class="mono">' + escapeHtml(s.phone || '—') + '</td>' +
        '<td>' + escapeHtml(s.address || '—') + '</td><td class="mono">' + escapeHtml(s.email || '—') + '</td>' +
        '<td style="font-family:var(--font-mono);color:' + (s.balance > 0 ? 'var(--danger-bright)' : 'var(--success-bright)') + '">' + fmtMoney(s.balance) + ' ج.م</td>' +
        '<td><button class="btn-ghost" onclick="bxOpenPurchaseModal(\'' + encodeURIComponent(s.name) + '\')"><i class="fas fa-cart-shopping"></i> فاتورة شراء</button> ' +
        '<button class="btn-ghost" onclick="bxEditSupplier(\'' + encodeURIComponent(s.name) + '\')"><i class="fas fa-pen"></i></button> ' +
        '<button class="btn-ghost" style="color:var(--danger-bright)" onclick="bxDeleteSupplier(\'' + encodeURIComponent(s.name) + '\')"><i class="fas fa-trash"></i></button></td></tr>';
    }).join('');
    box.innerHTML =
      '<div class="glass-panel"><h3 class="panel-title"><i class="fas fa-truck"></i> إضافة / تعديل مورد</h3>' +
      '<input type="hidden" id="bx-sup-original"><div class="grid-3">' +
      bxInput('bx-sup-name', 'اسم المورد *') + bxInput('bx-sup-phone', 'رقم الهاتف') + bxInput('bx-sup-address', 'العنوان') +
      bxInput('bx-sup-email', 'البريد الإلكتروني') + bxInput('bx-sup-notes', 'ملاحظات') +
      '</div><div style="display:flex;gap:10px;margin-top:14px">' +
      '<button class="btn-magnetic btn-success" onclick="bxSaveSupplierUI()"><span class="btn-bg"></span><span class="btn-content"><i class="fas fa-check"></i> حفظ المورد</span></button>' +
      '<button class="btn-ghost" onclick="bxResetSupForm()">مسح</button></div></div>' +
      '<div class="glass-panel"><h3 class="panel-title"><i class="fas fa-list"></i> الموردون (' + _bxSupCache.length + ')</h3>' +
      (_bxSupCache.length ? '<div class="table-responsive"><table class="table-modern"><thead><tr><th>الاسم</th><th>الهاتف</th><th>العنوان</th><th>البريد</th><th>الرصيد المستحق</th><th>إجراءات</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state"><i class="fas fa-truck"></i> لا يوجد موردون بعد</div>') + '</div>';
  });
  function bxInput(id, lbl) { return '<div class="input-field"><input id="' + id + '" placeholder=" "><label>' + lbl + '</label><div class="input-border"></div></div>'; }
};
function bxResetSupForm() { ['bx-sup-original','bx-sup-name','bx-sup-phone','bx-sup-address','bx-sup-email','bx-sup-notes'].forEach(function (id) { var e = document.getElementById(id); if (e) e.value = ''; }); }
function bxEditSupplier(enc) {
  var s = _bxSupCache.find(function (x) { return x.name === decodeURIComponent(enc); }); if (!s) return;
  document.getElementById('bx-sup-original').value = s.name;
  document.getElementById('bx-sup-name').value = s.name;
  document.getElementById('bx-sup-phone').value = s.phone || '';
  document.getElementById('bx-sup-address').value = s.address || '';
  document.getElementById('bx-sup-email').value = s.email || '';
  document.getElementById('bx-sup-notes').value = s.notes || '';
}
async function bxSaveSupplierUI() {
  var sup = { name: document.getElementById('bx-sup-name').value.trim(), phone: document.getElementById('bx-sup-phone').value.trim(),
    address: document.getElementById('bx-sup-address').value.trim(), email: document.getElementById('bx-sup-email').value.trim(),
    notes: document.getElementById('bx-sup-notes').value.trim() };
  if (!sup.name) { showToast('اسم المورد مطلوب', 'error'); return; }
  var r = await bxPost('saveSupplier', { supplier: sup, originalName: document.getElementById('bx-sup-original').value });
  if (r.error) { showToast(r.error, 'error'); return; }
  showToast(r.message, 'success'); bxLog('حفظ مورد', sup.name, null, sup); bxResetSupForm(); BX_LOAD.suppliers();
}
async function bxDeleteSupplier(enc) {
  var name = decodeURIComponent(enc);
  var ok = await showConfirm({ title: 'حذف مورد', message: 'سيتم نقل "' + name + '" إلى سلة المحذوفات.', confirmText: 'حذف', cancelText: 'إلغاء', icon: 'fa-trash' });
  if (!ok) return;
  var r = await bxPost('trashSupplier', { name: name, user: currentUser.username });
  if (r.error) { showToast(r.error, 'error'); return; }
  showToast(r.message, 'success'); bxLog('حذف مورد', name); BX_LOAD.suppliers();
}
/* ── نافذة فاتورة الشراء ── */
var _bxPurchaseItems = [];
function bxOpenPurchaseModal(encSupplier) {
  _bxPurchaseItems = [];
  var m = document.getElementById('bx-purchase-modal');
  if (!m) { m = document.createElement('div'); m.id = 'bx-purchase-modal'; m.className = 'command-palette'; m.style.zIndex = '10001'; document.body.appendChild(m); }
  var opts = _bxSupCache.map(function (s) { return '<option value="' + escapeHtml(s.name) + '"' + (encSupplier && decodeURIComponent(encSupplier) === s.name ? ' selected' : '') + '>' + escapeHtml(s.name) + '</option>'; }).join('');
  var prodOpts = (window.inventoryCache || []).map(function (p) { return '<option value="' + escapeHtml(p.productName) + '">'; }).join('');
  m.innerHTML =
    '<div class="command-overlay" onclick="bxClosePurchaseModal()"></div>' +
    '<div class="command-modal" style="max-width:720px"><div style="padding:24px">' +
    '<h3 style="font-size:19px;font-weight:800;margin-bottom:16px"><i class="fas fa-cart-shopping" style="color:var(--brand-blue-bright)"></i> فاتورة شراء جديدة</h3>' +
    '<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:8px;margin-bottom:12px">' +
    '<select id="bx-pur-supplier" style="padding:10px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary);font-family:inherit">' + opts + '</select>' +
    '<input id="bx-pur-pname" list="bx-pur-prods" placeholder="المنتج" style="padding:10px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary)">' +
    '<datalist id="bx-pur-prods">' + prodOpts + '</datalist>' +
    '<input id="bx-pur-pqty" type="number" min="1" placeholder="الكمية" style="padding:10px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary)">' +
    '<input id="bx-pur-pcost" type="number" step="0.01" placeholder="التكلفة" style="padding:10px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary)">' +
    '<button class="btn-magnetic" onclick="bxAddPurchaseItem()"><span class="btn-bg"></span><span class="btn-content"><i class="fas fa-plus"></i></span></button></div>' +
    '<div id="bx-pur-items" style="max-height:220px;overflow:auto;margin-bottom:12px"></div>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">' +
    '<div><label style="font-size:11px;color:var(--text-tertiary)">الخصم</label><input id="bx-pur-discount" type="number" step="0.01" value="0" oninput="bxCalcPurchase()" style="width:100%;padding:8px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary)"></div>' +
    '<div><label style="font-size:11px;color:var(--text-tertiary)">الضريبة</label><input id="bx-pur-tax" type="number" step="0.01" value="0" oninput="bxCalcPurchase()" style="width:100%;padding:8px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary)"></div>' +
    '<div><label style="font-size:11px;color:var(--text-tertiary)">المدفوع</label><input id="bx-pur-paid" type="number" step="0.01" value="0" style="width:100%;padding:8px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary)"></div>' +
    '<div><label style="font-size:11px;color:var(--text-tertiary)">الإجمالي</label><div id="bx-pur-total" style="padding:8px;font-weight:800;font-family:var(--font-mono)">0.00 ج.م</div></div></div>' +
    '<div style="display:flex;gap:10px"><button class="btn-magnetic btn-success" style="flex:1" onclick="bxSavePurchaseUI()"><span class="btn-bg"></span><span class="btn-content"><i class="fas fa-check"></i> حفظ وتحديث المخزون</span></button>' +
    '<button class="btn-ghost" onclick="bxClosePurchaseModal()">إلغاء</button></div>' +
    '</div></div>';
  m.classList.remove('hidden'); bxRenderPurchaseItems();
}
function bxClosePurchaseModal() { var m = document.getElementById('bx-purchase-modal'); if (m) m.classList.add('hidden'); }
function bxAddPurchaseItem() {
  var name = document.getElementById('bx-pur-pname').value.trim();
  var qty = Number(document.getElementById('bx-pur-pqty').value) || 0;
  var cost = Number(document.getElementById('bx-pur-pcost').value) || 0;
  if (!name || qty <= 0) { showToast('أدخل المنتج والكمية', 'warning'); return; }
  var ex = _bxPurchaseItems.find(function (i) { return i.name === name; });
  if (ex) { ex.qty += qty; ex.cost = cost || ex.cost; } else _bxPurchaseItems.push({ name: name, qty: qty, cost: cost });
  document.getElementById('bx-pur-pname').value = ''; document.getElementById('bx-pur-pqty').value = ''; document.getElementById('bx-pur-pcost').value = '';
  bxRenderPurchaseItems(); bxCalcPurchase();
}
function bxRenderPurchaseItems() {
  var d = document.getElementById('bx-pur-items'); if (!d) return;
  d.innerHTML = _bxPurchaseItems.length ? _bxPurchaseItems.map(function (it, i) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:6px">' +
      '<span style="font-weight:600">' + escapeHtml(it.name) + '</span><span style="font-family:var(--font-mono)">' + it.qty + ' × ' + fmtMoney(it.cost) + ' = ' + fmtMoney(it.qty * it.cost) + ' ج.م</span>' +
      '<button onclick="_bxPurchaseItems.splice(' + i + ',1);bxRenderPurchaseItems();bxCalcPurchase()" style="background:none;border:none;color:var(--danger-bright);cursor:pointer"><i class="fas fa-trash"></i></button></div>';
  }).join('') : '<div class="empty-state" style="padding:14px">أضف منتجات للفاتورة</div>';
}
function bxCalcPurchase() {
  var total = _bxPurchaseItems.reduce(function (s, i) { return s + i.qty * i.cost; }, 0);
  var disc = Number((document.getElementById('bx-pur-discount') || {}).value) || 0;
  var tax = Number((document.getElementById('bx-pur-tax') || {}).value) || 0;
  var el = document.getElementById('bx-pur-total'); if (el) el.textContent = fmtMoney(Math.max(0, total - disc + tax)) + ' ج.م';
}
async function bxSavePurchaseUI() {
  var supplier = document.getElementById('bx-pur-supplier').value;
  if (!supplier) { showToast('اختر المورد', 'warning'); return; }
  if (!_bxPurchaseItems.length) { showToast('أضف منتجات', 'warning'); return; }
  showLoading();
  try {
    var r = await bxPost('savePurchase', { supplier: supplier, items: _bxPurchaseItems,
      discount: Number(document.getElementById('bx-pur-discount').value) || 0,
      tax: Number(document.getElementById('bx-pur-tax').value) || 0,
      paid: Number(document.getElementById('bx-pur-paid').value) || 0, user: currentUser.username });
    if (r.error) throw new Error(r.error);
    showToast(r.message + ' — المتبقي على المورد: ' + fmtMoney(r.remaining) + ' ج.م', 'success');
    bxLog('فاتورة شراء', supplier, null, { items: _bxPurchaseItems, total: r.total });
    bxClosePurchaseModal();
    if (window.loadInventory) loadInventory(true);
    BX_LOAD.suppliers();
  } catch (e) { showToast(e.message, 'error'); }
  hideLoading();
}

/* ═════════ 7) جرد المخزون ═════════ */
var _bxStocktakeRows = [];
BX_LOAD.stocktake = function () {
  var box = document.getElementById('stocktake-content'); if (!box) return;
  _bxStocktakeRows = [];
  box.innerHTML =
    '<div class="glass-panel"><h3 class="panel-title"><i class="fas fa-clipboard-check"></i> جرد المخزون بالباركود</h3>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">' +
    '<input id="bx-st-scan" placeholder="امسح الباركود أو اكتب اسم المنتج ثم Enter..." style="flex:1;min-width:220px;padding:12px;background:var(--bg-elevated);border:1px solid var(--brand-blue);border-radius:var(--radius-md);color:var(--text-primary);font-family:var(--font-mono)" autofocus>' +
    '<button class="btn-magnetic" onclick="bxOpenScanner()"><span class="btn-bg"></span><span class="btn-content"><i class="fas fa-qrcode"></i> Scan QR</span></button>' +
    '<button class="btn-ghost" onclick="bxStocktakeAddAll()"><i class="fas fa-boxes-stacked"></i> جرد شامل لكل المنتجات</button>' +
    '<button class="btn-magnetic btn-success" onclick="bxStocktakeSaveUI()"><span class="btn-bg"></span><span class="btn-content"><i class="fas fa-check"></i> حفظ الجرد والتسوية</span></button></div>' +
    '<div class="table-responsive"><table class="table-modern"><thead><tr><th>المنتج</th><th>الباركود</th><th>كمية النظام</th><th>الكمية الفعلية</th><th>الفرق</th><th></th></tr></thead><tbody id="bx-st-body"><tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-tertiary)">امسح باركود لبدء الجرد</td></tr></tbody></table></div></div>' +
    '<div class="glass-panel"><h3 class="panel-title"><i class="fas fa-history"></i> سجل الجرد السابق</h3><div id="bx-st-log"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i> تحميل...</div></div></div>';
  document.getElementById('bx-st-scan').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); bxStocktakeAdd(this.value); this.value = ''; }
  });
  bxGet('stocktakelog').then(function (log) {
    var d = document.getElementById('bx-st-log'); if (!d) return;
    if (!log.length) { d.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> لا يوجد جرد سابق</div>'; return; }
    d.innerHTML = '<div class="table-responsive" style="max-height:300px;overflow:auto"><table class="table-modern"><thead><tr><th>التاريخ</th><th>المنتج</th><th>النظام</th><th>الفعلي</th><th>الفرق</th><th>بواسطة</th></tr></thead><tbody>' +
      log.map(function (l) { return '<tr><td class="mono">' + escapeHtml(l.date) + '</td><td>' + escapeHtml(l.product) + '</td><td class="mono">' + l.system + '</td><td class="mono">' + l.actual + '</td><td style="font-family:var(--font-mono);color:' + (l.diff < 0 ? 'var(--danger-bright)' : 'var(--success-bright)') + '">' + (l.diff > 0 ? '+' : '') + l.diff + '</td><td>' + escapeHtml(l.user || '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  });
};
function bxStocktakeAdd(code) {
  code = String(code || '').trim(); if (!code) return;
  bxGet('lookup', { code: code }).then(function (r) {
    if (!r.found) { showToast('لم يتم العثور على: ' + code, 'warning'); return; }
    if (r.unlimited) { showToast('منتج خدمة — لا يُجرد', 'info'); return; }
    if (_bxStocktakeRows.find(function (x) { return x.name === r.name; })) { showToast('موجود بالفعل في قائمة الجرد', 'info'); return; }
    _bxStocktakeRows.push({ name: r.name, barcode: r.barcode, system: r.stock, actual: r.stock });
    bxRenderStocktake();
  });
}
function bxStocktakeAddAll() {
  bxGet('catalog').then(function (cat) {
    cat.forEach(function (p) {
      if (!p.unlimited && !_bxStocktakeRows.find(function (x) { return x.name === p.name; }))
        _bxStocktakeRows.push({ name: p.name, barcode: p.barcode, system: p.stock, actual: p.stock });
    });
    bxRenderStocktake();
  });
}
function bxRenderStocktake() {
  var b = document.getElementById('bx-st-body'); if (!b) return;
  if (!_bxStocktakeRows.length) { b.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-tertiary)">امسح باركود لبدء الجرد</td></tr>'; return; }
  b.innerHTML = _bxStocktakeRows.map(function (r, i) {
    var diff = r.actual - r.system;
    return '<tr><td style="font-weight:600">' + escapeHtml(r.name) + '</td><td class="mono" style="font-size:11px">' + escapeHtml(r.barcode || '—') + '</td>' +
      '<td class="mono">' + r.system + '</td>' +
      '<td><input type="number" value="' + r.actual + '" oninput="_bxStocktakeRows[' + i + '].actual=Number(this.value)||0;bxStocktakeDiff(' + i + ')" style="width:80px;padding:6px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-sm);color:var(--text-primary);font-family:var(--font-mono)"></td>' +
      '<td class="mono" id="bx-st-diff-' + i + '" style="font-weight:700;color:' + (diff === 0 ? 'var(--text-tertiary)' : (diff > 0 ? 'var(--success-bright)' : 'var(--danger-bright)')) + '">' + (diff > 0 ? '+' : '') + diff + '</td>' +
      '<td><button onclick="_bxStocktakeRows.splice(' + i + ',1);bxRenderStocktake()" style="background:none;border:none;color:var(--danger-bright);cursor:pointer"><i class="fas fa-times"></i></button></td></tr>';
  }).join('');
}
function bxStocktakeDiff(i) {
  var el = document.getElementById('bx-st-diff-' + i); if (!el) return;
  var d = _bxStocktakeRows[i].actual - _bxStocktakeRows[i].system;
  el.textContent = (d > 0 ? '+' : '') + d;
  el.style.color = d === 0 ? 'var(--text-tertiary)' : (d > 0 ? 'var(--success-bright)' : 'var(--danger-bright)');
}
async function bxStocktakeSaveUI() {
  var diffs = _bxStocktakeRows.filter(function (r) { return r.actual !== r.system; });
  if (!diffs.length) { showToast('لا توجد فروقات — الكميات مطابقة', 'info'); return; }
  var ok = await showConfirm({ title: 'حفظ الجرد', message: 'سيتم تسوية المخزون حسب الكميات الفعلية.', confirmText: 'حفظ وتسوية', cancelText: 'إلغاء', icon: 'fa-clipboard-check',
    details: [{ label: 'عدد الفروقات', value: diffs.length }] });
  if (!ok) return;
  showLoading();
  try {
    var r = await bxPost('stocktakeSave', { items: diffs, user: currentUser.username });
    if (r.error) throw new Error(r.error);
    showToast(r.message, 'success');
    bxLog('جرد مخزون', diffs.length + ' تسوية', null, diffs);
    _bxStocktakeRows = []; BX_LOAD.stocktake();
    if (window.loadInventory) loadInventory(true);
  } catch (e) { showToast(e.message, 'error'); }
  hideLoading();
}

/* ═════════ 8) إدارة الطابعات (Printing Manager) ═════════ */
function bxGetPrintSettings() { try { return JSON.parse(localStorage.getItem('bx_print') || '{}'); } catch (e) { return {}; } }
function bxSavePrintSettings(s) { localStorage.setItem('bx_print', JSON.stringify(s)); }
BX_LOAD.printers = function () {
  var box = document.getElementById('printers-content'); if (!box) return;
  var s = bxGetPrintSettings();
  function card(role, title, icon) {
    return '<div style="padding:18px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-lg)">' +
      '<div style="font-weight:800;margin-bottom:12px"><i class="fas ' + icon + '" style="color:var(--brand-blue-bright)"></i> ' + title + '</div>' +
      '<label style="font-size:11px;color:var(--text-tertiary)">اسم الطابعة (استرشادي)</label>' +
      '<input id="bx-pr-' + role + '" value="' + escapeHtml(s[role] || '') + '" placeholder="مثال: Epson TM-T20" style="width:100%;padding:10px;margin:6px 0 12px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary)">' +
      '<button class="btn-ghost" onclick="bxTestPrinter(\'' + role + '\')"><i class="fas fa-print"></i> اختبار الطابعة</button></div>';
  }
  box.innerHTML =
    '<div class="glass-panel"><h3 class="panel-title"><i class="fas fa-print"></i> إدارة الطابعات</h3>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">' +
    card('receipt', 'طابعة الفواتير', 'fa-receipt') + card('barcode', 'طابعة الباركود', 'fa-barcode') +
    card('report', 'طابعة التقارير', 'fa-file-lines') + card('kitchen', 'طابعة المطبخ (مستقبلًا)', 'fa-utensils') +
    '</div><button class="btn-magnetic btn-success" style="margin-top:16px" onclick="bxSavePrintersUI()"><span class="btn-bg"></span><span class="btn-content"><i class="fas fa-check"></i> حفظ إعدادات الطابعات</span></button>' +
    '<p style="font-size:12px;color:var(--text-tertiary);margin-top:14px"><i class="fas fa-circle-info"></i> في المتصفح/APK: الطباعة عبر نافذة النظام. في نسخة EXE يمكن ربط Hook مباشر عبر <code style="font-family:var(--font-mono)">window.EXE_PRINT</code>.</p></div>';
};
function bxSavePrintersUI() {
  var s = {};
  ['receipt','barcode','report','kitchen'].forEach(function (r) { var e = document.getElementById('bx-pr-' + r); if (e) s[r] = e.value.trim(); });
  bxSavePrintSettings(s); showToast('تم حفظ إعدادات الطابعات', 'success'); bxLog('حفظ إعدادات طابعات', null, null, s);
}
function bxTestPrinter(role) {
  if (role === 'barcode') { bxPrintLabels([{ name: 'اختبار الباركود', barcode: '2000000000004', price: 10, copies: 1 }], 'medium'); return; }
  bxPrintHTML('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Printer Test</title></head><body style="font-family:Tahoma;text-align:center;padding:30px"><h1>🖨️ اختبار طابعة ' + role + '</h1><p>ROR Print Store — ' + new Date().toLocaleString('ar-EG') + '</p></body></html>');
}

/* ═════════ 9) التحديث التلقائي (Auto Update) ═════════ */
function bxCheckUpdate() {
  if (!BX_CONFIG.autoUpdate || sessionStorage.getItem('bx_update_dismissed')) return;
  bxGet('version').then(function (v) {
    if (v.error || !v.version) return;
    if (v.version === BX_VERSION_CLIENT) return;
    var overlay = document.createElement('div'); overlay.className = 'command-palette'; overlay.style.zIndex = '10003';
    overlay.innerHTML =
      '<div class="command-overlay"></div><div class="command-modal" style="max-width:440px"><div style="padding:26px;text-align:center">' +
      '<div style="width:64px;height:64px;margin:0 auto 14px;background:rgba(59,130,246,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--brand-blue-bright);font-size:26px"><i class="fas fa-cloud-arrow-down"></i></div>' +
      '<h3 style="font-size:20px;font-weight:800;margin-bottom:6px">يتوفر تحديث جديد</h3>' +
      '<p style="color:var(--text-tertiary);font-size:13px;margin-bottom:14px">الإصدار الحالي: <b>' + BX_VERSION_CLIENT + '</b> → الجديد: <b style="color:var(--brand-blue-bright)">' + escapeHtml(v.version) + '</b>' + (v.updateSize ? ' | الحجم: ' + escapeHtml(v.updateSize) : '') + '</p>' +
      '<div style="background:var(--bg-surface);border-radius:var(--radius-md);padding:14px;font-size:13px;color:var(--text-secondary);margin-bottom:18px;text-align:right;white-space:pre-line">' + escapeHtml(v.changelog || '') + '</div>' +
      '<div style="display:flex;gap:10px"><button id="bx-upd-now" style="flex:1;padding:12px;background:var(--gradient-blue);border:none;border-radius:var(--radius-md);color:#fff;font-weight:700;cursor:pointer;font-family:inherit">تحديث الآن</button>' +
      '<button id="bx-upd-later" style="flex:1;padding:12px;background:var(--bg-hover);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary);font-weight:700;cursor:pointer;font-family:inherit">لاحقًا</button></div>' +
      '<p style="font-size:11px;color:var(--text-tertiary);margin-top:12px"><i class="fas fa-shield-halved"></i> يتم إنشاء نسخة احتياطية تلقائيًا قبل أي تحديث — بياناتك آمنة.</p>' +
      '</div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#bx-upd-later').onclick = function () { sessionStorage.setItem('bx_update_dismissed', '1'); overlay.remove(); };
    overlay.querySelector('#bx-upd-now').onclick = function () {
      overlay.remove();
      /* نسخة EXE: Hook للتطبيق المضيف (تنزيل + Backup + Rollback يتولاها الـ Shell) */
      if (window.EXE_APPLY_UPDATE && typeof window.EXE_APPLY_UPDATE === 'function') { window.EXE_APPLY_UPDATE(v); return; }
      /* ويب/APK: النسخة تُنشر من طرفك — إعادة تحميل بأحدث cache */
      bxPost('backup', { user: currentUser.username }).catch(function () {});
      showToast('جاري إعادة تحميل أحدث إصدار...', 'info');
      setTimeout(function () { location.reload(); }, 800);
    };
  }).catch(function () {});
}

/* ═════════ حقن الواجهة (Nav + Sections + أزرار) — ديناميكي بالكامل ═════════ */
function bxEnsureSection(id, icon, subtitle) {
  var main = document.querySelector('.main-content');
  var sec = document.getElementById(id);
  if (!sec) {
    if (!main) return;
    sec = document.createElement('section');
    sec.id = id; sec.className = 'section hidden-section';
    sec.innerHTML = '<div class="section-header"><div><h2>' + (BX_TITLES[id] || id) + '</h2><p>' + (subtitle || '') + '</p></div></div><div id="' + id + '-content"></div>';
    main.appendChild(sec);
    return;
  }
  /* قسم موجود مسبقًا في القالب: نُعلّق حاوية المحتوى ونخفي اللوحات التجريبية غير العاملة */
  if (!document.getElementById(id + '-content')) {
    var box = document.createElement('div'); box.id = id + '-content'; sec.appendChild(box);
  }
  Array.prototype.forEach.call(sec.children, function (ch) {
    if (ch.id === id + '-content') { ch.style.display = ''; return; }
    if (ch.classList && ch.classList.contains('section-header')) { ch.style.display = ''; return; }
    ch.style.display = 'none';
  });
}
function bxInjectNav() {
  var nav = document.querySelector('.sidebar-nav'); if (!nav) return;
  var items = [
    { id: 'suppliers', label: 'الموردين والمشتريات', icon: 'fa-truck', sub: 'إدارة الموردين وفواتير الشراء' },
    { id: 'stocktake', label: 'جرد المخزون', icon: 'fa-clipboard-check', sub: 'جرد بالباركود وتسوية الفروقات' },
    { id: 'barcode', label: 'طباعة الباركود', icon: 'fa-barcode', sub: 'EAN-13 / Code-128' },
    { id: 'activity', label: 'سجل النشاط', icon: 'fa-clock-rotate-left', sub: 'Audit Log كامل' },
    { id: 'recycle', label: 'سلة المحذوفات', icon: 'fa-trash-arrow-up', sub: 'استرجاع أو حذف نهائي' },
    { id: 'printers', label: 'الطابعات', icon: 'fa-print', sub: 'إدارة الطباعة' }
  ];
  items.forEach(function (it) {
    if (!BX_CONFIG.suppliers && it.id === 'suppliers') return;
    if (!BX_CONFIG.stocktake && it.id === 'stocktake') return;
    if (!BX_CONFIG.barcode && it.id === 'barcode') return;
    if (!BX_CONFIG.audit && it.id === 'activity') return;
    if (!BX_CONFIG.recycleBin && it.id === 'recycle') return;
    if (!BX_CONFIG.printManager && it.id === 'printers') return;
    bxEnsureSection(it.id, it.icon, it.sub);
    if (document.querySelector('.nav-item[data-section="' + it.id + '"]')) return;
    var el = document.createElement('div');
    el.className = 'nav-item'; el.setAttribute('data-section', it.id);
    el.innerHTML = '<div class="nav-icon-wrap"><i class="fas ' + it.icon + '"></i></div><span class="nav-label">' + it.label + '</span><div class="nav-active-bar"></div>';
    el.onclick = function () { showSection(it.id, el); };
    nav.appendChild(el);
  });
  if (window.applyPermissions) applyPermissions(); // إعادة تطبيق الصلاحيات على العناصر الجديدة
}
function bxInjectScanButtons() {
  if (!BX_CONFIG.qrScan) return;
  /* زر Topbar */
  var tr = document.querySelector('.topbar-right');
  if (tr && !document.getElementById('bx-scan-topbar')) {
    var b = document.createElement('button');
    b.id = 'bx-scan-topbar'; b.className = 'topbar-btn'; b.title = 'Scan QR';
    b.innerHTML = '<i class="fas fa-qrcode"></i>'; b.onclick = bxOpenScanner;
    tr.insertBefore(b, tr.firstChild);
  }
  /* زر داخل POS */
  var posSearch = document.getElementById('pos-search');
  if (posSearch && !document.getElementById('bx-scan-pos')) {
    var p = document.createElement('button');
    p.id = 'bx-scan-pos'; p.className = 'btn-ghost'; p.style.marginTop = '8px';
    p.innerHTML = '<i class="fas fa-qrcode"></i> Scan QR'; p.onclick = bxOpenScanner;
    posSearch.parentNode.insertBefore(p, posSearch.nextSibling);
  }
  /* Enter في بحث POS = lookup باركود فوري */
  if (posSearch && !posSearch.getAttribute('data-bx-bound')) {
    posSearch.setAttribute('data-bx-bound', '1');
    posSearch.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var v = this.value.trim(); if (v.length < 4) return;
      bxGet('lookup', { code: v }).then(function (r) {
        if (!r.found) return; // يترك السلوك الأصلي يعمل
        e.preventDefault(); e.stopPropagation();
        addToCart(encodeURIComponent(r.name), r.price, r.stock, r.unlimited);
        posSearch.value = '';
        document.getElementById('pos-search-results').classList.add('hidden');
      });
    });
  }
}

/* ═════════ Audit Wrappers — تسجيل العمليات دون تعديل الدوال الأصلية ═════════ */
function bxInstallAuditHooks() {
  if (!BX_CONFIG.audit) return;
  bxWrap('doLogin', async function (orig, args) {
    var u = (document.getElementById('login-user') || {}).value || '';
    var r = await orig.apply(null, args);
    try { if (r && r.success) bxPost('audit', { user: u, role: r.role || '', logAction: 'تسجيل دخول', entity: u }).catch(function () {}); } catch (e) {}
    return r;
  });
  bxWrap('doLogout', function (orig, args) {
    bxLog('تسجيل خروج', currentUser.username); return orig.apply(null, args);
  });
  bxWrap('addProduct', async function (orig, args) {
    var before = { name: (document.getElementById('new-product-name') || {}).value };
    var r = await orig.apply(null, args);
    if (r && !r.error) bxLog('إضافة منتج', before.name, null, before);
    /* توليد باركود تلقائي للمنتجات الجديدة */
    if (BX_CONFIG.autoBarcodeOnAdd && r && !r.error) bxPost('autoBarcode', {}).catch(function () {});
    return r;
  });
  bxWrap('saveProductEdit', async function (orig, args) {
    var name = (document.getElementById('edit-product-name') || {}).value;
    var before = (window.inventoryCache || []).find(function (p) { return p.productName === name; });
    var r = await orig.apply(null, args);
    if (r && !r.error) bxLog('تعديل منتج', name, before, {
      stock: (document.getElementById('edit-product-stock') || {}).value, price: (document.getElementById('edit-product-price') || {}).value
    });
    return r;
  });
  bxWrap('saveCurrentInvoice', async function (orig, args) {
    var inv = window.invoices ? (window.invoices.find(function (i) { return i.id === window.activeInvoiceId; }) || {}) : {};
    var r = await orig.apply(null, args);
    if (inv.saved) bxLog('إنشاء فاتورة', inv.customer || 'عميل نقدي', null, { serial: inv.serial, items: (inv.cart || []).length, total: (inv.cart || []).reduce(function (s, i) { return s + safeNum(i.total); }, 0) });
    return r;
  });
  bxWrap('saveExpense', async function (orig, args) {
    var d = (document.getElementById('exp-desc') || {}).value, a = (document.getElementById('exp-amount') || {}).value;
    var r = await orig.apply(null, args);
    bxLog('إضافة مصروف', d, null, { amount: a }); return r;
  });
  bxWrap('saveWaste', async function (orig, args) {
    var n = window.selectedWasteProduct ? window.selectedWasteProduct.name : '';
    var r = await orig.apply(null, args);
    bxLog('إضافة هالك', n); return r;
  });
  bxWrap('saveUser', async function (orig, args) {
    var u = (document.getElementById('user-name') || {}).value;
    var r = await orig.apply(null, args);
    if (r && !r.error) bxLog('تعديل مستخدم / صلاحيات', u); return r;
  });
  bxWrap('deleteUser', async function (orig, args) {
    var r = await orig.apply(null, args);
    if (r && !r.error) bxLog('حذف مستخدم', decodeURIComponent(args[0] || '')); return r;
  });
  bxWrap('recordCollectionPayment', async function (orig, args) {
    var cust = window.collectionStatement ? window.collectionStatement.customerName : '';
    var amt = (document.getElementById('coll-amount') || {}).value;
    var r = await orig.apply(null, args);
    bxLog('قبض', cust, null, { amount: amt }); return r;
  });
  bxWrap('generateShiftReport', async function (orig, args) {
    var f = (document.getElementById('shift-from') || {}).value, t = (document.getElementById('shift-to') || {}).value;
    var r = await orig.apply(null, args);
    bxLog('تقفيل شيفت', f + ' → ' + t); return r;
  });
  bxWrap('toggleUnlimited', async function (orig, args) {
    var r = await orig.apply(null, args);
    bxLog('تغيير نوع منتج', decodeURIComponent(args[0] || ''), null, { unlimited: args[1] }); return r;
  });
}

/* ═════════ اعتراض حذف الفواتير → سلة المحذوفات بدل الحذف المباشر ═════════ */
function bxInstallRecycleHooks() {
  if (!BX_CONFIG.recycleBin) return;
  bxWrap('confirmDeleteInvoice', async function (orig, args) {
    var rowId = args[0], customer = decodeURIComponent(args[1] || ''), total = args[2];
    var ok = await showConfirm({
      title: 'نقل إلى سلة المحذوفات', icon: 'fa-trash-arrow-up',
      message: 'سيتم نقل الفاتورة إلى سلة المحذوفات وإرجاع الكميات للمخزون. يمكنك استرجاعها لاحقًا.',
      confirmText: 'نقل للسلة', cancelText: 'إلغاء',
      details: [{ label: 'العميل', value: customer || '—' }, { label: 'قيمة الفاتورة', value: fmtMoney(total) + ' ج.م' }]
    });
    if (!ok) return;
    showLoading();
    try {
      var r = await bxPost('trashInvoice', { rowId: rowId, user: currentUser.username });
      if (r.error) throw new Error(r.error);
      showToast(r.message, 'success', '🗑️ سلة المحذوفات');
      bxLog('حذف فاتورة (للسلة)', customer, null, { rowId: rowId, total: total });
      var data = await apiGet('getInvoicesList', { limit: 100 });
      window.invoicesListCache = Array.isArray(data) ? data : [];
      if (window.renderInvoicesListOnly) renderInvoicesListOnly();
      if (window.loadDashboard) loadDashboard(true);
    } catch (e) { showToast('خطأ: ' + e.message, 'error'); }
    hideLoading();
  });
  /* زر حذف المنتج داخل نافذة التعديل (حقن إضافي) */
  bxWrap('openEditProduct', function (orig, args) {
    var r = orig.apply(null, args);
    setTimeout(function () {
      var modal = document.getElementById('edit-product-modal'); if (!modal || document.getElementById('bx-prod-del-btn')) return;
      var name = (document.getElementById('edit-product-name') || {}).value;
      var btn = document.createElement('button');
      btn.id = 'bx-prod-del-btn';
      btn.style.cssText = 'width:100%;margin-top:10px;padding:10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:var(--radius-md);color:var(--danger-bright);font-weight:700;cursor:pointer;font-family:inherit';
      btn.innerHTML = '<i class="fas fa-trash-arrow-up"></i> نقل المنتج لسلة المحذوفات';
      btn.onclick = async function () {
        var ok = await showConfirm({ title: 'حذف منتج', message: 'سيتم نقل "' + name + '" إلى سلة المحذوفات.', confirmText: 'نقل', cancelText: 'إلغاء', icon: 'fa-trash-arrow-up' });
        if (!ok) return;
        showLoading();
        bxPost('trashProduct', { name: name, user: currentUser.username }).then(function (res) {
          hideLoading();
          if (res.error) { showToast(res.error, 'error'); return; }
          showToast(res.message, 'success'); bxLog('حذف منتج (للسلة)', name);
          closeEditProductModal(); loadInventory(true);
        }).catch(function (e) { hideLoading(); showToast(e.message, 'error'); });
      };
      modal.querySelector('.command-modal > div').appendChild(btn);
      /* حقل باركود داخل نافذة التعديل */
      bxGet('catalog').then(function (cat) {
        var p = (cat || []).find(function (x) { return x.name === name; }); if (!p) return;
        var wrap = document.createElement('div'); wrap.className = 'input-field'; wrap.style.marginTop = '10px';
        wrap.innerHTML = '<i class="fas fa-barcode input-icon"></i><input type="text" id="bx-edit-barcode" value="' + escapeHtml(p.barcode || '') + '" placeholder=" "><label>الباركود (يدوي)</label><div class="input-border"></div>' +
          '<button style="margin-top:8px;padding:6px 12px;background:var(--bg-hover);border:1px solid var(--border-default);border-radius:var(--radius-sm);color:var(--text-primary);font-size:12px;cursor:pointer;font-family:inherit" onclick="bxSaveBarcodeFromEdit(\'' + encodeURIComponent(name) + '\')"><i class="fas fa-floppy-disk"></i> حفظ الباركود</button>';
        modal.querySelector('.command-modal > div').insertBefore(wrap, btn);
      });
    }, 250);
    return r;
  });
}
async function bxSaveBarcodeFromEdit(enc) {
  var name = decodeURIComponent(enc);
  var code = (document.getElementById('bx-edit-barcode') || {}).value.trim();
  var r = await bxPost('setBarcode', { name: name, code: code });
  if (r.error) { showToast(r.error, 'error'); return; }
  showToast('تم حفظ الباركود ✅', 'success'); bxLog('تعديل باركود', name, null, { code: code });
}

/* ═════════ لف showSection لعناوين الأقسام الجديدة + قائمة الأوامر ═════════ */
function bxInstallSectionHook() {
  var orig = window.showSection; if (!orig || orig._bxWrapped) return;
  var wrapped = function (id, el) {
    orig(id, el);
    if (BX_TITLES[id]) { var t = document.getElementById('page-title'); if (t) t.textContent = BX_TITLES[id]; }
    if (BX_LOAD[id]) BX_LOAD[id]();
    if (id === 'pos') setTimeout(bxInjectScanButtons, 300);
  };
  wrapped._bxWrapped = true;
  window.showSection = wrapped;
}
function bxInstallCommands() {
  if (!window.COMMANDS) return;
  var extra = [
    { id: 'bx-suppliers', permission: null, title: 'الموردين والمشتريات', desc: 'إدارة الموردين وفواتير الشراء', icon: 'fa-truck', action: function () { showSection('suppliers', document.querySelector('[data-section="suppliers"]')); } },
    { id: 'bx-stocktake', permission: null, title: 'جرد المخزون', desc: 'جرد بالباركود وتسوية الفروقات', icon: 'fa-clipboard-check', action: function () { showSection('stocktake', document.querySelector('[data-section="stocktake"]')); } },
    { id: 'bx-barcode', permission: null, title: 'طباعة الباركود', desc: 'طباعة ملصقات EAN-13 / Code-128', icon: 'fa-barcode', action: function () { showSection('barcode', document.querySelector('[data-section="barcode"]')); } },
    { id: 'bx-activity', permission: null, title: 'سجل النشاط', desc: 'Audit Log — بحث وتصدير', icon: 'fa-clock-rotate-left', action: function () { showSection('activity', document.querySelector('[data-section="activity"]')); } },
    { id: 'bx-recycle', permission: null, title: 'سلة المحذوفات', desc: 'استرجاع أو حذف نهائي', icon: 'fa-trash-arrow-up', action: function () { showSection('recycle', document.querySelector('[data-section="recycle"]')); } },
    { id: 'bx-scan', permission: null, title: 'Scan QR', desc: 'مسح QR / باركود بالكاميرا', icon: 'fa-qrcode', action: bxOpenScanner },
    { id: 'bx-backup', permission: null, title: 'نسخة احتياطية الآن', desc: 'حفظ بيانات النظام على Drive', icon: 'fa-database', action: function () {
      showLoading();
      bxPost('backup', { user: currentUser.username }).then(function (r) { hideLoading(); if (r.error) { showToast(r.error, 'error'); return; } showToast('تم إنشاء النسخة الاحتياطية: ' + r.name, 'success'); bxLog('نسخة احتياطية', r.name); }).catch(function (e) { hideLoading(); showToast(e.message, 'error'); });
    } }
  ];
  extra.forEach(function (c) { if (!COMMANDS.find(function (x) { return x.id === c.id; })) COMMANDS.push(c); });
}
/* ═══ (1) باركود المصنع: خانة داخل فورم إضافة المنتج ═══ */
(function bxManufacturerBarcode() {
  if (!BX_CONFIG.barcode) return;
  function injectField() {
    if (document.getElementById('new-product-barcode')) return;
    var anchor = document.getElementById('new-product-name');
    if (!anchor) { setTimeout(injectField, 700); return; }
    var host = anchor.closest('.input-field'); if (!host) return;
    var wrap = document.createElement('div'); wrap.className = 'input-field';
    wrap.innerHTML = '<i class="fas fa-barcode input-icon"></i>' +
      '<input type="text" id="new-product-barcode" placeholder=" " autocomplete="off" />' +
      '<label>باركود المصنع (اختياري — أو امسحه بالسكانر هنا)</label><div class="input-border"></div>';
    host.parentNode.insertBefore(wrap, host.nextSibling);
  }
  window.addEventListener('DOMContentLoaded', function () { setTimeout(injectField, 900); });

  /* بعد الإضافة: لو فيه كود مصنع → اربطه بدل الكود التلقائي */
  bxWrap('addProduct', async function (orig, args) {
    var nameEl = document.getElementById('new-product-name');
    var codeEl = document.getElementById('new-product-barcode');
    var name = nameEl ? nameEl.value.trim() : '';
    var code = codeEl ? codeEl.value.trim() : '';
    var r = await orig.apply(null, args);
    if (codeEl) codeEl.value = '';
    if (r && !r.error && name && code) {
      var res = await bxPost('setBarcode', { name: name, code: code });
      if (res.error) showToast(res.error + ' — تقدر تصلحه من زر تعديل', 'warning');
      else { showToast('تم ربط باركود المصنع بالمنتج ✅', 'success', '🏷️ باركود'); bxLog('ربط باركود مصنع', name, null, { code: code }); }
    }
    return r;
  });
})();
/* ═════════ الإقلاع ═════════ */
window.addEventListener('DOMContentLoaded', function () {
  setTimeout(function () {
    try {
      bxInstallSectionHook();
      bxInjectNav();
      bxInjectScanButtons();
      bxInstallCommands();
      bxInstallAuditHooks();
      bxInstallRecycleHooks();
      setTimeout(bxCheckUpdate, 2500);
      /* توليد باركود للمنتجات القديمة مرة واحدة يوميًا (بدون إبطاء) */
      if (BX_CONFIG.autoBarcodeOnAdd && !localStorage.getItem('bx_last_autobarcode') !== new Date().toDateString()) {
        localStorage.setItem('bx_last_autobarcode', new Date().toDateString());
      }
    } catch (e) { console.error('BX init error:', e); }
  }, 900);
});
/* ═══ (2) سجل النشاط — نسخة مصحّحة (باراميتر act + أزرار مربوطة + رسائل خطأ ظاهرة) ═══ */
BX_LOAD.activity = function () {
  var box = document.getElementById('activity-content'); if (!box) return;
  box.innerHTML =
    '<div class="glass-panel">' +
    '<h3 class="panel-title"><i class="fas fa-clock-rotate-left"></i> سجل النشاط (Audit Log)</h3>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">' +
    '<input id="bx-aud-q" placeholder="بحث (مستخدم / منتج / تفاصيل)..." style="flex:1;min-width:150px;padding:10px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary)">' +
    '<select id="bx-aud-action" style="padding:10px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary);font-family:inherit"><option value="">كل العمليات</option>' +
    ['تسجيل دخول','تسجيل خروج','إضافة منتج','تعديل منتج','حذف منتج','استرجاع','إنشاء فاتورة','حذف فاتورة','إضافة مصروف','إضافة هالك','قبض','تعديل مستخدم','حذف مستخدم','تقفيل شيفت','فاتورة شراء','جرد','طباعة باركود','مسح QR/باركود'].map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select>' +
    '<input id="bx-aud-from" type="date" style="padding:10px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary)">' +
    '<input id="bx-aud-to" type="date" style="padding:10px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary)">' +
    '<button id="bx-aud-apply" class="btn-magnetic"><span class="btn-bg"></span><span class="btn-content"><i class="fas fa-filter"></i> تطبيق</span></button>' +
    '<button id="bx-aud-csv" class="btn-ghost"><i class="fas fa-file-excel"></i> Excel</button>' +
    '<button id="bx-aud-pdf" class="btn-ghost"><i class="fas fa-file-pdf"></i> PDF</button>' +
    '</div><div id="bx-aud-table"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div></div></div>';
  document.getElementById('bx-aud-apply').addEventListener('click', bxLoadAudit);   // ربط مباشر مضمون
  document.getElementById('bx-aud-csv').addEventListener('click', bxExportAuditCSV);
  document.getElementById('bx-aud-pdf').addEventListener('click', bxExportAuditPDF);
  document.getElementById('bx-aud-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') bxLoadAudit(); });
  bxLoadAudit();
};

function bxLoadAudit() {
  var t = document.getElementById('bx-aud-table');
  if (t) t.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
  var p = {
    q:    ((document.getElementById('bx-aud-q') || {}).value || '').trim(),
    act:  ((document.getElementById('bx-aud-action') || {}).value || ''),
    from: ((document.getElementById('bx-aud-from') || {}).value || ''),
    to:   ((document.getElementById('bx-aud-to') || {}).value || '')
  };
  bxGet('audit', p).then(function (rows) {
    if (!t) return;
    if (rows && rows.error) { _bxAuditCache = []; t.innerHTML = '<div class="empty-state"><i class="fas fa-triangle-exclamation"></i> ' + escapeHtml(rows.error) + '</div>'; showToast('سجل النشاط: ' + rows.error, 'error'); return; }
    _bxAuditCache = Array.isArray(rows) ? rows : [];
    if (!_bxAuditCache.length) { t.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> لا توجد سجلات مطابقة للفلاتر دي</div>'; return; }
    t.innerHTML = '<div class="table-responsive" style="max-height:60vh;overflow:auto"><table class="table-modern"><thead><tr><th>التاريخ</th><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>الكيان</th><th>تفاصيل</th></tr></thead><tbody>' +
      _bxAuditCache.map(function (r) {
        var tip = (r.before || r.after) ? ' title="قبل: ' + escapeHtml(String(r.before || '—').slice(0, 300)) + '\nبعد: ' + escapeHtml(String(r.after || '—').slice(0, 300)) + '"' : '';
        return '<tr' + tip + '><td class="mono">' + escapeHtml(r.date) + '</td><td class="mono">' + escapeHtml(r.time || '') + '</td><td style="font-weight:600">' + escapeHtml(r.user || '—') + ' <span style="font-size:10px;color:var(--text-tertiary)">(' + escapeHtml(r.role || '') + ')</span></td><td><span class="badge badge-blue">' + escapeHtml(r.action) + '</span></td><td>' + escapeHtml(r.entity || '—') + '</td><td style="font-size:12px;color:var(--text-tertiary)">' + escapeHtml(r.details || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }).catch(function (e) { if (t) t.innerHTML = '<div class="empty-state"><i class="fas fa-triangle-exclamation"></i> ' + escapeHtml(e.message) + '</div>'; });
}
/* ═══ (3) إضافة منتج جديد بمسح باركود المصنع ═══ */
(function bxScanToAddModule() {
  if (!BX_CONFIG.barcode) return;

  /* حقن الزر في شاشة المخزون + أمر في Ctrl+K */
  function injectBtn() {
    if (document.getElementById('bx-scan-add-btn')) return;
    var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
    var addBtn = btns.find(function (b) {
      var t = ((b.getAttribute('onclick') || '') + ' ' + (b.textContent || ''));
      return t.indexOf('addProduct') !== -1 || t.indexOf('إضافة المنتج') !== -1;
    });
    if (!addBtn || !addBtn.parentNode) { setTimeout(injectBtn, 900); return; }
    var b = document.createElement('button');
    b.id = 'bx-scan-add-btn'; b.type = 'button'; b.className = 'btn-magnetic'; b.style.marginTop = '8px';
    b.innerHTML = '<span class="btn-bg" style="background:linear-gradient(135deg,#06b6d4,#0e7490)"></span><span class="btn-content"><i class="fas fa-barcode"></i> <span>منتج جديد بالسكانر</span></span>';
    b.onclick = bxOpenScanToAdd;
    addBtn.parentNode.insertBefore(b, addBtn.nextSibling);
  }
  window.addEventListener('DOMContentLoaded', function () { setTimeout(injectBtn, 1000); });
  if (window.COMMANDS && !COMMANDS.find(function (c) { return c.id === 'bx-scan-add'; })) {
    COMMANDS.push({ id: 'bx-scan-add', permission: null, title: 'إضافة منتج بمسح الباركود', desc: 'سكانر باركود المصنع ثم إدخال البيانات والحفظ', icon: 'fa-barcode', action: function () { bxOpenScanToAdd(); } });
  }

  /* 1) فتح الماسح وتحويل النتيجة لنموذج الإضافة — Wrapper بدون تعديل الكود الأصلي */
  window.bxOpenScanToAdd = function () {
    var orig = window.bxHandleScan;
    window.bxHandleScan = function (text) {
      window.bxHandleScan = orig; // استرجاع السلوك الأصلي فورًا
      bxOpenProductWithBarcode(String(text || '').trim());
    };
    bxOpenScanner();
  };

  /* 2) نموذج الإضافة (يدعم سكانر USB: امسح في الخانة الزرقاء + Enter) */
  function bxOpenProductWithBarcode(code) {
    var m = document.getElementById('bx-scan-add-modal');
    if (!m) { m = document.createElement('div'); m.id = 'bx-scan-add-modal'; m.className = 'command-palette'; m.style.zIndex = '10002'; document.body.appendChild(m); }
    m.innerHTML =
      '<div class="command-overlay" onclick="bxCloseScanAdd()"></div>' +
      '<div class="command-modal" style="max-width:520px"><div style="padding:24px">' +
      '<h3 style="font-size:20px;font-weight:800;margin-bottom:4px"><i class="fas fa-barcode" style="color:#06b6d4"></i> منتج جديد بباركود المصنع</h3>' +
      '<p style="color:var(--text-tertiary);font-size:12px;margin-bottom:16px">امسح بجهاز USB مباشرة في الخانة الزرقاء، أو بالكاميرا من "إعادة المسح"</p>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px">' +
      '<input id="bx-sa-code" dir="ltr" value="' + escapeHtml(code || '') + '" placeholder="وجّه السكانر هنا..." style="flex:1;padding:12px;background:rgba(6,182,212,0.08);border:1px solid #06b6d4;border-radius:var(--radius-md);color:var(--text-primary);font-family:var(--font-mono);font-weight:700">' +
      '<button class="btn-ghost" onclick="bxCloseScanAdd();bxOpenScanToAdd()"><i class="fas fa-qrcode"></i> إعادة المسح</button>' +
      '<button class="btn-ghost" onclick="bxSaCodeConfirm()"><i class="fas fa-check"></i> تأكيد</button></div>' +
      '<div id="bx-sa-exists" class="hidden" style="margin-bottom:12px;padding:10px 14px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:var(--radius-md);font-size:12px;color:#fbbf24"></div>' +
      '<div class="input-field"><i class="fas fa-box input-icon"></i><input id="bx-sa-name" placeholder=" "><label>اسم المنتج *</label><div class="input-border"></div></div>' +
      '<div style="height:12px"></div><div class="grid-2">' +
      '<div class="input-field"><i class="fas fa-cubes input-icon"></i><input id="bx-sa-qty" type="number" placeholder=" "><label>الكمية</label><div class="input-border"></div></div>' +
      '<div class="input-field"><i class="fas fa-tag input-icon"></i><input id="bx-sa-price" type="number" step="0.01" placeholder=" "><label>سعر البيع</label><div class="input-border"></div></div>' +
      '<div class="input-field"><i class="fas fa-coins input-icon"></i><input id="bx-sa-cost" type="number" step="0.01" placeholder=" "><label>سعر التكلفة</label><div class="input-border"></div></div>' +
      '<div class="input-field"><i class="fas fa-tags input-icon"></i><input id="bx-sa-cat" list="category-suggestions" placeholder=" "><label>التصنيف (اختياري)</label><div class="input-border"></div></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:18px">' +
      '<button class="btn-magnetic btn-success" style="flex:1" onclick="bxSaveScanAdd()"><span class="btn-bg"></span><span class="btn-content"><i class="fas fa-check"></i> حفظ وربط الباركود</span></button>' +
      '<button class="btn-ghost" onclick="bxCloseScanAdd()">إلغاء</button></div>' +
      '</div></div>';
    m.classList.remove('hidden');
    var codeInput = document.getElementById('bx-sa-code');
    codeInput.focus();
    codeInput.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); bxSaCodeConfirm(); } };
    if (code) bxSaCodeConfirm();
  }
  window.bxOpenProductWithBarcode = bxOpenProductWithBarcode;
  window.bxCloseScanAdd = function () { var m = document.getElementById('bx-scan-add-modal'); if (m) m.classList.add('hidden'); };

  /* 3) فحص الباركود: جديد أم مسجل؟ (منع التكرار قبل الحفظ) */
  window.bxSaCodeConfirm = function () {
    var code = ((document.getElementById('bx-sa-code') || {}).value || '').trim();
    var box = document.getElementById('bx-sa-exists'); if (!box) return;
    if (!code) { box.classList.add('hidden'); return; }
    bxGet('lookup', { code: code }).then(function (r) {
      if (r && r.found) {
        box.classList.remove('hidden');
        box.innerHTML = '<i class="fas fa-circle-info"></i> الباركود مسجل بالفعل للمنتج: <strong>' + escapeHtml(r.name) + '</strong> — الحفظ هيضيف الكمية لنفس المنتج.';
        var nameEl = document.getElementById('bx-sa-name');
        if (nameEl && !nameEl.value) nameEl.value = r.name;
      } else box.classList.add('hidden');
    });
  };

  /* 4) الحفظ: إضافة المنتج + ربط باركود المصنع + حماية من التكرار */
  window.bxSaveScanAdd = async function () {
    var code = ((document.getElementById('bx-sa-code') || {}).value || '').trim();
    var name = ((document.getElementById('bx-sa-name') || {}).value || '').trim();
    var qty = Number(((document.getElementById('bx-sa-qty') || {}).value)) || 0;
    var price = Number(((document.getElementById('bx-sa-price') || {}).value)) || 0;
    var cost = Number(((document.getElementById('bx-sa-cost') || {}).value)) || 0;
    var cat = ((document.getElementById('bx-sa-cat') || {}).value || '').trim();
    if (!name) { showToast('اكتب اسم المنتج', 'warning'); return; }
    showLoading();
    try {
      var sameProduct = false;
      if (code) {
        var pre = await bxGet('lookup', { code: code });
        if (pre && pre.found) {
          if (pre.name !== name) throw new Error('الباركود مسجل بالفعل لمنتج آخر: "' + pre.name + '"');
          sameProduct = true; // نفس المنتج → إضافة كمية فقط
        }
      }
      var r = await apiPost('addProduct', { product: { name: name, stock: qty, price: price, originalPrice: cost, category: cat } });
      if (r.error) throw new Error(r.error);
      if (code && !sameProduct) {
        var b = await bxPost('setBarcode', { name: name, code: code });
        if (b.error) showToast(r.message + ' — تنبيه: ' + b.error, 'warning');
        else showToast('تم حفظ المنتج وربط باركود المصنع ✅', 'success', '🏷️ باركود');
      } else showToast(sameProduct ? 'تم إضافة الكمية للمنتج الموجود ✅' : (r.message || 'تم الحفظ ✅'), 'success');
      bxLog('إضافة منتج بباركود مصنع', name, null, { code: code, qty: qty });
      bxCloseScanAdd();
      if (window.loadInventory) loadInventory(true);
    } catch (e) { showToast('خطأ: ' + e.message, 'error'); }
    hideLoading();
  };
})();
/* ═══ (4) تحديث تلقائي من GitHub — يتجاوز الكاش ═══ */
var BX_GITHUB_RAW = 'var BX_GITHUB_RAW = "https://raw.githubusercontent.com/anaaho613-beep/-/main/version.json";'; // ← بياناتك

window.bxCheckUpdate = function () {
  if (!BX_CONFIG.autoUpdate || sessionStorage.getItem('bx_update_dismissed')) return;
  fetch(BX_GITHUB_RAW + '?t=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (v) {
      if (!v || !v.version || v.version === BX_VERSION_CLIENT) return;
      var ov = document.createElement('div'); ov.className = 'command-palette'; ov.style.zIndex = '10003';
      ov.innerHTML = '<div class="command-overlay"></div><div class="command-modal" style="max-width:430px"><div style="padding:26px;text-align:center">' +
        '<div style="width:64px;height:64px;margin:0 auto 14px;background:rgba(59,130,246,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--brand-blue-bright);font-size:26px"><i class="fas fa-cloud-arrow-down"></i></div>' +
        '<h3 style="font-size:20px;font-weight:800;margin-bottom:6px">يتوفر تحديث جديد</h3>' +
        '<p style="color:var(--text-tertiary);font-size:13px;margin-bottom:14px">الحالي: ' + BX_VERSION_CLIENT + ' ← الجديد: <b style="color:var(--brand-blue-bright)">' + v.version + '</b></p>' +
        '<div style="background:var(--bg-surface);border-radius:var(--radius-md);padding:14px;font-size:13px;margin-bottom:18px;text-align:right;white-space:pre-line">' + escapeHtml(v.changelog || '') + '</div>' +
        '<div style="display:flex;gap:10px"><button id="bx-upd-now" style="flex:1;padding:12px;background:var(--gradient-blue);border:none;border-radius:var(--radius-md);color:#fff;font-weight:700;cursor:pointer;font-family:inherit">تحديث الآن</button>' +
        '<button id="bx-upd-later" style="flex:1;padding:12px;background:var(--bg-hover);border:1px solid var(--border-default);border-radius:var(--radius-md);color:var(--text-primary);font-weight:700;cursor:pointer;font-family:inherit">لاحقًا</button></div>' +
        '</div></div>';
      document.body.appendChild(ov);
      ov.querySelector('#bx-upd-later').onclick = function () { sessionStorage.setItem('bx_update_dismissed', '1'); ov.remove(); };
      ov.querySelector('#bx-upd-now').onclick = function () {
        ov.remove();
        if (window.EXE_APPLY_UPDATE) { window.EXE_APPLY_UPDATE(v); return; }
        location.href = location.pathname + '?v=' + v.version; // إعادة تحميل قسرية تتجاوز الكاش
      };
    }).catch(function () {});
};
/* تسجيل الدوال الجديدة على window (نفس نمط المشروع) */
window.bxOpenScanner = bxOpenScanner; window.bxCloseScanner = bxCloseScanner; window.bxHandleScan = bxHandleScan;
window.bxSelectAllLabels = bxSelectAllLabels; window.bxPrintSelectedLabels = bxPrintSelectedLabels; window.bxGenOneBarcode = bxGenOneBarcode;
window.bxLoadAudit = bxLoadAudit; window.bxExportAuditCSV = bxExportAuditCSV; window.bxExportAuditPDF = bxExportAuditPDF;
window.bxRestoreUI = bxRestoreUI; window.bxPurgeUI = bxPurgeUI; window.bxPurgeAllUI = bxPurgeAllUI;
window.bxSaveSupplierUI = bxSaveSupplierUI; window.bxEditSupplier = bxEditSupplier; window.bxDeleteSupplier = bxDeleteSupplier; window.bxResetSupForm = bxResetSupForm;
window.bxOpenPurchaseModal = bxOpenPurchaseModal; window.bxClosePurchaseModal = bxClosePurchaseModal; window.bxAddPurchaseItem = bxAddPurchaseItem; window.bxSavePurchaseUI = bxSavePurchaseUI; window.bxCalcPurchase = bxCalcPurchase;
window.bxStocktakeAddAll = bxStocktakeAddAll; window.bxStocktakeSaveUI = bxStocktakeSaveUI;
window.bxSavePrintersUI = bxSavePrintersUI; window.bxTestPrinter = bxTestPrinter;
window.bxSaveBarcodeFromEdit = bxSaveBarcodeFromEdit;