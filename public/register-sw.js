// Service worker tạm tắt — hiện tại không cache app shell.
// Đoạn dưới chỉ chạy cleanup: gỡ SW cũ và xoá cache cho user đã từng cài.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    regs.forEach(function (r) { r.unregister(); });
  });
  if (window.caches && caches.keys) {
    caches.keys().then(function (keys) {
      keys.forEach(function (k) { caches.delete(k); });
    });
  }
}

// --- Đăng ký service worker (đã comment lại) ---
// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', function () {
//     navigator.serviceWorker.register('/sw.js');
//   });
// }
