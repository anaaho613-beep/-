// =====⚠️ تأكد إن الرابط ده = رابط الـ Web App النشط عندك =====
const API_URL = 'https://script.google.com/macros/s/AKfycbz_EfSvxZ7PqK8sI_gfKEBER3FVE_Lu42HDZsC9XR9qw9zkmNCmkIU88x8l-IPrrOPc/exec';
const RECEIPT_CONFIG = {
storeName: 'الأصلي لقطع الغيار', storeTagline: 'الأصلي لقطع الغيار',
storeAddress: 'العنوان: السويس', storePhone: '01000000000',
welcomeMsg: 'شرفتونا', logoUrl: '', priceDecimals: 2, paperWidth: '80mm', receiptStart: 1, currency: 'ج.م'
};
const PERMISSIONS = [
{ id: 'dashboard', name: 'لوحة التحكم', icon: 'fa-grid-2' },
{ id: 'pos', name: 'نقطة البيع', icon: 'fa-cash-register' },
{ id: 'inventory', name: 'المخزون', icon: 'fa-boxes-stacked' },
{ id: 'customers', name: 'كشف حساب', icon: 'fa-users' },
{ id: 'collections', name: 'القبض', icon: 'fa-hand-holding-dollar' },
{ id: 'expenses', name: 'المصروفات', icon: 'fa-receipt' },
{ id: 'waste', name: 'الهالك', icon: 'fa-trash-can' },
{ id: 'reports', name: 'التقارير', icon: 'fa-chart-mixed' },
{ id: 'users', name: 'إدارة المستخدمين', icon: 'fa-user-shield' },
{ id: 'shift', name: 'تقفيل الشيفت', icon: 'fa-calculator' }
];
const MONTH_NAMES = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
let charts = {};
let selectedWasteProduct = null;
let currentSection = 'dashboard';
let currentUser = { username: '', role: 'employee', permissions: [] };
let usersCache = [];
let invoices = [];
let activeInvoiceId = null;
let customersCache = [];
let customerFilter = 'all';
let posSearchTimer = null;
let wasteSearchTimer = null;
let collectionStatement = null;
window.addEventListener('DOMContentLoaded', function () {
var savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
var icon = document.querySelector('#theme-toggle i');
if (icon) icon.className = savedTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
updateGreeting(); updateDateTime(); setInterval(updateDateTime, 1000);
initCardEffects(); initKeyboardShortcuts(); initPeriodTabs();
renderPermissionsCheckboxes([]); toggleRolePermissions();
initInvoices(); checkSession();
});
function safeNum(v) { return Number(v) || 0; }
function safeArray(arr) { return Array.isArray(arr) && arr.length ? arr : [0]; }
function fmtMoney(v) { return safeNum(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function escapeHtml(text) { return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function toggleTheme() {
var html = document.documentElement;
var newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
html.setAttribute('data-theme', newTheme); localStorage.setItem('theme', newTheme);
var icon = document.querySelector('#theme-toggle i');
if (icon) icon.className = newTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
updateChartsTheme();
}
function updateChartsTheme() {
var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
var textColor = isDark ? '#a1a1aa' : '#52525b';
var gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
Object.values(charts).forEach(function (chart) {
if (chart && chart.updateOptions) chart.updateOptions({ theme: { mode: isDark ? 'dark' : 'light' }, chart: { foreColor: textColor, background: 'transparent' }, grid: { borderColor: gridColor } });
});
}
function updateGreeting() {
var hour = new Date().getHours(); var greeting = 'مساء الخير 🌙';
if (hour < 12) greeting = 'صباح الخير ☀️'; else if (hour < 17) greeting = 'نهارك سعيد 🌤️'; else if (hour < 21) greeting = 'مساء الخير 🌆';
var el = document.getElementById('greeting'); if (el) el.textContent = greeting;
}
function updateDateTime() {
var now = new Date();
var timeEl = document.getElementById('live-time');
if (timeEl) timeEl.textContent = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
var dateEl = document.getElementById('current-date');
if (dateEl) dateEl.textContent = now.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
}
function initCardEffects() {
if (window._cardFx) return; window._cardFx = true;
document.querySelectorAll('.bento-card').forEach(function (card) {
var rafId = null;
card.addEventListener('mousemove', function (e) {
if (rafId) return;
rafId = requestAnimationFrame(function () {
var rect = card.getBoundingClientRect(); var x = e.clientX - rect.left, y = e.clientY - rect.top;
card.style.setProperty('--mouse-x', ((x / rect.width) * 100) + '%');
card.style.setProperty('--mouse-y', ((y / rect.height) * 100) + '%');
if (card.hasAttribute('data-tilt')) {
var rotateX = (y - rect.height / 2) / 20, rotateY = (rect.width / 2 - x) / 20;
card.style.transform = 'perspective(1000px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg) translateY(-4px)';
}
rafId = null;
});
}, { passive: true });
card.addEventListener('mouseleave', function () { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } card.style.transform = ''; }, { passive: true });
});
}
function initKeyboardShortcuts() {
document.addEventListener('keydown', function (e) {
if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openCommandPalette(); }
if (e.key === 'Escape') { closeCommandPalette(); closeCustomerModal(); }
});
}
var COMMANDS = [
{ id: 'dashboard', permission: 'dashboard', title: 'لوحة التحكم', desc: 'العودة للوحة التحكم', icon: 'fa-grid-2', action: function () { showSection('dashboard', document.querySelector('[data-section="dashboard"]')); } },
{ id: 'pos', permission: 'pos', title: 'نقطة البيع', desc: 'إضافة عملية بيع جديدة', icon: 'fa-cash-register', action: function () { showSection('pos', document.querySelector('[data-section="pos"]')); } },
{ id: 'inventory', permission: 'inventory', title: 'المخزون', desc: 'إدارة المنتجات', icon: 'fa-boxes-stacked', action: function () { showSection('inventory', document.querySelector('[data-section="inventory"]')); } },
{ id: 'customers', permission: 'customers', title: 'كشف حساب', desc: 'كشف حساب العملاء', icon: 'fa-users', action: function () { showSection('customers', document.querySelector('[data-section="customers"]')); } },
{ id: 'collections', permission: 'collections', title: 'القبض', desc: 'تسجيل دفعات العملاء', icon: 'fa-hand-holding-dollar', action: function () { showSection('collections', document.querySelector('[data-section="collections"]')); } },
{ id: 'expenses', permission: 'expenses', title: 'المصروفات', desc: 'إدارة المصروفات', icon: 'fa-receipt', action: function () { showSection('expenses', document.querySelector('[data-section="expenses"]')); } },
{ id: 'waste', permission: 'waste', title: 'الهالك', desc: 'تسجيل الهالك', icon: 'fa-trash-can', action: function () { showSection('waste', document.querySelector('[data-section="waste"]')); } },
{ id: 'reports', permission: 'reports', title: 'التقارير', desc: 'التقارير الشهرية', icon: 'fa-chart-mixed', action: function () { showSection('reports', document.querySelector('[data-section="reports"]')); } },
{ id: 'users', permission: 'users', title: 'المستخدمين', desc: 'إدارة المستخدمين', icon: 'fa-user-shield', action: function () { showSection('users', document.querySelector('[data-section="users"]')); } },
{ id: 'shift', permission: 'shift', title: 'تقفيل الشيفت', desc: 'تقرير شامل لفترة محددة', icon: 'fa-calculator', action: function () { showSection('shift', document.querySelector('[data-section="shift"]')); } },
{ id: 'refresh', permission: null, title: 'تحديث البيانات', desc: 'إعادة تحميل البيانات', icon: 'fa-arrows-rotate', action: function () { refreshCurrentSection(); } },
{ id: 'theme', permission: null, title: 'تبديل الثيم', desc: 'الوضع الليلي/النهاري', icon: 'fa-moon', action: function () { toggleTheme(); } },
{ id: 'logout', permission: null, title: 'تسجيل الخروج', desc: 'الخروج من النظام', icon: 'fa-arrow-right-from-bracket', action: function () { doLogout(); } }
];
function getAllowedPermissions() {
if (currentUser.role === 'manager') return PERMISSIONS.map(function (p) { return p.id; });
var perms = Array.isArray(currentUser.permissions) ? currentUser.permissions : [];
return perms.filter(function (id) { return PERMISSIONS.some(function (p) { return p.id === id; }) && id !== 'users'; });
}
function openCommandPalette() {
var palette = document.getElementById('command-palette'); if (!palette) return;
palette.classList.remove('hidden');
var input = document.getElementById('command-input'); if (input) { input.value = ''; input.focus(); }
renderCommands(getAllowedCommands());
}
function closeCommandPalette() { var palette = document.getElementById('command-palette'); if (palette) palette.classList.add('hidden'); }
function getAllowedCommands() { var allowed = getAllowedPermissions(); return COMMANDS.filter(function (cmd) { return !cmd.permission || allowed.indexOf(cmd.permission) !== -1; }); }
function filterCommands(query) {
var q = query.toLowerCase().trim();
renderCommands(getAllowedCommands().filter(function (cmd) { return cmd.title.toLowerCase().indexOf(q) !== -1 || cmd.desc.toLowerCase().indexOf(q) !== -1; }));
}
function renderCommands(commands) {
var container = document.getElementById('command-results'); if (!container) return;
if (!commands.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i>لا توجد نتائج</div>'; return; }
container.innerHTML = commands.map(function (cmd, idx) {
return '<div class="command-item' + (idx === 0 ? ' active' : '') + '" onclick="executeCommand(\'' + cmd.id + '\')"><div class="command-item-icon"><i class="fas ' + cmd.icon + '"></i></div><div class="command-item-content"><div class="command-item-title">' + cmd.title + '</div><div class="command-item-desc">' + cmd.desc + '</div></div></div>';
}).join('');
}
function executeCommand(id) { var cmd = COMMANDS.find(function (c) { return c.id === id; }); if (cmd) { closeCommandPalette(); cmd.action(); } }
async function doLogin() {
var username = document.getElementById('login-user').value.trim();
var password = document.getElementById('login-pass').value.trim();
var errorDiv = document.getElementById('login-error');
var btn = document.getElementById('login-btn');
if (!username || !password) { if (errorDiv) { errorDiv.querySelector('span').textContent = 'يرجى إدخال اسم المستخدم وكلمة المرور'; errorDiv.classList.remove('hidden'); } return; }
if (btn) { btn.disabled = true; btn.querySelector('.btn-content').innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>جاري التحقق...</span>'; }
if (errorDiv) errorDiv.classList.add('hidden');
try {
var result = await apiGet('login', { username: username, password: password });
if (result.success) {
currentUser = { username: result.username || username, role: result.role || 'manager', permissions: result.permissions || [] };
sessionStorage.setItem('ror_logged_in', 'true'); sessionStorage.setItem('ror_user', JSON.stringify(currentUser));
try { var att = await apiPost('attendanceLogin', { username: currentUser.username, role: currentUser.role }); if (att && att.attendanceRow) sessionStorage.setItem('ror_attendance_row', String(att.attendanceRow)); } catch (e) {}
enterApp();
} else { if (errorDiv) { errorDiv.querySelector('span').textContent = result.message || 'بيانات الدخول غير صحيحة'; errorDiv.classList.remove('hidden'); } }
} catch (err) { if (errorDiv) { errorDiv.querySelector('span').textContent = 'حدث خطأ في الاتصال: ' + err.message; errorDiv.classList.remove('hidden'); } }
if (btn) { btn.disabled = false; btn.querySelector('.btn-content').innerHTML = '<i class="fas fa-arrow-right-to-bracket"></i><span>دخول إلى لوحة التحكم</span>'; }
}
async function doLogout() {
try { var attRow = sessionStorage.getItem('ror_attendance_row'); if (attRow && currentUser.username) { await apiPost('attendanceLogout', { attendanceRow: attRow, username: currentUser.username }); } } catch (e) {}
sessionStorage.removeItem('ror_logged_in'); sessionStorage.removeItem('ror_user'); sessionStorage.removeItem('ror_attendance_row');
currentUser = { username: '', role: 'employee', permissions: [] };
document.getElementById('main-app').classList.add('hidden'); document.getElementById('login-screen').classList.remove('hidden');
document.getElementById('login-user').value = ''; document.getElementById('login-pass').value = '';
}
function checkSession() {
try {
var raw = sessionStorage.getItem('ror_user'); var loggedIn = sessionStorage.getItem('ror_logged_in') === 'true';
if (loggedIn && raw) { currentUser = JSON.parse(raw); enterApp(); }
else { document.getElementById('login-screen').classList.remove('hidden'); document.getElementById('main-app').classList.add('hidden'); }
} catch (err) { document.getElementById('login-screen').classList.remove('hidden'); document.getElementById('main-app').classList.add('hidden'); }
}
function enterApp() {
document.getElementById('login-screen').classList.add('hidden'); document.getElementById('main-app').classList.remove('hidden');
document.getElementById('current-user').textContent = currentUser.username || '';
document.getElementById('user-initial').textContent = (currentUser.username || 'U').charAt(0).toUpperCase();
var roleEl = document.getElementById('current-role'); if (roleEl) roleEl.textContent = currentUser.role === 'manager' ? 'مدير النظام' : 'موظف';
applyPermissions(); applyRoleRestrictions();
var allowed = getAllowedPermissions(); var first = allowed[0] || 'dashboard';
showSection(first, document.querySelector('.nav-item[data-section="' + first + '"]'));
}
function applyPermissions() {
var allowed = getAllowedPermissions();
document.querySelectorAll('.nav-item[data-section]').forEach(function (item) { item.style.display = allowed.indexOf(item.getAttribute('data-section')) !== -1 ? '' : 'none'; });
}
function applyRoleRestrictions() {
var isManager = currentUser.role === 'manager';
var expHistory = document.getElementById('expenses-history-panel'); var expLocked = document.getElementById('expenses-locked');
if (expHistory) expHistory.style.display = isManager ? '' : 'none';
if (expLocked) expLocked.style.display = isManager ? 'none' : '';
var wasteHistory = document.getElementById('waste-history-panel'); var wasteLocked = document.getElementById('waste-locked');
if (wasteHistory) wasteHistory.style.display = isManager ? '' : 'none';
if (wasteLocked) wasteLocked.style.display = isManager ? 'none' : '';
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
async function apiGet(action, params) {
params = params || {};
var url = new URL(API_URL); url.searchParams.append('action', action);
Object.keys(params).forEach(function (k) { url.searchParams.append(k, params[k]); });
var response = await fetch(url.toString());
if (!response.ok) throw new Error('Network error: ' + response.status);
return await response.json();
}
async function apiPost(action, data) {
data = data || {};
var response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action: action }, data)), redirect: 'follow' });
if (!response.ok) throw new Error('Network error: ' + response.status);
return await response.json();
}
function showSection(id, el) {
var allowed = getAllowedPermissions();
if (allowed.indexOf(id) === -1) { showToast('غير مصرح لك بالوصول لهذا القسم', 'error'); return; }
document.querySelectorAll('.section').forEach(function (s) { s.classList.add('hidden-section'); });
document.getElementById(id).classList.remove('hidden-section');
document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); }); if (el) el.classList.add('active');
currentSection = id;
var titles = { dashboard: 'لوحة التحكم', pos: 'نقطة البيع', inventory: 'المخزون', customers: 'كشف حساب', collections: 'القبض', expenses: 'المصروفات', waste: 'الهالك', reports: 'التقارير', users: 'المستخدمين', shift: 'تقفيل الشيفت' };
document.getElementById('page-title').textContent = titles[id] || '';
if (id === 'dashboard') loadDashboard();
if (id === 'inventory') loadInventory();
if (id === 'customers') loadCustomers();
if (id === 'collections') loadCollections();
if (id === 'expenses') loadExpenses();
if (id === 'waste') loadWaste();
if (id === 'users') loadUsers();
if (id === 'shift') loadShift();
if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
}
function refreshCurrentSection() { var activeNav = document.querySelector('.nav-item.active'); showSection(currentSection, activeNav); showToast('تم تحديث البيانات', 'success', '✅'); }
function showLoading() { document.getElementById('loading').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loading').classList.add('hidden'); }
function showToast(message, type, title) {
type = type || 'success';
var container = document.getElementById('toast-container'); if (!container) return;
var titles = { success: 'تم بنجاح', error: 'حدث خطأ', warning: 'تنبيه', info: 'معلومة' };
var icons = { success: '<i class="fas fa-check"></i>', error: '<i class="fas fa-times"></i>', warning: '<i class="fas fa-exclamation"></i>', info: '<i class="fas fa-info"></i>' };
var toast = document.createElement('div'); toast.className = 'toast-modern ' + type;
toast.innerHTML = '<div class="toast-icon">' + icons[type] + '</div><div class="toast-content"><div class="toast-title">' + (title || titles[type]) + '</div><div class="toast-message">' + message + '</div></div><button class="toast-close" onclick="closeToast(this)"><i class="fas fa-times"></i></button><div class="toast-progress"></div>';
container.appendChild(toast);
setTimeout(function () { if (toast.parentElement) { toast.style.animation = 'slideOutRight 0.3s forwards'; setTimeout(function () { toast.remove(); }, 300); } }, 3500);
}
function closeToast(btn) { var toast = btn.parentElement; toast.style.animation = 'slideOutRight 0.3s forwards'; setTimeout(function () { toast.remove(); }, 300); }
function showConfirm(options) {
return new Promise(function (resolve) {
var overlay = document.createElement('div'); overlay.className = 'command-palette'; overlay.style.zIndex = '10001';
var title = options.title || 'تأكيد العملية', message = options.message || 'هل أنت متأكد؟', confirmText = options.confirmText || 'تأكيد', cancelText = options.cancelText || 'إلغاء', details = options.details || null, icon = options.icon || 'fa-question';
var detailsHtml = '';
if (details && details.length > 0) {
detailsHtml = '<div style="background: var(--bg-surface); border-radius: var(--radius-md); padding: 14px; margin: 16px 0;">';
details.forEach(function (d) { detailsHtml += '<div style="display:flex; justify-content:space-between; padding:6px 0; font-size:13px;"><span style="color: var(--text-tertiary);">' + d.label + '</span><span style="font-weight:600; color: var(--text-primary);">' + d.value + '</span></div>'; });
detailsHtml += '</div>';
}
overlay.innerHTML = '<div class="command-overlay"></div><div class="command-modal" style="max-width: 420px;"><div style="padding: 24px;"><div style="width:64px; height:64px; margin:0 auto 16px; background:rgba(245,158,11,0.15); border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fbbf24; font-size:28px;"><i class="fas ' + icon + '"></i></div><h3 style="text-align:center; font-size:20px; font-weight:700; margin-bottom:8px;">' + title + '</h3><p style="text-align:center; color:var(--text-secondary); font-size:14px; margin-bottom:8px;">' + message + '</p>' + detailsHtml + '<div style="display:flex; gap:12px; margin-top:20px;"><button id="confirm-cancel" style="flex:1; padding:12px; background:var(--bg-hover); border:1px solid var(--border-default); border-radius:var(--radius-md); color:var(--text-primary); font-weight:600; cursor:pointer; font-family:inherit;">' + cancelText + '</button><button id="confirm-ok" style="flex:1; padding:12px; background:var(--gradient-green); border:none; border-radius:var(--radius-md); color:white; font-weight:600; cursor:pointer; font-family:inherit; box-shadow: 0 4px 12px rgba(16,185,129,0.3);">' + confirmText + '</button></div></div></div>';
document.body.appendChild(overlay);
var close = function (val) { overlay.remove(); resolve(val); };
overlay.querySelector('.command-overlay').addEventListener('click', function () { close(false); });
overlay.querySelector('#confirm-cancel').addEventListener('click', function () { close(false); });
overlay.querySelector('#confirm-ok').addEventListener('click', function () { close(true); });
});
}
function generateSparkline(svgId, data, color) {
color = color || '#3b82f6';
var svg = document.getElementById(svgId); if (!svg) return;
var values = Array.isArray(data) && data.length ? data : [0]; if (values.length === 1) values = [values[0], values[0]];
var width = 200, height = 50, padding = 2;
var max = Math.max.apply(null, values), min = Math.min.apply(null, values), range = max - min || 1;
var points = values.map(function (val, idx) { var x = padding + (idx / (values.length - 1)) * (width - 2 * padding); var y = height - padding - ((val - min) / range) * (height - 2 * padding); return x + ',' + y; }).join(' ');
var gradientId = 'grad-' + svgId; var lastPoint = points.split(' ').pop().split(',');
svg.innerHTML = '<defs><linearGradient id="' + gradientId + '" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:' + color + ';stop-opacity:0.4"></stop><stop offset="100%" style="stop-color:' + color + ';stop-opacity:0"></stop></linearGradient></defs><polygon points="' + padding + ',' + height + ' ' + points + ' ' + (width - padding) + ',' + height + '" fill="url(#' + gradientId + ')"></polygon><polyline points="' + points + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline><circle cx="' + lastPoint[0] + '" cy="' + lastPoint[1] + '" r="3" fill="' + color + '"></circle>';
}
function animateCounter(element, target, duration) {
duration = duration || 1500; if (!element) return;
var finalValue = safeNum(target); var startTime = performance.now();
function update(currentTime) {
var elapsed = currentTime - startTime; var progress = Math.min(elapsed / duration, 1); var easeOut = 1 - Math.pow(1 - progress, 3);
element.textContent = Math.floor(finalValue * easeOut).toLocaleString('ar-EG');
if (progress < 1) requestAnimationFrame(update); else element.textContent = finalValue.toLocaleString('ar-EG');
}
requestAnimationFrame(update);
}
async function loadDashboard() {
showLoading();
try { var data = await apiGet('getDashboard'); if (data.error) throw new Error(data.error); renderDashboard(data); document.getElementById('last-update').textContent = 'الآن'; }
catch (err) { showToast('خطأ: ' + err.message, 'error'); }
hideLoading();
}
function renderDashboard(data) {
var k = data.kpis || {}, c = data.charts || {}, alerts = data.alerts || {};
animateCounter(document.getElementById('total-revenue'), safeNum(k.totalSales));
animateCounter(document.getElementById('net-profit'), safeNum(k.netProfit));
animateCounter(document.getElementById('today-sales'), safeNum(k.todaySales));
animateCounter(document.getElementById('stock-value'), safeNum(k.totalStockValue));
animateCounter(document.getElementById('total-debt'), safeNum(k.totalUnpaid));
animateCounter(document.getElementById('total-waste'), safeNum(k.totalWaste));
document.getElementById('total-paid').textContent = fmtMoney(k.totalPaid) + ' ج.م';
document.getElementById('total-unpaid').textContent = fmtMoney(k.totalUnpaid) + ' ج.م';
document.getElementById('profit-margin').textContent = (safeNum(k.profitMargin) || 0) + '%';
document.getElementById('yesterday-compare').textContent = fmtMoney(k.yesterdaySales) + ' ج.م';
document.getElementById('total-products').textContent = safeNum(k.totalProducts);
document.getElementById('low-stock').textContent = safeNum(k.lowStockCount);
document.getElementById('out-stock').textContent = safeNum(k.outOfStockCount);
document.getElementById('debtors-count').textContent = safeNum(k.debtorsCount);
document.getElementById('pending-invoices').textContent = safeNum(k.debtorsCount);
document.getElementById('cost-sold').textContent = fmtMoney(k.totalCostOfSold) + ' ج.م';
var growth = safeNum(k.salesGrowth); var growthEl = document.getElementById('sales-growth');
if (growthEl) {
growthEl.textContent = (growth >= 0 ? '+' : '') + growth + '%';
var parent = growthEl.parentElement;
if (parent) { parent.className = 'trend-badge ' + (growth >= 0 ? 'trend-up' : 'trend-down'); parent.innerHTML = '<i class="fas ' + (growth >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down') + '"></i><span id="sales-growth">' + growthEl.textContent + '</span>'; }
}
var stockProgress = document.getElementById('stock-progress');
if (stockProgress) {
var totalProducts = safeNum(k.totalProducts); var healthyStock = totalProducts - safeNum(k.lowStockCount) - safeNum(k.outOfStockCount);
var percentage = totalProducts > 0 ? (healthyStock / totalProducts) * 100 : 0;
setTimeout(function () { stockProgress.style.width = percentage + '%'; }, 100);
}
generateSparkline('spark-revenue', safeArray(c.monthlySales && c.monthlySales.revenue ? c.monthlySales.revenue : (c.monthlySales && c.monthlySales.data)), '#3b82f6');
generateSparkline('spark-profit', safeArray(c.monthlySales && c.monthlySales.profit), '#10b981');
renderCharts(c); renderLowStock(c.lowStockList || []); renderRecentSales(c.recentSales || []); renderDebtors(c.debtors || []); renderAlerts(alerts); renderPaymentBreakdown(c.paymentBreakdown || []);
}
function renderCharts(c) {
var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
var textColor = isDark ? '#a1a1aa' : '#52525b'; var gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
if (charts.main) charts.main.destroy();
var m = c.monthlySales || {};
var labels = Array.isArray(m.labels) && m.labels.length ? m.labels : ['لا توجد بيانات'];
var revenue = Array.isArray(m.revenue) && m.revenue.length ? m.revenue : [0];
var cost = Array.isArray(m.cost) && m.cost.length ? m.cost : [0];
var profit = Array.isArray(m.profit) && m.profit.length ? m.profit : [0];
charts.main = new ApexCharts(document.getElementById('mainChart'), {
series: [{ name: 'إجمالي البيع', type: 'area', data: revenue }, { name: 'تكلفة المنتج الأساسي', type: 'column', data: cost }, { name: 'الربح من البيع', type: 'line', data: profit }],
chart: { type: 'line', height: '100%', toolbar: { show: true }, fontFamily: 'Cairo, sans-serif', foreColor: textColor, animations: { enabled: true, easing: 'easeinout', speed: 1000, animateGradually: { enabled: true, delay: 150 } } },
colors: ['#3b82f6', '#f59e0b', '#10b981'], stroke: { width: [3, 0, 3], curve: 'smooth' }, fill: { opacity: [0.25, 1, 1] },
plotOptions: { bar: { columnWidth: '30%', borderRadius: 6 } }, dataLabels: { enabled: false },
tooltip: { theme: isDark ? 'dark' : 'light', shared: true, intersect: false, y: { formatter: function (val) { return fmtMoney(val) + ' ج.م'; } } },
xaxis: { categories: labels, labels: { style: { fontSize: '12px', colors: textColor, fontFamily: 'Cairo, sans-serif', fontWeight: 600 } }, axisBorder: { show: false }, axisTicks: { show: false } },
yaxis: { labels: { formatter: function (val) { return fmtMoney(val) + ' ج.م'; }, style: { fontSize: '11px', colors: textColor, fontFamily: 'Cairo, sans-serif', fontWeight: 600 } }, tickAmount: 4 },
grid: { borderColor: gridColor, strokeDashArray: 4, padding: { left: 10, right: 10 } },
legend: { show: true, position: 'top', horizontalAlign: 'right', fontSize: '12px', fontFamily: 'Cairo, sans-serif', fontWeight: 600, labels: { colors: textColor } }
});
charts.main.render(); renderTopProducts(c.topSelling || { labels: [], data: [] });
}
function renderTopProducts(data) {
var container = document.getElementById('topChart'); if (!container) return;
var labels = data.labels || [], values = data.data || [];
if (!labels.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i>لا توجد بيانات</div>'; return; }
var maxVal = Math.max.apply(null, values); var medals = ['🥇', '🥈', '🥉']; var rankClasses = ['gold', 'silver', 'bronze', 'normal', 'normal'];
var html = '<div class="top-products-list">';
labels.forEach(function (label, idx) { var value = values[idx] || 0; html += '<div class="top-product-item"><div class="product-rank ' + rankClasses[idx] + '">' + (idx < 3 ? medals[idx] : idx + 1) + '</div><div class="product-info"><div class="product-name">' + escapeHtml(label) + '</div><div class="product-bar"><div class="product-bar-fill color-' + (idx + 1) + '" style="width: 0%"></div></div></div><div class="product-qty">' + fmtMoney(value) + '</div></div>'; });
html += '</div>'; container.innerHTML = html;
setTimeout(function () { container.querySelectorAll('.product-bar-fill').forEach(function (bar, idx) { var value = values[idx] || 0; bar.style.width = (maxVal > 0 ? (value / maxVal) * 100 : 0) + '%'; }); }, 100);
}
function renderLowStock(list) {
var container = document.getElementById('low-stock-list'); var countEl = document.getElementById('low-stock-count');
if (countEl) countEl.textContent = list.length; if (!container) return;
if (!list.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i>المخزون بحالة جيدة</div>'; return; }
container.innerHTML = list.map(function (i) { return '<div class="list-item"><div class="list-item-icon" style="background: rgba(245,158,11,0.15); color:#fbbf24;"><i class="fas fa-box"></i></div><div class="list-item-content"><div class="list-item-title">' + escapeHtml(i.name) + '</div><div class="list-item-subtitle">مخزون منخفض</div></div><div class="list-item-value text-orange">' + safeNum(i.stock) + ' قطعة</div></div>'; }).join('');
}
function renderRecentSales(list) {
var container = document.getElementById('recent-sales-list'); if (!container) return;
if (!list.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-clock"></i>لا توجد مبيعات حديثة</div>'; return; }
container.innerHTML = list.map(function (i) { var badge = i.status === 'تم الدفع' ? 'badge-green' : (i.status === 'دفع جزء' ? 'badge-orange' : 'badge-red'); return '<div class="list-item"><div class="list-item-icon" style="background: rgba(59,130,246,0.15); color:#60a5fa;"><i class="fas fa-shopping-bag"></i></div><div class="list-item-content"><div class="list-item-title">' + escapeHtml(i.customer) + '</div><div class="list-item-subtitle">' + escapeHtml(i.product) + '</div></div><div style="text-align:left;"><div class="list-item-value">' + fmtMoney(i.total) + ' ج.م</div><span class="badge ' + badge + '" style="font-size:10px; padding:2px 8px;">' + escapeHtml(i.status) + '</span></div></div>'; }).join('');
}
function renderDebtors(debtors) {
var container = document.getElementById('debtors-list'); var totalEl = document.getElementById('debtors-total'); if (!container) return;
if (!debtors || !debtors.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i>لا توجد مديونيات</div>'; if (totalEl) totalEl.textContent = '0 ج.م'; return; }
var totalDebt = debtors.reduce(function (sum, d) { return sum + safeNum(d.unpaid); }, 0); if (totalEl) totalEl.textContent = fmtMoney(totalDebt) + ' ج.م';
var grouped = {}; debtors.forEach(function (d) { if (!grouped[d.customerName]) grouped[d.customerName] = []; grouped[d.customerName].push(d); });
var html = '';
Object.keys(grouped).forEach(function (customer) {
var items = grouped[customer]; var customerTotal = items.reduce(function (sum, i) { return sum + safeNum(i.unpaid); }, 0);
html += '<div class="debtor-group"><div class="debtor-group-header"><h4><i class="fas fa-user"></i> ' + escapeHtml(customer) + '</h4><span class="total">' + fmtMoney(customerTotal) + ' ج.م</span></div><div class="debtor-items">';
html += items.map(function (item) {
if (item._isCollection) {
return '<div class="debtor-item is-collection"><div class="debtor-item-info"><div class="debtor-item-product"><i class="fas fa-hand-holding-dollar"></i> مدفوع قبضاً على الحساب</div></div><div class="debtor-item-amount coll-amount">' + fmtMoney(item.unpaid) + ' ج.م</div></div>';
}
var payBtn = item.rowId ? '<button onclick="updatePaymentStatus(' + item.rowId + ', \'' + encodeURIComponent(customer) + '\', ' + item.unpaid + ', \'' + encodeURIComponent(item.productName) + '\')" class="pay-btn"><i class="fas fa-check"></i> تم الدفع</button>' : '';
return '<div class="debtor-item"><div class="debtor-item-info"><div class="debtor-item-product"><i class="fas fa-box"></i> ' + escapeHtml(item.productName) + ' (' + safeNum(item.quantity) + ')</div><div class="debtor-item-date"><i class="fas fa-calendar"></i> ' + escapeHtml(item.date) + '</div></div><div class="debtor-item-amount">' + fmtMoney(item.unpaid) + ' ج.م</div>' + payBtn + '</div>';
}).join('');
html += '</div></div>';
});
container.innerHTML = html;
}
function renderAlerts(alerts) {
var container = document.getElementById('alerts-container'); if (!container) return; var items = [];
if (alerts.lowStock && alerts.lowStock.length > 0) alerts.lowStock.forEach(function (s) { items.push('<div class="alert-item"><div class="alert-item-icon warning"><i class="fas fa-exclamation-triangle"></i></div><div class="alert-item-content"><div class="alert-item-title">' + escapeHtml(s.name) + '</div><div class="alert-item-desc">مخزون منخفض: ' + safeNum(s.stock) + ' قطعة</div></div></div>'); });
if (alerts.highDebt && alerts.highDebt.length > 0) alerts.highDebt.forEach(function (d) { items.push('<div class="alert-item"><div class="alert-item-icon danger"><i class="fas fa-hand-holding-dollar"></i></div><div class="alert-item-content"><div class="alert-item-title">' + escapeHtml(d.name) + '</div><div class="alert-item-desc">مديونية: ' + fmtMoney(d.debt) + ' ج.م</div></div></div>'); });
if (!items.length) { container.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><i class="fas fa-bell-slash"></i>لا توجد تنبيهات حالياً</div>'; return; }
container.innerHTML = items.join('');
}
function renderPaymentBreakdown(list) {
var container = document.getElementById('payment-breakdown-list'); if (!container) return;
if (!list || !list.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-wallet"></i>لا توجد مدفوعات مسجّلة بعد</div>'; return; }
var total = list.reduce(function (s, x) { return s + safeNum(x.amount); }, 0);
container.innerHTML = list.map(function (x) { var amount = safeNum(x.amount); var pct = total > 0 ? (amount / total) * 100 : 0; return '<div class="pb-row"><div class="pb-icon" style="background:' + (x.color || '#71717a') + '"><i class="fas ' + (x.icon || 'fa-circle') + '"></i></div><div class="pb-info"><div class="pb-top"><span class="pb-label">' + escapeHtml(x.label) + '</span><span><span class="pb-pct">' + pct.toFixed(1) + '%</span><span class="pb-amount">' + fmtMoney(amount) + ' ج.م</span></span></div><div class="pb-bar"><div class="pb-bar-fill" data-w="' + pct + '" style="background:' + (x.color || '#71717a') + '"></div></div></div></div>'; }).join('');
setTimeout(function () { container.querySelectorAll('.pb-bar-fill').forEach(function (b) { b.style.width = (b.getAttribute('data-w') || 0) + '%'; }); }, 80);
}
// ===== POS Invoices =====
function generateInvoiceId() { return 'inv' + Date.now() + '' + Math.floor(Math.random() * 1000); }
function newInvoiceObj(id) { return { id: id, customer: '', phone: '', cart: [], paid: 0, paymentMethod: '', saved: false, savedMethod: null }; }
function initInvoices() { if (!invoices.length) { var id = generateInvoiceId(); invoices.push(newInvoiceObj(id)); activeInvoiceId = id; } renderInvoiceTabs(); syncPosFields(); renderCart(); }
function addInvoiceTab() { var id = generateInvoiceId(); invoices.push(newInvoiceObj(id)); activeInvoiceId = id; renderInvoiceTabs(); syncPosFields(); renderCart(); var tabs = document.getElementById('pos-invoice-tabs'); if (tabs) setTimeout(function () { tabs.scrollLeft = tabs.scrollWidth; }, 50); }
function selectInvoice(id) { activeInvoiceId = id; renderInvoiceTabs(); syncPosFields(); renderCart(); }
function closeInvoiceTab(event, id) { event.stopPropagation(); if (invoices.length === 1) { clearActiveInvoice(); return; } var idx = invoices.findIndex(function (i) { return i.id === id; }); if (idx === -1) return; invoices.splice(idx, 1); if (activeInvoiceId === id) activeInvoiceId = invoices[invoices.length - 1].id; renderInvoiceTabs(); syncPosFields(); renderCart(); }
function getActiveInvoice() { if (!invoices.length) initInvoices(); return invoices.find(function (i) { return i.id === activeInvoiceId; }) || invoices[0]; }
function renderInvoiceTabs() {
var tabs = document.getElementById('pos-invoice-tabs'); if (!tabs) return;
var tabsHtml = invoices.map(function (inv, idx) { var title = inv.customer ? escapeHtml(inv.customer) : 'فاتورة ' + (idx + 1); return '<div class="invoice-tab' + (inv.id === activeInvoiceId ? ' active' : '') + '" onclick="selectInvoice(\'' + inv.id + '\')"><span>' + title + '</span><button class="invoice-close" onclick="closeInvoiceTab(event, \'' + inv.id + '\')"><i class="fas fa-times"></i></button></div>'; }).join('');
tabs.innerHTML = tabsHtml + '<button class="invoice-add" onclick="addInvoiceTab()"><i class="fas fa-plus"></i> إضافة فاتورة</button>';
}
function syncPosFields() {
var inv = getActiveInvoice();
var customer = document.getElementById('pos-customer'); var phone = document.getElementById('pos-customer-phone'); var paid = document.getElementById('pos-paid');
if (customer) customer.value = inv.customer || '';
if (phone) phone.value = inv.phone || '';
if (paid) paid.value = inv.paid || 0;
renderCart(); renderPaymentButtons();
}
function updateActiveInvoiceCustomer(value) { var inv = getActiveInvoice(); if (inv.saved) return; inv.customer = value; renderInvoiceTabs(); }
function updateActiveInvoicePhone(value) { var inv = getActiveInvoice(); if (inv.saved) return; inv.phone = value; }
function currentInvoiceTotal() { var inv = getActiveInvoice(); return (inv.cart || []).reduce(function (s, i) { return s + safeNum(i.total); }, 0); }
function onPosPaidInput() {
var inv = getActiveInvoice(); if (inv.saved) return;
var total = currentInvoiceTotal(); var paid = Number(document.getElementById('pos-paid').value) || 0;
if (paid < 0) paid = 0; if (paid > total) paid = total; inv.paid = paid;
if (paid <= 0) inv.paymentMethod = 'credit'; else if (!inv.paymentMethod || inv.paymentMethod === 'credit') inv.paymentMethod = 'cash';
calcTotal(); renderPaymentButtons();
}
function renderPaymentButtons() {
var box = document.getElementById('pos-payment-methods'); if (!box) return; var inv = getActiveInvoice();
var methods = [{ id: 'cash', label: 'نقدي', icon: 'fa-money-bill-wave', cls: 'pay-cash' }, { id: 'vodafone', label: 'فودافون كاش', icon: 'fa-mobile-screen', cls: 'pay-vodafone' }, { id: 'credit', label: 'آجل', icon: 'fa-clock', cls: 'pay-credit' }];
box.innerHTML = methods.map(function (m) {
var stateCls = '', extra = '', disabled = '', onclick = 'onclick="setPaymentMethod(\'' + m.id + '\')"';
if (inv.saved) { disabled = 'disabled'; onclick = ''; if (inv.savedMethod === m.id) { stateCls = 'active saved'; extra = '<i class="fas fa-check"></i>'; } else stateCls = 'disabled'; }
else if (inv.paymentMethod === m.id) stateCls = 'active';
return '<button class="pay-method-btn ' + stateCls + ' ' + m.cls + '" ' + onclick + ' ' + disabled + '><i class="fas ' + m.icon + '"></i><span>' + m.label + '</span>' + extra + '</button>';
}).join('');
var badge = document.getElementById('pos-partial-badge');
if (badge) { var total = currentInvoiceTotal(); var paid = safeNum(inv.paid); badge.style.display = (!inv.saved && total > 0 && paid > 0 && paid < total) ? 'inline-flex' : 'none'; }
}
async function setPaymentMethod(method) {
var inv = getActiveInvoice();
if (inv.saved) { showToast('الفاتورة محفوظة بالفعل — امسحها أو افتح فاتورة جديدة', 'warning'); return; }
if (!inv.cart || !inv.cart.length) { showToast('أضف منتجات أولاً', 'warning'); return; }
if (!inv.customer || !inv.customer.trim()) { showToast('اسم العميل مطلوب', 'warning'); return; }
var total = currentInvoiceTotal();
var enteredPaid = safeNum(document.getElementById('pos-paid').value);
if (method === 'cash' && enteredPaid <= 0) {
showToast('لا يمكن اختيار "نقدي" والمبلغ المدفوع صفر — أدخل المبلغ المدفوع أولاً', 'error');
return;
}
if (method === 'credit') inv.paid = 0; else { if (safeNum(inv.paid) <= 0) inv.paid = total; else if (safeNum(inv.paid) > total) inv.paid = total; }
inv.paymentMethod = method;
var paidInput = document.getElementById('pos-paid'); if (paidInput) paidInput.value = inv.paid;
calcTotal(); await saveCurrentInvoice();
}
async function saveCurrentInvoice() {
var inv = getActiveInvoice(); var total = currentInvoiceTotal();
var paid = safeNum(inv.paid); if (paid < 0) paid = 0; if (paid > total) paid = total; inv.paid = paid;
var method = inv.paymentMethod || 'credit';
showLoading();
try {
var result = await apiPost('saveInvoice', { invoice: { customerName: inv.customer.trim(), paidAmount: paid, paymentMethod: method, cashier: currentUser.username || '', items: inv.cart.map(function (item) { return { productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.total }; }) } });
if (result.error) throw new Error(result.error);
inv.saved = true; inv.savedMethod = method;
var methodAr = { cash: 'نقدي', vodafone: 'فودافون كاش', credit: 'آجل' }[method] || method;
showToast('تم الحفظ (' + methodAr + ') — ' + (result.status || '') + '. تقدر تطبع دلوقتي', 'success', '✅ فاتورة محفوظة');
renderInvoiceTabs(); renderPaymentButtons();
} catch (err) { showToast('خطأ: ' + err.message, 'error'); }
hideLoading();
}
function clearActiveInvoice() { var inv = getActiveInvoice(); inv.customer = ''; inv.phone = ''; inv.cart = []; inv.paid = 0; inv.paymentMethod = ''; inv.saved = false; inv.savedMethod = null; syncPosFields(); renderInvoiceTabs(); renderCart(); }
function getNextReceiptNumber() { var n = parseInt(localStorage.getItem('ror_receipt_no') || '', 10); if (!n || isNaN(n)) n = (RECEIPT_CONFIG.receiptStart || 1) - 1; n += 1; localStorage.setItem('ror_receipt_no', String(n)); return n; }
function formatReceiptDate(d) { return (d || new Date()).toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }); }
function buildReceiptHTML(inv, total, paid, unpaid) {
var cfg = RECEIPT_CONFIG; var dec = cfg.priceDecimals; var receiptNo = getNextReceiptNumber(); var now = formatReceiptDate(new Date());
var cashier = (currentUser && currentUser.username) ? currentUser.username : 'Manager';
var fmtP = function (v) { return safeNum(v).toFixed(dec); };
var phoneLine = (inv.phone && inv.phone.trim()) ? '<div class="info-row"><span class="lbl">TEL:</span><span>' + escapeHtml(inv.phone) + '</span></div>' : '';
var logoBlock = cfg.logoUrl ? '<img src="' + cfg.logoUrl + '" alt="logo" style="max-width:140px; max-height:70px; display:block; margin:0 auto 6px;" />' : '<div style="font-size:26px; font-weight:900; letter-spacing:2px; text-align:center;">' + escapeHtml(cfg.storeName) + '</div>';
var rows = (inv.cart || []).map(function (item) { return '<tr><td class="c-qty">' + safeNum(item.quantity) + '</td><td class="c-name">' + escapeHtml(item.productName) + '</td><td class="c-total">' + fmtP(item.total) + '</td></tr>'; }).join('');
var partialBlock = (unpaid > 0.0001 || Math.abs(paid - total) > 0.0001) ? '<div class="line-row"><span>Paid</span><span>' + fmtP(paid) + '</span></div><div class="line-row"><span>Remaining</span><span>' + fmtP(unpaid) + '</span></div>' : '';
var methodAr = { cash: 'نقدي', vodafone: 'فودافون كاش', credit: 'آجل' }[inv.paymentMethod || inv.savedMethod] || '';
var methodLine = methodAr ? '<div class="line-row"><span>Payment</span><span>' + escapeHtml(methodAr) + '</span></div>' : '';
return '<!DOCTYPE html><html lang="ar"><head><meta charset="UTF-8" /><title>Receipt #' + receiptNo + '</title><style>@page { size: ' + cfg.paperWidth + ' auto; margin: 0; } * { box-sizing: border-box; margin: 0; padding: 0; } html, body { width: ' + cfg.paperWidth + '; margin: 0; padding: 0; background: #fff; color: #000; font-family: "Courier New", "Tahoma", monospace; font-size: 12px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .receipt { padding: 6mm 4mm; direction: ltr; text-align: left; } .tagline { text-align: center; font-size: 11px; margin: 2px 0; direction: rtl; } .sub-tag { text-align: center; font-size: 10px; color: #333; margin-bottom: 6px; } .divider { border-top: 1px solid #000; margin: 6px 0; } .divider-thick { border-top: 2px solid #000; margin: 6px 0; } .divider-dash { border-top: 1px dashed #000; margin: 6px 0; } .info-row { display: flex; justify-content: space-between; gap: 8px; } .info-row .lbl { font-weight: 700; } .addr { direction: rtl; text-align: right; font-size: 11px; margin: 2px 0; } .meta { font-size: 11px; } table { width: 100%; border-collapse: collapse; margin: 4px 0; } th, td { padding: 2px 0; vertical-align: top; } th { font-weight: 700; } .c-qty, th.c-qty { width: 14%; text-align: left; } .c-name, th.c-name { width: 56%; text-align: center; direction: rtl; } .c-total, th.c-total { width: 30%; text-align: right; } .line-row { display: flex; justify-content: space-between; font-weight: 700; } .subtotal { font-size: 14px; font-weight: 800; } .welcome { text-align: center; direction: rtl; font-weight: 700; margin: 8px 0; } .served { text-align: center; margin-top: 6px; } .served .who { font-weight: 700; margin-top: 2px; } .footer-addr { text-align: center; direction: rtl; margin-top: 6px; font-weight: 700; } .footer-phone { text-align: center; direction: rtl; margin-top: 4px; font-size: 13px; } .phone-ico { font-size: 18px; } @media print { body { width: ' + cfg.paperWidth + '; } }</style></head><body><div class="receipt"><div class="logo">' + logoBlock + '</div><div class="tagline">' + escapeHtml(cfg.storeTagline) + '</div><div class="sub-tag">Cash — Bill</div><div class="divider"></div><div class="info-row"><span class="lbl">Name:</span><span class="rtl">' + escapeHtml(inv.customer || '') + '</span></div>' + phoneLine + '<div class="addr">' + escapeHtml(cfg.storeAddress) + '</div><div class="divider"></div><div class="meta">' + now + '</div><div class="info-row meta"><span class="lbl">RECEIPT#</span><span>' + receiptNo + '</span></div><div class="divider-thick"></div><table><thead><tr><th class="c-qty">QTY</th><th class="c-name">NAME</th><th class="c-total">Total</th></tr></thead><tbody>' + rows + '</tbody></table><div class="divider-dash"></div><div class="line-row subtotal"><span>Sub Total</span><span>' + fmtP(total) + '</span></div>' + partialBlock + methodLine + '<div class="divider-dash"></div><div class="welcome">' + escapeHtml(cfg.welcomeMsg) + '</div><div class="served"><div>You Have been served by:</div><div class="who">' + escapeHtml(cashier) + '</div></div><div class="divider"></div><div class="footer-addr">' + escapeHtml(cfg.storeAddress) + '</div><div class="footer-phone"><span class="phone-ico">☎</span> ' + escapeHtml(cfg.storePhone) + '</div></div></body></html>';
}
function printReceiptHTML(html) {
var iframe = document.createElement('iframe');
iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0'; iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0'; iframe.setAttribute('aria-hidden', 'true');
document.body.appendChild(iframe);
var doc = iframe.contentDocument || iframe.contentWindow.document; doc.open(); doc.write(html); doc.close();
var printed = false;
var doPrint = function () { if (printed) return; printed = true; try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { showToast('تعذرت الطباعة: ' + e.message, 'error'); } setTimeout(function () { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 1500); };
iframe.contentWindow.onload = doPrint; setTimeout(doPrint, 500);
}
function printActiveInvoice() {
var inv = getActiveInvoice();
if (!inv || !inv.cart || !inv.cart.length) { showToast('الفاتورة فارغة — أضف منتجات أولاً', 'warning'); return; }
var total = inv.cart.reduce(function (s, i) { return s + safeNum(i.total); }, 0);
var paid = safeNum(inv.paid); if (paid < 0) paid = 0; if (paid > total) paid = total;
printReceiptHTML(buildReceiptHTML(inv, total, paid, Math.max(0, total - paid)));
showToast('جاري إرسال الفاتورة للطابعة...', 'info', '🖨️ طباعة');
}
function searchPOS(query) { clearTimeout(posSearchTimer); if (query.length < 2) { document.getElementById('pos-search-results').classList.add('hidden'); return; } posSearchTimer = setTimeout(function () { doSearchPOS(query); }, 300); }
// ✅ doSearchPOS - مع شارة "خدمة" للمنتجات غير المحدودة
async function doSearchPOS(query) {
var div = document.getElementById('pos-search-results'); if (!div) return;
try {
var results = await apiGet('searchProducts', { query: query });
if (results.error || !Array.isArray(results) || !results.length) div.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-tertiary);">لا توجد نتائج</div>';
else div.innerHTML = results.map(function (p) {
var isUnlimited = !!p.unlimited;
var stockDisplay = isUnlimited
? '<span style="color:#06b6d4; font-weight:700;">∞ خدمة</span>'
: 'المخزون: ' + safeNum(p.stock);
return '<div onclick="addToCart(\'' + encodeURIComponent(p.name) + '\', ' + (p.price || 0) + ', ' + (p.stock || 0) + ', ' + (isUnlimited ? 'true' : 'false') + ')"><div><div style="font-weight:600; color:var(--brand-blue-bright);">' + escapeHtml(p.name) + (isUnlimited ? ' <span style="font-size:9px; padding:1px 6px; background:rgba(6,182,212,0.15); color:#06b6d4; border-radius:999px; font-weight:700; margin-right:4px;">خدمة</span>' : '') + '</div><div style="font-size:11px; color:var(--text-tertiary); margin-top:2px;">' + stockDisplay + '</div></div><div style="font-weight:700; font-family:var(--font-mono);">' + safeNum(p.price) + ' ج.م</div></div>';
}).join('');
div.classList.remove('hidden');
} catch (err) { showToast('خطأ: ' + err.message, 'error'); }
}
// ✅ addToCart - مع تجاوز فحص المخزون للمنتجات "الخدمة"
function addToCart(encodedName, price, stock, unlimited) {
var name = decodeURIComponent(encodedName); var inv = getActiveInvoice();
if (inv.saved) { showToast('الفاتورة محفوظة — افتح فاتورة جديدة لإضافة منتجات', 'warning'); return; }
// ✅ لو منتج خدمة، تجاوز فحص المخزون
if (!unlimited && stock <= 0) { showToast('نفذ المخزون!', 'error'); return; }
var existing = inv.cart.find(function (i) { return i.productId === name; });
if (existing) {
// ✅ لو منتج عادي، افحص الكمية
if (!unlimited && existing.quantity >= stock) { showToast('الكمية المتاحة: ' + stock, 'warning'); return; }
existing.quantity++;
existing.total = existing.quantity * existing.unitPrice;
} else {
inv.cart.push({
productId: name,
productName: name,
quantity: 1,
unitPrice: price,
total: price,
unlimited: !!unlimited
});
}
renderCart(); document.getElementById('pos-search-results').classList.add('hidden'); document.getElementById('pos-search').value = '';
}
// ✅ renderCart - مع شارة "خدمة" للمنتجات غير المحدودة
function renderCart() {
var inv = getActiveInvoice(); var div = document.getElementById('pos-cart'); var countEl = document.getElementById('cart-count');
var totalItems = inv.cart.reduce(function (sum, i) { return sum + i.quantity; }, 0); if (countEl) countEl.textContent = totalItems; if (!div) return;
if (!inv.cart.length) div.innerHTML = '<div class="empty-state"><i class="fas fa-shopping-bag"></i>السلة فارغة — ابحث عن منتج لإضافته</div>';
else div.innerHTML = inv.cart.map(function (item, idx) {
var serviceBadge = item.unlimited ? ' <span style="font-size:9px; padding:1px 6px; background:rgba(6,182,212,0.15); color:#06b6d4; border-radius:999px; font-weight:700; margin-right:4px; vertical-align:middle;">خدمة</span>' : '';
return '<div><div style="display:flex; justify-content:space-between; align-items:center; gap:10px;"><div style="flex:1; min-width:0;"><div style="font-weight:600; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(item.productName) + serviceBadge + '</div><div style="font-size:11px; color:var(--text-tertiary); margin-top:2px; font-family:var(--font-mono);">' + safeNum(item.unitPrice) + ' × ' + safeNum(item.quantity) + '</div></div><div style="display:flex; align-items:center; gap:6px;"><button onclick="updateQty(' + idx + ', -1)">-</button><span style="font-weight:700; width:32px; text-align:center; font-family:var(--font-mono);">' + safeNum(item.quantity) + '</span><button onclick="updateQty(' + idx + ', 1)">+</button><button onclick="removeFromCart(' + idx + ')" style="background:transparent; border:none; color:var(--danger-bright); cursor:pointer;"><i class="fas fa-trash"></i></button></div><div style="font-weight:700; color:var(--brand-blue-bright); width:80px; text-align:left; font-family:var(--font-mono); font-size:13px;">' + safeNum(item.total).toFixed(2) + ' ج.م</div></div></div>';
}).join('');
calcTotal();
}
function updateQty(idx, change) {
var inv = getActiveInvoice(); if (inv.saved) return;
var item = inv.cart[idx];
// ✅ للمنتجات "الخدمة" لا يوجد حد أقصى للكمية
if (!item.unlimited) {
item.quantity += change;
if (item.quantity <= 0) { inv.cart.splice(idx, 1); renderCart(); return; }
} else {
item.quantity += change;
if (item.quantity <= 0) { inv.cart.splice(idx, 1); renderCart(); return; }
}
item.total = item.quantity * item.unitPrice;
renderCart();
}
function removeFromCart(idx) { var inv = getActiveInvoice(); if (inv.saved) return; inv.cart.splice(idx, 1); renderCart(); }
function calcTotal() {
var inv = getActiveInvoice(); var total = inv.cart.reduce(function (sum, item) { return sum + item.total; }, 0);
var paidInput = document.getElementById('pos-paid'); var paid = Number(paidInput.value) || 0; if (paid < 0) paid = 0; if (paid > total) paid = total; inv.paid = paid;
document.getElementById('pos-total').innerText = total.toFixed(2) + ' ج.م';
document.getElementById('pos-unpaid').value = Math.max(0, total - paid).toFixed(2);
}
async function loadInventory() {
showLoading();
try {
var products = await apiGet('getProducts'); var data = Array.isArray(products) ? products : []; var table = document.getElementById('inventory-table'); if (!table) return;
if (!data.length) { table.innerHTML = '<tr><td colspan="7" style="padding:24px; text-align:center; color:var(--text-tertiary);">لا توجد منتجات</td></tr>'; hideLoading(); return; }
table.innerHTML = data.map(function (p) {
var stock = safeNum(p.currentStock);
var isUnlimited = !!p.unlimited;
var status;
if (isUnlimited) status = '<span class="badge" style="background:rgba(6,182,212,0.15); color:#06b6d4; border-color:rgba(6,182,212,0.3);">∞ خدمة</span>';
else if (stock <= 0) status = '<span class="badge badge-red">نفذ</span>';
else if (stock <= 5) status = '<span class="badge badge-orange">منخفض</span>';
else status = '<span class="badge badge-green">متوفر</span>';
var toggleBtn = '<button class="unlimited-toggle' + (isUnlimited ? ' is-on' : '') + '" onclick="toggleUnlimited(\'' + encodeURIComponent(p.productName) + '\', ' + (isUnlimited ? 'false' : 'true') + ')" title="' + (isUnlimited ? 'إرجاعه منتج عادي (يتتبع المخزون)' : 'تحويله لمنتج خدمة (بدون تتبع كمية)') + '"><i class="fas ' + (isUnlimited ? 'fa-infinity' : 'fa-box') + '"></i><span>' + (isUnlimited ? 'خدمة' : 'عادي') + '</span></button>';
return '<tr><td style="font-weight:600;">' + escapeHtml(p.productName || '') + '</td><td style="font-family:var(--font-mono);">' + (isUnlimited ? '<span style="color:#06b6d4; font-weight:700;">∞</span>' : stock) + '</td><td style="font-family:var(--font-mono);">' + safeNum(p.deductQty) + '</td><td style="font-family:var(--font-mono); color:#fbbf24;">' + safeNum(p.wastedQty) + '</td><td style="font-family:var(--font-mono);">' + safeNum(p.unitPrice) + ' ج.م</td><td style="font-family:var(--font-mono);">' + safeNum(p.originalPrice) + ' ج.م</td><td><div style="display:flex; flex-direction:column; gap:6px; align-items:flex-start;">' + status + toggleBtn + '</div></td></tr>';
}).join('');
} catch (err) { showToast('خطأ: ' + err.message, 'error'); }
hideLoading();
}
// ===== ✅ تبديل منتج عادي / خدمة =====
async function toggleUnlimited(encodedName, makeUnlimited) {
var name = decodeURIComponent(encodedName);
showLoading();
try {
var result = await apiPost('setProductUnlimited', { productName: name, unlimited: makeUnlimited });
if (result.error) throw new Error(result.error);
showToast(result.message, 'success', makeUnlimited ? '∞ منتج خدمة' : '📦 منتج عادي');
loadInventory();
} catch (err) { showToast('خطأ: ' + err.message, 'error'); }
hideLoading();
}
// ✅ إضافة منتج — الاسم فقط إجباري (الكمية وسعر التكلفة اختياري)
async function addProduct() {
var name = document.getElementById('new-product-name').value.trim(); var qty = Number(document.getElementById('new-product-qty').value) || 0;
var price = Number(document.getElementById('new-product-price').value) || 0; var original = Number(document.getElementById('new-product-original').value) || 0;
if (!name) { showToast('اسم المنتج مطلوب', 'error'); return; }
showLoading();
try {
var result = await apiPost('addProduct', { product: { name: name, stock: qty, price: price, originalPrice: original } }); if (result.error) throw new Error(result.error);
showToast(result.message || 'تم إضافة المنتج بنجاح', 'success', '✅ منتج جديد');
['new-product-name','new-product-qty','new-product-price','new-product-original'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
loadInventory();
} catch (err) { showToast('خطأ: ' + err.message, 'error'); }
hideLoading();
}
async function loadCustomers() {
showLoading();
try { var customers = await apiGet('getCustomers'); customersCache = Array.isArray(customers) ? customers : []; renderCustomersTable(); }
catch (err) { showToast('خطأ: ' + err.message, 'error'); }
hideLoading();
}
function setCustomerFilter(filter, el) { customerFilter = filter; document.querySelectorAll('.customer-tab').forEach(function (t) { t.classList.remove('active'); }); if (el) el.classList.add('active'); renderCustomersTable(); }
function renderCustomersTable() {
var table = document.getElementById('customers-table'); if (!table) return;
var all = customersCache.map(function (c) { return { name: c[0] || '', total: safeNum(c[2]), paid: safeNum(c[3]), unpaid: safeNum(c[4]), visits: safeNum(c[5]) }; });
all.sort(function (a, b) { return (b.unpaid - a.unpaid) || (b.total - a.total); });
var debtors = all.filter(function (c) { return c.unpaid > 0; }); var settled = all.filter(function (c) { return c.unpaid <= 0; });
document.getElementById('count-all').textContent = all.length; document.getElementById('count-debtor').textContent = debtors.length; document.getElementById('count-settled').textContent = settled.length;
var list = all; if (customerFilter === 'debtor') list = debtors; if (customerFilter === 'settled') list = settled;
if (!list.length) { table.innerHTML = '<tr><td colspan="6" style="padding:24px; text-align:center; color:var(--text-tertiary);">لا يوجد عملاء في هذا التصنيف</td></tr>'; return; }
table.innerHTML = list.map(function (c) { var status = c.unpaid > 0 ? '<span class="badge badge-red">مديون</span>' : '<span class="badge badge-green">خالص</span>'; var encoded = encodeURIComponent(c.name); return '<tr class="customer-row" onclick="openCustomerInvoices(\'' + encoded + '\')"><td style="font-weight:600;">' + escapeHtml(c.name) + '</td><td style="font-family:var(--font-mono);">' + c.total.toFixed(2) + ' ج.م</td><td style="font-family:var(--font-mono); color:var(--success-bright);">' + c.paid.toFixed(2) + ' ج.م</td><td style="font-family:var(--font-mono); color:var(--danger-bright);">' + c.unpaid.toFixed(2) + ' ج.م</td><td>' + status + '</td><td><button class="btn-ghost" onclick="event.stopPropagation(); openCustomerInvoices(\'' + encoded + '\')"><i class="fas fa-file-invoice"></i> الفواتير (' + c.visits + ')</button></td></tr>'; }).join('');
}
async function doSearchCustomer() {
var name = document.getElementById('customer-search').value.trim();
var month = document.getElementById('customer-month').value;
var year = document.getElementById('customer-year').value;
if (!name || name.length < 2) { showToast('اكتب اسم العميل للبحث (حرفين على الأقل)', 'warning'); return; }
showLoading();
try {
var params = { name: name }; if (month) params.month = month; if (year) params.year = year;
var data = await apiGet('getCustomerStatementFull', params);
if (data.error) throw new Error(data.error);
renderCustomerSearchResults(data, name, month, year);
} catch (err) { showToast('خطأ: ' + err.message, 'error'); }
hideLoading();
}
async function doSearchCustomerExact(encodedName) {
document.getElementById('customer-search').value = decodeURIComponent(encodedName);
await doSearchCustomer();
}
function stmtKpi(label, val, icon, cls) {
return '<div class="stmt-kpi ' + cls + '"><div class="stmt-kpi-top"><i class="fas ' + icon + '"></i><span>' + label + '</span></div><div class="stmt-kpi-val" data-count="' + safeNum(val) + '">0</div></div>';
}
function animateCounters(root) {
(root || document).querySelectorAll('[data-count]').forEach(function (el) {
var target = safeNum(el.getAttribute('data-count'));
var suffix = el.getAttribute('data-suffix') || '';
var isMoney = !suffix;
var dur = 900, start = performance.now();
function step(t) {
var p = Math.min((t - start) / dur, 1);
var e = 1 - Math.pow(1 - p, 3);
var v = target * e;
el.textContent = (isMoney ? fmtMoney(v) : v.toFixed(0)) + suffix;
if (p < 1) requestAnimationFrame(step);
else el.textContent = (isMoney ? fmtMoney(target) : target.toFixed(0)) + suffix;
}
requestAnimationFrame(step);
});
}
function buildStatementHtml(data) {
if (!data || !data.found) return '<div class="empty-state" style="margin-top:8px;"><i class="fas fa-user-slash"></i> لا توجد عمليات لهذا العميل</div>';
var s = data.summary || {};
var cur = safeNum(s.currentBalance);
var balClass = cur > 0.001 ? 'text-red' : 'text-green';
var balLabel = cur > 0.001 ? 'رصيد مدين (متبقي)' : 'الحساب خالص ✅';
var entries = data.entries || [];
var html = '<div class="stmt-head">';
html += '<div class="stmt-id"><div class="search-avatar">' + escapeHtml((data.customerName || '?').charAt(0)) + '</div>';
html += '<div class="stmt-id-text"><h3>' + escapeHtml(data.customerName) + '</h3><span class="stmt-id-sub">كشف حساب تفصيلي' + (data.hasFilter ? ' (فترة محدّدة)' : ' — كل العمليات') + '</span></div></div>';
html += '<div class="stmt-kpis">';
html += stmtKpi('إجمالي الفواتير', s.overallBilled, 'fa-file-invoice', 'kpi-blue');
html += stmtKpi('مدفوع وقت البيع', s.overallPaidAtSale, 'fa-money-bill-wave', 'kpi-green');
html += stmtKpi('مقبوض قبضاً', s.overallCollected, 'fa-hand-holding-dollar', 'kpi-cyan');
html += '<div class="stmt-kpi ' + (cur > 0.001 ? 'kpi-red' : 'kpi-green') + '"><div class="stmt-kpi-top"><i class="fas fa-scale-balanced"></i><span>' + balLabel + '</span></div><div class="stmt-kpi-val ' + balClass + '" data-count="' + cur + '">0</div></div>';
html += '</div></div>';
var billed = safeNum(s.overallBilled);
var settled = safeNum(s.overallPaidAtSale) + safeNum(s.overallCollected);
var pct = billed > 0 ? Math.min(100, (settled / billed) * 100) : 0;
html += '<div class="stmt-progress-wrap"><div class="stmt-progress-label"><span>نسبة التسوية الكلية</span><span class="stmt-progress-pct" data-count="' + pct + '" data-suffix="%">0%</span></div><div class="stmt-progress-track"><div class="stmt-progress-fill" style="width:0%" data-w="' + pct + '"></div></div></div>';
if (!entries.length) {
html += '<div class="empty-state" style="padding:24px;"><i class="fas fa-inbox"></i> لا توجد عمليات في هذه الفترة</div>';
} else {
html += '<div class="stmt-table-wrap"><table class="table-modern stmt-table"><thead><tr>';
html += '<th>التاريخ</th><th>الوقت</th><th>العملية</th><th>البيان</th><th class="num">مدين</th><th class="num">دائن</th><th class="num">الرصيد</th>';
html += '</tr></thead><tbody>';
entries.forEach(function (e, i) {
var isSale = e.type === 'sale';
var rowCls = isSale ? 'stmt-row-sale' : 'stmt-row-pay';
var typeBadge = isSale ? '<span class="stmt-type sale"><i class="fas fa-file-invoice-dollar"></i> فاتورة</span>' : '<span class="stmt-type pay"><i class="fas fa-arrow-down-to-bracket"></i> قبض</span>';
var desc = '';
if (isSale) {
desc = '<div class="stmt-desc-main">' + escapeHtml(e.description || '—') + '</div>';
desc += '<div class="stmt-desc-meta">إجمالي ' + fmtMoney(e.total) + ' · مدفوع ' + fmtMoney(e.paid) + ' · آجل ' + fmtMoney(e.unpaid) + (e.cashier ? ' · <i class="fas fa-user-tie"></i> ' + escapeHtml(e.cashier) : '') + ' · <span class="badge ' + (e.status === 'تم الدفع' ? 'badge-green' : (e.status === 'دفع جزء' ? 'badge-orange' : 'badge-red')) + '">' + escapeHtml(e.status || '') + '</span></div>';
} else {
desc = '<div class="stmt-desc-main">' + escapeHtml(e.description || '—') + '</div>';
if (e.method) desc += '<div class="stmt-desc-meta">طريقة الدفع: <strong>' + escapeHtml(e.method) + '</strong>' + (e.cashier ? ' · <i class="fas fa-user-tie"></i> ' + escapeHtml(e.cashier) : '') + '</div>';
}
var debit = (isSale && e.debit > 0.001) ? fmtMoney(e.debit) : '';
var credit = (!isSale && e.credit > 0.001) ? fmtMoney(e.credit) : '';
var clickable = isSale && e.rowId;
var clickAttr = clickable ? ' onclick="openInvoiceDetails(' + e.rowId + ')" title="اضغط لعرض تفاصيل الفاتورة"' : '';
var rowStyle = 'animation-delay:' + Math.min(i * 40, 600) + 'ms' + (clickable ? ';cursor:pointer' : '');
html += '<tr class="' + rowCls + '"' + clickAttr + ' style="' + rowStyle + '">';
html += '<td class="mono">' + escapeHtml(e.date || '') + '</td>';
html += '<td class="mono dim">' + escapeHtml(e.time || '--') + '</td>';
html += '<td>' + typeBadge + '</td>';
html += '<td class="stmt-desc">' + desc + '</td>';
html += '<td class="num debit">' + debit + '</td>';
html += '<td class="num credit">' + credit + '</td>';
html += '<td class="num running">' + fmtMoney(e.running) + '</td>';
html += '</tr>';
});
html += '<tr class="stmt-row-final"><td colspan="4"><i class="fas fa-flag-checkered"></i> الرصيد النهائي' + (data.hasFilter ? ' للفترة' : '') + '</td><td class="num"></td><td class="num"></td><td class="num final ' + balClass + '">' + fmtMoney(cur) + '</td></tr>';
html += '</tbody></table></div>';
if (entries.some(function (e) { return e.type === 'sale' && e.rowId; })) {
html += '<p class="inv-hint" style="padding:0 22px 18px;"><i class="fas fa-hand-pointer"></i> اضغط على أي فاتورة لعرض أصنافها وأسعارها وعمليات القبض</p>';
}
}
return html;
}
function renderCustomerSearchResults(data, name, month, year) {
const results = document.getElementById('customer-results');
if (!results) return;
if (data && data.ambiguous) {
results.innerHTML = '<div class="search-result-card"><div class="open-head"><h3 class="panel-title" style="margin:0"><i class="fas fa-users"></i> وُجد ' + data.matches.length + ' عملاء بهذا الاسم — اختر العميل</h3></div><div class="open-invoices">' + data.matches.map(function (m) { return '<div class="invoice-check-row" onclick="doSearchCustomerExact(\'' + encodeURIComponent(m.name) + '\')"><div class="search-avatar" style="width:38px;height:38px;font-size:16px">' + escapeHtml((m.name || '?').charAt(0)) + '</div><div class="icr-info"><div class="icr-prod">' + escapeHtml(m.name) + '</div><div class="icr-meta">' + m.visits + ' فاتورة</div></div><div class="icr-amt"><span class="icr-unpaid">' + fmtMoney(m.unpaid) + ' ج.م</span><span class="icr-total">متبقي</span></div></div>'; }).join('') + '</div></div>';
return;
}
if (!data || !data.found) {
results.innerHTML = '<div class="search-result-card"><div class="empty-state"><i class="fas fa-user-slash"></i> لم يتم العثور على العميل في الفترة المحددة</div></div>';
return;
}
results.innerHTML = '<div class="search-result-card stmt-card">' + buildStatementHtml(data) + '</div>';
setTimeout(function() {
const fill = results.querySelector('.stmt-progress-fill');
if (fill) fill.style.width = (fill.getAttribute('data-w') || 0) + '%';
animateCounters(results);
}, 100);
}
async function openInvoiceDetails(rowId) {
const modal = document.getElementById('customer-modal');
if (!modal) return;
if (!rowId || rowId === 0) { showToast('رقم الفاتورة غير صحيح', 'error'); return; }
modal.classList.remove('hidden');
document.getElementById('customer-modal-name').innerHTML = '<i class="fas fa-receipt"></i> تفاصيل الفاتورة #' + rowId;
document.getElementById('customer-modal-summary').innerHTML = '<span><i class="fas fa-spinner fa-spin"></i> جاري تحميل التفاصيل...</span>';
document.getElementById('customer-modal-body').innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
try {
const d = await apiGet('getInvoiceDetails', { rowId: rowId });
if (d.error) throw new Error(d.error);
const badge = d.status === 'تم الدفع' ? 'badge-green' : (d.status === 'دفع جزء' ? 'badge-orange' : 'badge-red');
const cashierName = (d.cashier || '').toString().trim();
document.getElementById('customer-modal-summary').innerHTML =
'<span><i class="fas fa-calendar-day"></i> ' + escapeHtml(d.date) + '</span>' +
'<span><i class="fas fa-clock"></i> ' + escapeHtml(d.time || '--') + '</span>' +
'<span><i class="fas fa-user"></i> ' + escapeHtml(d.customer) + '</span>' +
(cashierName ? '<span><i class="fas fa-user-tie"></i> الكاشير: ' + escapeHtml(cashierName) + '</span>' : '') +
(d.paymentMethodAr ? '<span><i class="fas fa-wallet"></i> ' + escapeHtml(d.paymentMethodAr) + '</span>' : '') +
'<span class="badge ' + badge + '">' + escapeHtml(d.status) + '</span>';
const rows = (d.items || []).map(function (it, i) {
const productName = it.product || it.productName || '—';
const lineTotal = it.lineTotal || it.totalPrice || 0;
const cashierCell = (i === 0)
? '<td class="rd-cash">' + (cashierName ? escapeHtml(cashierName) : '—') + '</td>'
: '<td class="rd-cash"></td>';
return '<tr style="animation-delay:' + (i * 60) + 'ms">' +
'<td class="rd-prod">' + escapeHtml(productName) + '</td>' +
cashierCell +
'<td class="num">' + safeNum(it.quantity) + '</td>' +
'<td class="num">' + safeNum(it.unitPrice).toFixed(2) + '</td>' +
'<td class="num rd-line">' + safeNum(lineTotal).toFixed(2) + '</td>' +
'</tr>';
}).join('');
let paymentsHtml = '';
const payments = d.payments || [];
if (payments.length > 0) {
paymentsHtml = '<div style="margin-top:20px;padding-top:20px;border-top:2px dashed var(--line);">';
paymentsHtml += '<h4 style="margin-bottom:12px;display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700;"><i class="fas fa-hand-holding-dollar" style="color:#06b6d4;"></i>سجل القبض (' + payments.length + ' عملية)</h4>';
payments.forEach(function (p, idx) {
const methodLabel = ({ cash: 'نقدي', vodafone: 'فودافون كاش', credit: 'آجل' })[(p.method || '').toLowerCase()] || p.method || 'نقدي';
paymentsHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:8px;animation:rdRow .4s var(--ease-out) both;animation-delay:' + (idx * 60) + 'ms;">';
paymentsHtml += '<div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;flex-wrap:wrap;"><span style="font-weight:800;color:var(--success-bright);font-family:var(--font-mono);font-size:15px;">+ ' + safeNum(p.amount).toFixed(2) + ' ج.م</span><span style="font-size:11px;padding:2px 9px;background:rgba(59,130,246,0.12);color:var(--brand-blue-bright);border-radius:var(--radius-full);font-weight:700;">' + escapeHtml(methodLabel) + '</span></div>';
paymentsHtml += '<div style="font-size:11px;color:var(--text-tertiary);display:flex;align-items:center;gap:5px;flex-wrap:wrap;"><i class="fas fa-calendar"></i> ' + escapeHtml(p.date);
if (p.time) paymentsHtml += ' <i class="fas fa-clock"></i> ' + escapeHtml(p.time);
if (p.cashier) paymentsHtml += ' <i class="fas fa-user-tie"></i> ' + escapeHtml(p.cashier);
if (p.note) paymentsHtml += ' <i class="fas fa-sticky-note"></i> ' + escapeHtml(p.note);
paymentsHtml += '</div></div>';
paymentsHtml += '<div style="font-size:12px;color:var(--text-tertiary);font-family:var(--font-mono);white-space:nowrap;">المتبقي: ' + safeNum(p.remaining).toFixed(2) + ' ج.م</div></div>';
});
paymentsHtml += '<div style="margin-top:12px;padding:12px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);border-radius:var(--radius-md);text-align:center;"><strong style="color:#06b6d4;font-family:var(--font-mono);font-size:16px;">إجمالي المقبوض: ' + safeNum(d.totalCollected).toFixed(2) + ' ج.م</strong></div></div>';
} else {
paymentsHtml = '<div style="margin-top:20px;padding:20px;text-align:center;color:var(--text-tertiary);border-top:2px dashed var(--line);"><i class="fas fa-hand-holding-dollar" style="font-size:24px;margin-bottom:8px;opacity:0.3;display:block;"></i>لا توجد عمليات قبض لهذا العميل بعد</div>';
}
document.getElementById('customer-modal-body').innerHTML =
'<div class="receipt-detail">' +
'<div class="rd-head"><div class="rd-title">إيصال بيع</div><div class="rd-no">#' + safeNum(d.rowId) + '</div></div>' +
'<div class="rd-meta"><div><span>التاريخ</span><strong>' + escapeHtml(d.date) + '</strong></div><div><span>الوقت</span><strong>' + escapeHtml(d.time || '--') + '</strong></div><div><span>العميل</span><strong>' + escapeHtml(d.customer) + '</strong></div></div>' +
'<table class="rd-table"><thead><tr><th>الصنف</th><th class="rd-cash">الكاشير</th><th class="num">الكمية</th><th class="num">السعر</th><th class="num">الإجمالي</th></tr></thead>' +
'<tbody>' + rows + '</tbody></table>' +
'<div class="rd-totals"><div class="rd-row"><span>الإجمالي</span><strong>' + safeNum(d.total).toFixed(2) + ' ج.م</strong></div><div class="rd-row ok"><span>المدفوع</span><strong>' + safeNum(d.paid).toFixed(2) + ' ج.م</strong></div><div class="rd-row due"><span>المتبقي</span><strong>' + safeNum(d.unpaid).toFixed(2) + ' ج.م</strong></div></div>' +
paymentsHtml +
'<div class="rd-perf"></div>' +
'</div>';
} catch (err) {
document.getElementById('customer-modal-body').innerHTML = '<div class="empty-state"><i class="fas fa-triangle-exclamation"></i> ' + escapeHtml(err.message) + '</div>';
showToast('خطأ: ' + err.message, 'error');
}
}
function closeCustomerModal() { var modal = document.getElementById('customer-modal'); if (modal) modal.classList.add('hidden'); }
// ===== Collections (القبض على الحساب) =====
function loadCollections() {
collectionStatement = null;
var search = document.getElementById('collection-search'); if (search) search.value = '';
var result = document.getElementById('collection-result'); if (result) result.innerHTML = '<div class="glass-panel"><div class="empty-state"><i class="fas fa-hand-holding-dollar"></i> ابحث عن عميل لعرض كشف حسابه وتسجيل قبض</div></div>';
}
async function searchCollectionCustomer() {
var name = (document.getElementById('collection-search').value || '').trim();
if (!name || name.length < 2) { showToast('اكتب اسم العميل (حرفين على الأقل)', 'warning'); return; }
var result = document.getElementById('collection-result');
result.innerHTML = '<div class="glass-panel"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i> جاري تحميل كشف الحساب...</div></div>';
try {
var data = await apiGet('getCustomerStatement', { name: name }); if (data.error) throw new Error(data.error);
if (data.ambiguous) {
collectionStatement = null;
result.innerHTML = '<div class="glass-panel"><div class="open-head"><h3 class="panel-title" style="margin:0"><i class="fas fa-users"></i> وُجد ' + data.matches.length + ' عملاء بهذا الاسم — اختر العميل</h3></div><div class="open-invoices">' + data.matches.map(function (m) { return '<div class="invoice-check-row" onclick="pickCollectionCustomer(\'' + encodeURIComponent(m.name) + '\')"><div class="search-avatar" style="width:38px;height:38px;font-size:16px">' + escapeHtml((m.name || '?').charAt(0)) + '</div><div class="icr-info"><div class="icr-prod">' + escapeHtml(m.name) + '</div><div class="icr-meta">' + m.visits + ' فاتورة</div></div><div class="icr-amt"><span class="icr-unpaid">' + fmtMoney(m.unpaid) + ' ج.م</span><span class="icr-total">متبقي</span></div></div>'; }).join('') + '</div></div>';
return;
}
if (!data.found) { collectionStatement = null; result.innerHTML = '<div class="glass-panel"><div class="empty-state"><i class="fas fa-user-slash"></i> لا يوجد عميل بهذا الاسم أو ليس له عمليات</div></div>'; return; }
collectionStatement = data; renderCollectionStatement();
} catch (err) { showToast('خطأ: ' + err.message, 'error'); result.innerHTML = '<div class="glass-panel"><div class="empty-state"><i class="fas fa-triangle-exclamation"></i> خطأ في التحميل</div></div>'; }
}
async function pickCollectionCustomer(encodedName) {
document.getElementById('collection-search').value = decodeURIComponent(encodedName);
await searchCollectionCustomer();
}
function renderCollectionStatement() {
var result = document.getElementById('collection-result'); if (!result || !collectionStatement) return;
var st = collectionStatement; var s = st.summary || {};
var methodAr = { cash: 'نقدي', vodafone: 'فودافون كاش' };
var html = '<div class="glass-panel"><div class="statement-head"><div class="statement-name"><div class="search-avatar">' + escapeHtml((st.customerName || '?').charAt(0)) + '</div><div><h3>' + escapeHtml(st.customerName) + '</h3><span class="statement-sub">كشف حساب العميل</span></div></div></div><div class="statement-grid"><div class="st-box"><span class="st-label">إجمالي المشتريات</span><span class="st-val">' + fmtMoney(s.totalBilled) + ' ج.م</span></div><div class="st-box"><span class="st-label">المدفوع لحد دلوقتي</span><span class="st-val text-green">' + fmtMoney(s.totalPaid) + ' ج.م</span></div><div class="st-box"><span class="st-label">المتبقي الحالي</span><span class="st-val text-red">' + fmtMoney(s.totalUnpaid) + ' ج.م</span></div><div class="st-box"><span class="st-label">إجمالي المقبوض (سجل)</span><span class="st-val text-blue">' + fmtMoney(s.totalCollected) + ' ج.م</span></div></div></div>';
var open = st.openInvoices || [];
html += '<div class="glass-panel"><div class="open-head"><h3 class="panel-title" style="margin:0;"><i class="fas fa-file-invoice-dollar"></i> الفواتير المفتوحة (' + open.length + ')</h3></div>';
if (!open.length) html += '<div class="empty-state"><i class="fas fa-circle-check"></i> لا توجد فواتير مفتوحة — الحساب خالص ✅</div>';
else html += '<div class="table-responsive"><table class="table-modern invoice-table"><thead><tr><th>التاريخ</th><th>المنتجات</th><th>الإجمالي</th><th>المتبقي</th></tr></thead><tbody>' + open.map(function (inv) { return '<tr><td style="font-family:var(--font-mono);">' + escapeHtml(inv.date) + (inv.time ? ' ' + escapeHtml(inv.time) : '') + '</td><td style="font-weight:600;">' + escapeHtml(inv.product) + (inv.cashier ? '<div style="font-size:11px;color:var(--text-tertiary);font-weight:400;"><i class="fas fa-user-tie"></i> ' + escapeHtml(inv.cashier) + '</div>' : '') + '</td><td style="font-family:var(--font-mono);">' + safeNum(inv.total).toFixed(2) + ' ج.م</td><td style="font-family:var(--font-mono); color:var(--danger-bright);">' + safeNum(inv.unpaid).toFixed(2) + ' ج.م</td></tr>'; }).join('') + '</tbody></table></div>';
html += '</div>';
html += '<div class="glass-panel"><h3 class="panel-title"><i class="fas fa-money-bill-wave"></i> تسجيل قبض جديد</h3><div class="collection-form-grid"><div class="input-field"><i class="fas fa-coins input-icon"></i><input id="coll-amount" type="number" min="0" step="any" placeholder=" "/><label>المبلغ المقبوض</label><div class="input-border"></div></div><div class="input-field"><i class="fas fa-wallet input-icon"></i><select id="coll-method"><option value="cash">نقدي</option><option value="vodafone">فودافون كاش</option></select><label>طريقة الدفع</label><div class="input-border"></div></div><div class="input-field" style="grid-column: 1 / -1;"><i class="fas fa-note-sticky input-icon"></i><input id="coll-note" type="text" placeholder=" "/><label>ملاحظة (اختياري)</label><div class="input-border"></div></div></div><div style="display:flex; gap:10px; margin-top:16px;"><button class="btn-magnetic btn-success" onclick="recordCollectionPayment()"><span class="btn-bg"></span><span class="btn-content"><i class="fas fa-check"></i> تسجيل القبض</span></button><button class="btn-ghost" onclick="searchCollectionCustomer()"><i class="fas fa-arrows-rotate"></i> إعادة تحميل</button></div></div>';
var pays = st.payments || [];
html += '<div class="glass-panel"><h3 class="panel-title"><i class="fas fa-clock-rotate-left"></i> سجل القبض السابق (' + pays.length + ')</h3>';
if (!pays.length) html += '<div class="empty-state"><i class="fas fa-receipt"></i> لا توجد عمليات قبض مسجّلة بعد</div>';
else html += '<div class="payment-history">' + pays.map(function (p) { return '<div class="ph-row"><div class="ph-info"><div class="ph-top"><span class="ph-amt">' + fmtMoney(p.amount) + ' ج.م</span><span class="ph-method">' + escapeHtml(methodAr[p.method] || p.method || '-') + '</span></div><div class="ph-meta"><i class="fas fa-calendar"></i> ' + escapeHtml(p.date) + (p.time ? ' · ' + escapeHtml(p.time) : '') + (p.cashier ? ' · بواسطة ' + escapeHtml(p.cashier) : '') + '</div>' + (p.note ? '<div class="ph-note"><i class="fas fa-note-sticky"></i> ' + escapeHtml(p.note) + '</div>' : '') + '</div><div class="ph-remain">المتبقي بعده: ' + fmtMoney(p.remainingAfter) + ' ج.م</div></div>'; }).join('') + '</div>';
html += '</div>';
result.innerHTML = html;
}
async function recordCollectionPayment() {
if (!collectionStatement) { showToast('ابحث عن عميل أولاً', 'warning'); return; }
var amount = Number((document.getElementById('coll-amount').value || 0));
var method = (document.getElementById('coll-method').value || 'cash');
var note = (document.getElementById('coll-note').value || ' ').trim();
if (amount <= 0) { showToast('أدخل مبلغ أكبر من صفر', 'error'); return; }
var confirmed = await showConfirm({ title: 'تأكيد تسجيل القبض', message: 'سيتم تسجيل المبلغ على حساب العميل وتنزيله من المتبقي.', confirmText: 'تأكيد القبض', cancelText: 'إلغاء', icon: 'fa-hand-holding-dollar', details: [{ label: 'العميل', value: collectionStatement.customerName }, { label: 'المبلغ', value: fmtMoney(amount) + ' ج.م' }, { label: 'الطريقة', value: method === 'cash' ? 'نقدي' : 'فودافون كاش' }] });
if (!confirmed) return;
showLoading();
try {
var result = await apiPost('recordPayment', { customerName: collectionStatement.customerName, amount: amount, method: method, note: note, cashier: currentUser.username || '' });
if (result.error) throw new Error(result.error);
showToast('تم تسجيل القبض (' + fmtMoney(amount) + ' ج.م) — المتبقي الجديد: ' + fmtMoney(result.remainingAfter) + ' ج.م', 'success', '✅ قبض مسجّل');
await searchCollectionCustomer();
} catch (err) { showToast('خطأ: ' + err.message, 'error'); }
hideLoading();
}
function clearCollectionForm() { loadCollections(); }
async function loadExpenses() {
if (currentUser.role !== 'manager') return;
showLoading();
try {
var res = await apiGet('getExpenses'); var data = Array.isArray(res) ? res : (res.expenses || []); var list = document.getElementById('expenses-list'); if (!list) return;
if (!data.length) { list.innerHTML = '<div class="empty-state">لا توجد مصروفات</div>'; hideLoading(); return; }
var total = 0;
var html = data.map(function (e) { var amount = safeNum(e.amount); total += amount; return '<div class="expense-item"><div class="expense-info"><div class="expense-name">' + escapeHtml(e.expenseName || e.name || '') + '</div><div class="expense-date">' + escapeHtml(e.date || '') + '</div></div><div class="expense-amount">' + amount.toFixed(2) + ' ج.م</div></div>'; }).join('');
html += '<div class="expenses-total"><span>الإجمالي (' + data.length + ' مصروف)</span><span>' + total.toFixed(2) + ' ج.م</span></div>';
list.innerHTML = html;
} catch (err) { showToast('خطأ: ' + err.message, 'error'); }
hideLoading();
}
async function saveExpense() {
var desc = document.getElementById('exp-desc').value.trim(); var amount = Number(document.getElementById('exp-amount').value) || 0;
if (!desc || !amount) { showToast('الوصف والمبلغ مطلوبان', 'error'); return; }
showLoading();
try { var result = await apiPost('saveExpense', { expenseData: { description: desc, amount: amount } }); if (result.error) throw new Error(result.error); showToast('تم إضافة المصروف بنجاح', 'success', '✅ مصروف جديد'); document.getElementById('exp-desc').value = ''; document.getElementById('exp-amount').value = ''; loadExpenses(); }
catch (err) { showToast('خطأ: ' + err.message, 'error'); }
hideLoading();
}
function searchWasteProduct(query) { clearTimeout(wasteSearchTimer); if (query.length < 2) { document.getElementById('waste-product-results').classList.add('hidden'); return; } wasteSearchTimer = setTimeout(function () { doSearchWasteProduct(query); }, 300); }
async function doSearchWasteProduct(query) {
var div = document.getElementById('waste-product-results'); if (!div) return;
try {
var results = await apiGet('searchProducts', { query: query });
if (results.error || !Array.isArray(results) || !results.length) div.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-tertiary);">لا توجد نتائج</div>';
else div.innerHTML = results.map(function (p) { return '<div onclick="selectWasteProduct(\'' + encodeURIComponent(p.name) + '\', ' + (p.originalPrice || 0) + ')"><div><span style="font-weight:600;">' + escapeHtml(p.name) + '</span><span style="font-size:12px; color:var(--text-tertiary); margin-right:8px;">- ' + safeNum(p.originalPrice) + ' ج.م | المخزون: ' + safeNum(p.stock) + '</span></div></div>'; }).join('');
div.classList.remove('hidden');
} catch (err) { showToast('خطأ: ' + err.message, 'error'); }
}
function selectWasteProduct(encodedName, price) { var name = decodeURIComponent(encodedName); selectedWasteProduct = { id: name, name: name, price: price }; document.getElementById('waste-product-name').value = name; document.getElementById('waste-price').value = price; document.getElementById('waste-product-results').classList.add('hidden'); document.getElementById('waste-search').value = name; }
async function saveWaste() {
if (!selectedWasteProduct) { showToast('اختر المنتج أولاً', 'error'); return; }
var qty = Number(document.getElementById('waste-qty').value) || 0; if (!qty) { showToast('الكمية مطلوبة', 'error'); return; }
showLoading();
try {
var result = await apiPost('saveWaste', { wasteData: { productId: selectedWasteProduct.id, productName: selectedWasteProduct.name, quantity: qty, originalPrice: selectedWasteProduct.price } }); if (result.error) throw new Error(result.error);
showToast('تم تسجيل الهالك بنجاح', 'success', '✅ هالك مسجل');
['waste-search','waste-qty','waste-product-name','waste-price'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
selectedWasteProduct = null; loadWaste();
} catch (err) { showToast('خطأ: ' + err.message, 'error'); }
hideLoading();
}
async function loadWaste() {
if (currentUser.role !== 'manager') return;
showLoading();
try {
var waste = await apiGet('getWaste'); var data = Array.isArray(waste) ? waste : []; var list = document.getElementById('waste-list'); if (!list) return;
if (!data.length) { list.innerHTML = '<div class="empty-state">لا يوجد هالك مسجل</div>'; hideLoading(); return; }
list.innerHTML = data.map(function (w) { return '<div class="waste-item"><div><span style="font-weight:600; color:#fbbf24;">' + escapeHtml(w[2] || w.productName || '') + '</span><br><span style="font-size:12px; color:var(--text-tertiary);">الكمية: ' + safeNum(w[3] || w.quantityWasted) + '</span></div><span style="font-weight:700; color:#fbbf24; font-size:16px; font-family:var(--font-mono);">' + safeNum(w[6] || w.totalPrice).toFixed(2) + ' ج.م</span></div>'; }).join('');
} catch (err) { showToast('خطأ: ' + err.message, 'error'); }
hideLoading();
}
async function loadReport() {
var month = Number(document.getElementById('report-month').value); var year = Number(document.getElementById('report-year').value);
showLoading();
try {
var data = await apiGet('getReport', { month: month, year: year }); if (data.error) throw new Error(data.error);
var html = '<div class="glass-panel"><h3 style="font-size:20px; margin-bottom:20px;">📊 تقرير ' + MONTH_NAMES[month - 1] + ' ' + year + '</h3><div class="grid-4"><div style="padding:16px; background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.2); border-radius:var(--radius-md);"><div style="font-size:11px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">إجمالي المبيعات</div><div style="font-size:24px; font-weight:800; color:var(--brand-blue-bright); font-family:var(--font-mono);">' + fmtMoney(data.totalSales) + ' ج.م</div></div><div style="padding:16px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); border-radius:var(--radius-md);"><div style="font-size:11px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">المحصل</div><div style="font-size:24px; font-weight:800; color:var(--success-bright); font-family:var(--font-mono);">' + fmtMoney(data.totalPaid) + ' ج.م</div></div><div style="padding:16px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); border-radius:var(--radius-md);"><div style="font-size:11px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">المديونية</div><div style="font-size:24px; font-weight:800; color:var(--danger-bright); font-family:var(--font-mono);">' + fmtMoney(data.totalUnpaid) + ' ج.م</div></div><div style="padding:16px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.2); border-radius:var(--radius-md);"><div style="font-size:11px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">تكلفة المنتجات</div><div style="font-size:24px; font-weight:800; color:#fbbf24; font-family:var(--font-mono);">' + fmtMoney(data.totalCost) + ' ج.م</div></div></div><div class="grid-4" style="margin-top:16px;"><div style="padding:16px; background:rgba(139,92,246,0.1); border:1px solid rgba(139,92,246,0.2); border-radius:var(--radius-md);"><div style="font-size:11px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">الربح الإجمالي</div><div style="font-size:24px; font-weight:800; color:#a78bfa; font-family:var(--font-mono);">' + fmtMoney(data.grossProfit) + ' ج.م</div></div><div style="padding:16px; background:rgba(236,72,153,0.1); border:1px solid rgba(236,72,153,0.2); border-radius:var(--radius-md);"><div style="font-size:11px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">المصروفات</div><div style="font-size:24px; font-weight:800; color:#f472b6; font-family:var(--font-mono);">' + fmtMoney(data.totalExpenses) + ' ج.م</div></div><div style="padding:16px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); border-radius:var(--radius-md);"><div style="font-size:11px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">صافي الربح</div><div style="font-size:24px; font-weight:800; color:var(--success-bright); font-family:var(--font-mono);">' + fmtMoney(data.netProfit) + ' ج.م</div></div><div style="padding:16px; background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.2); border-radius:var(--radius-md);"><div style="font-size:11px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">عدد عمليات البيع</div><div style="font-size:24px; font-weight:800; color:var(--brand-blue-bright); font-family:var(--font-mono);">' + safeNum(data.salesCount) + '</div></div></div></div>';
if (data.productSummary && data.productSummary.length > 0) html += '<div class="glass-panel"><h4 style="margin-bottom:16px;">🏆 ملخص المنتجات المباعة</h4><div class="table-responsive"><table class="table-modern"><thead><tr><th>المنتج</th><th>الكمية</th><th>سعر المنتج الأساسي</th><th>إجمالي التكلفة</th><th>الإجمالي</th><th>الربح</th></tr></thead><tbody>' + data.productSummary.map(function (p) { return '<tr><td style="font-weight:600;">' + escapeHtml(p.name) + '</td><td style="font-family:var(--font-mono);">' + safeNum(p.qty) + '</td><td style="font-family:var(--font-mono);">' + fmtMoney(p.costPrice) + ' ج.م</td><td style="font-family:var(--font-mono); color:#fbbf24;">' + fmtMoney(p.totalCost) + ' ج.م</td><td style="font-weight:700; font-family:var(--font-mono);">' + fmtMoney(p.total) + ' ج.م</td><td style="font-weight:700; font-family:var(--font-mono); color:var(--success-bright);">' + fmtMoney(p.profit) + ' ج.م</td></tr>'; }).join('') + '</tbody></table></div></div>';
if (data.expenses && data.expenses.length > 0) html += '<div class="glass-panel"><h4 style="margin-bottom:16px;">💰 مصروفات الشهر</h4>' + data.expenses.map(function (e) { return '<div style="border-bottom:1px solid var(--border-subtle); padding:10px 0; display:flex; justify-content:space-between;"><span>' + escapeHtml(e.date) + ' - ' + escapeHtml(e.description) + '</span><span style="font-weight:700; color:var(--danger-bright); font-family:var(--font-mono);">' + fmtMoney(e.amount) + ' ج.م</span></div>'; }).join('') + '</div>';
document.getElementById('report-content').innerHTML = html;
} catch (err) { showToast('خطأ: ' + err.message, 'error'); }
hideLoading();
}
async function updatePaymentStatus(rowId, encodedCustomer, amount, encodedProduct) {
if (!rowId) { showToast('لا يوجد معرف للصف', 'error', 'خطأ'); return; }
var customerName = decodeURIComponent(encodedCustomer || ''); var productName = decodeURIComponent(encodedProduct || '');
var confirmed = await showConfirm({ title: 'تأكيد استلام المبلغ', message: 'هل تريد تأكيد استلام المبلغ وتغيير حالة الدفع إلى "تم الدفع"؟', confirmText: 'نعم، تم الدفع', cancelText: 'إلغاء', icon: 'fa-money-bill-wave', details: [{ label: 'اسم العميل', value: customerName }, { label: 'المنتج', value: productName || '-' }, { label: 'المبلغ', value: fmtMoney(amount) + ' ج.م' }, { label: 'الحالة الجديدة', value: 'تم الدفع ✅' }] });
if (!confirmed) { showToast('تم إلغاء العملية', 'info', 'ℹ️ إلغاء'); return; }
showLoading();
try {
var result = await apiPost('updatePayment', { rowId: rowId, newStatus: 'تم الدفع' }); if (result.error) throw new Error(result.error);
showToast('تم تحديث حالة الدفع للعميل <strong>' + escapeHtml(customerName) + '</strong> بمبلغ <strong>' + fmtMoney(amount) + ' ج.م</strong>', 'success', '✅ تم تحديث حالة الدفع');
await loadDashboard(); if (currentSection === 'customers') loadCustomers(); if (currentSection === 'collections' && collectionStatement) searchCollectionCustomer();
} catch (err) { showToast(err.message, 'error', '❌ فشل التحديث'); }
hideLoading();
}
function initPeriodTabs() {
var tabs = document.querySelectorAll('.chart-tab');
tabs.forEach(function (tab) { tab.addEventListener('click', function () { tabs.forEach(function (t) { t.classList.remove('active'); }); this.classList.add('active'); var periodMap = { '6 أشهر': '6months', 'سنة': '1year', 'الكل': 'all' }; loadSalesData(periodMap[this.textContent.trim()] || '6months'); }); });
}
async function loadSalesData(period) {
period = period || '6months';
showLoading();
try {
var data = await apiGet('getSalesData', { period: period }); if (data.error) throw new Error(data.error);
if (charts.main) { charts.main.updateSeries([{ data: data.revenue || [] }, { data: data.cost || [] }, { data: data.profit || [] }]); charts.main.updateOptions({ xaxis: { categories: data.labels || [] } }); }
var names = { '6months': '6 أشهر', '1year': 'سنة', 'all': 'الكل' }; showToast('تم تحميل بيانات ' + (names[period] || period), 'success');
} catch (err) { showToast('خطأ: ' + err.message, 'error'); }
hideLoading();
}
function renderPermissionsCheckboxes(selected) {
selected = selected || []; var box = document.getElementById('permissions-box'); if (!box) return;
box.innerHTML = PERMISSIONS.map(function (p) { return '<label class="permission-item"><input type="checkbox" value="' + p.id + '" ' + (selected.indexOf(p.id) !== -1 ? 'checked' : '') + '><span>' + p.name + '</span></label>'; }).join('');
}
function toggleRolePermissions() { var role = document.getElementById('user-role').value; var box = document.getElementById('permissions-box'); if (!box) return; box.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { if (role === 'manager') { cb.checked = true; cb.disabled = true; } else cb.disabled = false; }); }
async function loadUsers() {
if (currentUser.role !== 'manager') { var list = document.getElementById('users-list'); if (list) list.innerHTML = '<div class="empty-state">هذه الصفحة للمدير فقط</div>'; return; }
showLoading();
try { var res = await apiGet('getUsers', { requestorUsername: currentUser.username, requestorRole: currentUser.role }); if (res.error) throw new Error(res.error); usersCache = res.users || []; renderUsers(); }
catch (err) { showToast(err.message, 'error'); }
hideLoading();
}
function renderUsers() {
var list = document.getElementById('users-list'); if (!list) return;
if (!usersCache.length) { list.innerHTML = '<div class="empty-state">لا يوجد مستخدمون</div>'; return; }
list.innerHTML = usersCache.map(function (u) { var roleText = u.role === 'manager' ? 'مدير' : 'موظف'; var roleBadge = u.role === 'manager' ? 'badge-green' : 'badge-orange'; var permissionsText = u.role === 'manager' ? 'كل الصلاحيات' : (u.permissions || []).map(function (id) { var p = PERMISSIONS.find(function (x) { return x.id === id; }); return p ? p.name : id; }).join('، '); return '<div class="user-row"><div class="user-meta"><strong>' + escapeHtml(u.username) + '</strong><span class="badge ' + roleBadge + '" style="width:max-content;">' + roleText + '</span><small style="color:var(--text-tertiary);">' + escapeHtml(permissionsText || 'لا توجد صلاحيات') + '</small></div><div class="user-actions"><button class="btn-ghost" onclick="editUser(\'' + encodeURIComponent(u.username) + '\')"><i class="fas fa-pen"></i> تعديل</button><button class="btn-ghost" style="color:var(--danger-bright);" onclick="deleteUser(\'' + encodeURIComponent(u.username) + '\')"><i class="fas fa-trash"></i> حذف</button></div></div>'; }).join('');
}
function editUser(encodedUsername) { var username = decodeURIComponent(encodedUsername); var user = usersCache.find(function (u) { return u.username === username; }); if (!user) return; document.getElementById('user-edit-original').value = user.username; document.getElementById('user-name').value = user.username; document.getElementById('user-pass').value = ''; document.getElementById('user-role').value = user.role || 'employee'; renderPermissionsCheckboxes(user.permissions || []); toggleRolePermissions(); }
function resetUserForm() { document.getElementById('user-edit-original').value = ''; document.getElementById('user-name').value = ''; document.getElementById('user-pass').value = ''; document.getElementById('user-role').value = 'employee'; renderPermissionsCheckboxes([]); toggleRolePermissions(); }
async function saveUser() {
var originalUsername = document.getElementById('user-edit-original').value.trim(); var username = document.getElementById('user-name').value.trim();
var password = document.getElementById('user-pass').value; var role = document.getElementById('user-role').value;
var permissions = role === 'manager' ? PERMISSIONS.map(function (p) { return p.id; }) : Array.from(document.querySelectorAll('#permissions-box input:checked')).map(function (cb) { return cb.value; });
if (!username) { showToast('اسم المستخدم مطلوب', 'error'); return; }
showLoading();
try { var result = await apiPost('saveUser', { requestorUsername: currentUser.username, requestorRole: currentUser.role, userData: { originalUsername: originalUsername, username: username, password: password, role: role, permissions: permissions } }); if (result.error) throw new Error(result.error); showToast(result.message || 'تم حفظ المستخدم', 'success', '✅ مستخدم'); resetUserForm(); loadUsers(); }
catch (err) { showToast(err.message, 'error'); }
hideLoading();
}
async function deleteUser(encodedUsername) {
var username = decodeURIComponent(encodedUsername);
var confirmed = await showConfirm({ title: 'حذف مستخدم', message: 'هل أنت متأكد من حذف المستخدم "' + username + '"؟', confirmText: 'نعم، احذف', cancelText: 'إلغاء', icon: 'fa-user-minus' });
if (!confirmed) return;
showLoading();
try { var result = await apiPost('deleteUser', { requestorUsername: currentUser.username, requestorRole: currentUser.role, username: username }); if (result.error) throw new Error(result.error); showToast(result.message || 'تم حذف المستخدم', 'success', '✅ حذف'); loadUsers(); }
catch (err) { showToast(err.message, 'error'); }
hideLoading();
}
// ===== ✅ تقفيل الشيفت =====
function toLocalInput(d) {
var p = function (n) { return String(n).padStart(2, '0'); };
return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function loadShift() {
var fromEl = document.getElementById('shift-from'), toEl = document.getElementById('shift-to');
if (fromEl && !fromEl.value) applyShiftPreset('today', document.querySelector('.shift-preset'));
}
function applyShiftPreset(preset, el) {
document.querySelectorAll('.shift-preset').forEach(function (b) { b.classList.remove('active'); });
if (el) el.classList.add('active');
var now = new Date(), from = new Date(), to = new Date();
if (preset === 'today') { from.setHours(0, 0, 0, 0); }
else if (preset === 'yesterday') { from.setDate(from.getDate() - 1); from.setHours(0, 0, 0, 0); to = new Date(from); to.setHours(23, 59, 0, 0); }
else if (preset === 'week') { from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0); }
else if (preset === 'month') { from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0); }
else if (preset === 'lastmonth') { from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0); to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 0, 0); }
document.getElementById('shift-from').value = toLocalInput(from);
document.getElementById('shift-to').value = toLocalInput(to);
}
async function generateShiftReport() {
var from = document.getElementById('shift-from').value, to = document.getElementById('shift-to').value;
if (!from || !to) { showToast('حدد فترة البداية والنهاية', 'warning'); return; }
var box = document.getElementById('shift-result');
box.innerHTML = '<div class="glass-panel"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i> جاري إعداد التقرير...</div></div>';
showLoading();
try {
var data = await apiGet('getShiftReport', { from: from, to: to });
if (data.error) throw new Error(data.error);
renderShiftReport(data);
} catch (err) { showToast('خطأ: ' + err.message, 'error'); box.innerHTML = ''; }
hideLoading();
}
function shiftKpi(label, val, icon, cls, isCount) {
return '<div class="stmt-kpi ' + cls + '"><div class="stmt-kpi-top"><i class="fas ' + icon + '"></i><span>' + label + '</span></div><div class="stmt-kpi-val">' + (isCount ? safeNum(val) : fmtMoney(val)) + '</div></div>';
}
function renderShiftReport(data) {
var box = document.getElementById('shift-result'); if (!box) return;
var s = data.summary || {};
var netCash = safeNum(s.netCash);
var html = '';
html += '<div class="shift-report-head"><div><h3 class="panel-title" style="margin:0"><i class="fas fa-file-invoice-dollar"></i> تقرير تقفيل الشيفت</h3><div class="shift-period-label"><i class="fas fa-calendar-range"></i> من ' + escapeHtml(data.from) + ' — إلى ' + escapeHtml(data.to) + '</div></div></div>';
html += '<div class="shift-kpis">';
html += shiftKpi('إجمالي المبيعات', s.totalBilled, 'fa-file-invoice', 'kpi-blue');
html += shiftKpi('مدفوع وقت البيع', s.paidAtSale, 'fa-money-bill-wave', 'kpi-green');
html += shiftKpi('آجل (متبقي)', s.unpaidAtSale, 'fa-clock', 'kpi-red');
html += shiftKpi('إجمالي المقبوض', s.totalCollected, 'fa-hand-holding-dollar', 'kpi-cyan');
html += shiftKpi('المصروفات', s.totalExpenses, 'fa-receipt', 'kpi-pink');
html += shiftKpi('الهالك', s.totalWaste, 'fa-trash-can', 'kpi-orange');
html += shiftKpi('عدد الفواتير', s.invoiceCount, 'fa-receipt', 'kpi-blue', true);
html += shiftKpi('متوسط الفاتورة', s.avgInvoice, 'fa-calculator', 'kpi-green');
html += '</div>';
html += '<div class="shift-netcash ' + (netCash >= 0 ? 'positive' : 'negative') + '"><div class="netcash-label"><i class="fas fa-vault"></i> صافي النقدية المتوقعة في الدرج</div><div class="netcash-formula">نقدي مبيعات (' + fmtMoney(s.pbCash) + ') + قبض نقدي (' + fmtMoney(s.collCash) + ') − مصروفات (' + fmtMoney(s.totalExpenses) + ')</div><div class="netcash-value">' + fmtMoney(netCash) + ' ج.م</div></div>';
html += '<div class="shift-paybreak"><div class="pb-row"><div class="pb-icon" style="background:#10b981"><i class="fas fa-money-bill-wave"></i></div><div class="pb-info"><div class="pb-top"><span class="pb-label">نقدي (مبيعات)</span><span class="pb-amount">' + fmtMoney(s.pbCash) + ' ج.م</span></div></div></div><div class="pb-row"><div class="pb-icon" style="background:#e60000"><i class="fas fa-mobile-screen"></i></div><div class="pb-info"><div class="pb-top"><span class="pb-label">فودافون كاش (مبيعات)</span><span class="pb-amount">' + fmtMoney(s.pbVodafone) + ' ج.م</span></div></div></div><div class="pb-row"><div class="pb-icon" style="background:#f59e0b"><i class="fas fa-clock"></i></div><div class="pb-info"><div class="pb-top"><span class="pb-label">آجل</span><span class="pb-amount">' + fmtMoney(s.pbCredit) + ' ج.م</span></div></div></div></div>';
html += '<div class="glass-panel"><h3 class="panel-title"><i class="fas fa-list-check"></i> حركة الفترة (فواتير + قبض) — ' + (data.entries || []).length + ' عملية</h3>';
if (!(data.entries || []).length) html += '<div class="empty-state"><i class="fas fa-inbox"></i> لا توجد عمليات في هذه الفترة</div>';
else {
html += '<div class="stmt-table-wrap"><table class="table-modern stmt-table"><thead><tr><th>التاريخ</th><th>الوقت</th><th>العميل</th><th>البيان</th><th class="num">مدين</th><th class="num">دائن</th><th class="num">الرصيد</th></tr></thead><tbody>';
(data.entries || []).forEach(function (e, i) {
var isSale = e.type === 'sale';
var rowCls = isSale ? 'stmt-row-sale' : 'stmt-row-pay';
var typeBadge = isSale ? '<span class="stmt-type sale"><i class="fas fa-file-invoice-dollar"></i> فاتورة</span>' : '<span class="stmt-type pay"><i class="fas fa-arrow-down-to-bracket"></i> قبض</span>';
var clickAttr = (isSale && e.rowId) ? ' onclick="openInvoiceDetails(' + e.rowId + ')" style="cursor:pointer" title="اضغط لعرض تفاصيل الفاتورة"' : '';
html += '<tr class="' + rowCls + '"' + clickAttr + ' style="animation-delay:' + Math.min(i * 40, 600) + 'ms"><td class="mono">' + escapeHtml(e.date || '') + '</td><td class="mono dim">' + escapeHtml(e.time || '--') + '</td><td style="font-weight:600">' + escapeHtml(e.customer || '') + '</td><td class="stmt-desc"><div class="stmt-desc-main">' + typeBadge + ' ' + escapeHtml(e.description || '—') + (e.cashier ? ' <span style="color:var(--text-tertiary);font-size:11px;"><i class="fas fa-user-tie"></i> ' + escapeHtml(e.cashier) + '</span>' : '') + '</div>' + (isSale ? '<div class="stmt-desc-meta">إجمالي ' + fmtMoney(e.total) + ' · مدفوع ' + fmtMoney(e.paid) + '</div>' : '') + '</td><td class="num debit">' + ((isSale && e.debit > 0.001) ? fmtMoney(e.debit) : '') + '</td><td class="num credit">' + ((!isSale && e.credit > 0.001) ? fmtMoney(e.credit) : '') + '</td><td class="num running">' + fmtMoney(e.running) + '</td></tr>';
});
html += '</tbody></table></div>';
}
html += '</div>';
html += '<div class="glass-panel"><h3 class="panel-title"><i class="fas fa-receipt"></i> المصروفات (' + (data.expenses || []).length + ') — ' + fmtMoney(s.totalExpenses) + ' ج.م</h3>';
if (!(data.expenses || []).length) html += '<div class="empty-state"><i class="fas fa-circle-check"></i> لا توجد مصروفات في الفترة</div>';
else { html += '<div class="expenses-list">' + (data.expenses || []).map(function (e) { return '<div class="expense-item"><div class="expense-info"><div class="expense-name">' + escapeHtml(e.name) + '</div><div class="expense-date">' + escapeHtml(e.date) + '</div></div><div class="expense-amount">' + fmtMoney(e.amount) + ' ج.م</div></div>'; }).join('') + '</div>'; }
html += '</div>';
html += '<div class="glass-panel"><h3 class="panel-title"><i class="fas fa-trash-can"></i> الهالك (' + (data.waste || []).length + ') — ' + fmtMoney(s.totalWaste) + ' ج.م</h3>';
if (safeNum(s.undatedWasteCount) > 0) html += '<div style="font-size:12px;color:#fbbf24;margin-bottom:10px"><i class="fas fa-triangle-exclamation"></i> يوجد ' + s.undatedWasteCount + ' تسجيل هالك قديم بدون تاريخ (غير محسوب في الفترة)</div>';
if (!(data.waste || []).length) html += '<div class="empty-state"><i class="fas fa-circle-check"></i> لا يوجد هالك في الفترة</div>';
else { html += '<div class="waste-list">' + (data.waste || []).map(function (w) { return '<div class="waste-item"><div><span style="font-weight:600;color:#fbbf24">' + escapeHtml(w.productName) + '</span><br><span style="font-size:12px;color:var(--text-tertiary)">الكمية: ' + safeNum(w.quantityWasted) + ' · ' + escapeHtml(w.date || '') + (w.time ? ' ' + escapeHtml(w.time) : '') + '</span></div><span style="font-weight:700;color:#fbbf24;font-family:var(--font-mono)">' + fmtMoney(w.totalPrice) + ' ج.م</span></div>'; }).join('') + '</div>'; }
html += '</div>';
html += '<div class="glass-panel"><h3 class="panel-title"><i class="fas fa-boxes-stacked"></i> المنتجات المباعة في الفترة</h3>';
if (!(data.products || []).length) html += '<div class="empty-state"><i class="fas fa-inbox"></i> لا توجد مبيعات</div>';
else { html += '<div class="table-responsive"><table class="table-modern"><thead><tr><th>المنتج</th><th>الكمية</th><th>الإيراد</th></tr></thead><tbody>' + (data.products || []).map(function (p) { return '<tr><td style="font-weight:600">' + escapeHtml(p.name) + '</td><td style="font-family:var(--font-mono)">' + safeNum(p.qty) + '</td><td style="font-family:var(--font-mono);color:var(--success-bright)">' + fmtMoney(p.revenue) + ' ج.م</td></tr>'; }).join('') + '</tbody></table></div>'; }
html += '</div>';
box.innerHTML = html;
}
window.doLogin = doLogin; window.doLogout = doLogout; window.toggleTheme = toggleTheme; window.toggleSidebar = toggleSidebar;
window.showSection = showSection; window.refreshCurrentSection = refreshCurrentSection;
window.openCommandPalette = openCommandPalette; window.closeCommandPalette = closeCommandPalette; window.filterCommands = filterCommands; window.executeCommand = executeCommand;
window.searchPOS = searchPOS; window.addToCart = addToCart; window.updateQty = updateQty; window.removeFromCart = removeFromCart;
window.addInvoiceTab = addInvoiceTab; window.selectInvoice = selectInvoice; window.closeInvoiceTab = closeInvoiceTab;
window.updateActiveInvoiceCustomer = updateActiveInvoiceCustomer; window.updateActiveInvoicePhone = updateActiveInvoicePhone;
window.onPosPaidInput = onPosPaidInput; window.printActiveInvoice = printActiveInvoice; window.clearActiveInvoice = clearActiveInvoice;
window.setPaymentMethod = setPaymentMethod; window.saveCurrentInvoice = saveCurrentInvoice; window.renderPaymentButtons = renderPaymentButtons;
window.loadInventory = loadInventory; window.addProduct = addProduct;
window.loadCustomers = loadCustomers; window.setCustomerFilter = setCustomerFilter; window.doSearchCustomer = doSearchCustomer; window.doSearchCustomerExact = doSearchCustomerExact; window.openCustomerInvoices = openCustomerInvoices; window.closeCustomerModal = closeCustomerModal; window.openInvoiceDetails = openInvoiceDetails;
window.loadCollections = loadCollections; window.searchCollectionCustomer = searchCollectionCustomer; window.pickCollectionCustomer = pickCollectionCustomer; window.recordCollectionPayment = recordCollectionPayment; window.clearCollectionForm = clearCollectionForm;
window.loadExpenses = loadExpenses; window.saveExpense = saveExpense;
window.searchWasteProduct = searchWasteProduct; window.selectWasteProduct = selectWasteProduct; window.saveWaste = saveWaste; window.loadWaste = loadWaste;
window.loadReport = loadReport; window.updatePaymentStatus = updatePaymentStatus;
window.loadUsers = loadUsers; window.saveUser = saveUser; window.resetUserForm = resetUserForm; window.editUser = editUser; window.deleteUser = deleteUser; window.toggleRolePermissions = toggleRolePermissions;
window.applyShiftPreset = applyShiftPreset; window.generateShiftReport = generateShiftReport;
window.toggleUnlimited = toggleUnlimited;