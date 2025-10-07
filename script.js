// ===== script.js - JS کد شخصی هدر =====
const customBtn = document.getElementById('custom-btn');
const customBox = document.getElementById('custom-box');

customBtn.addEventListener('click', () => {
  alert('دکمه شما کلیک شد!');
  customBox.style.background = '#6ee7b7a0'; // نمونه تغییر پس‌زمینه
});

