// Immediate theme execution to prevent screen flash
(function() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
})();

// Initialize switcher buttons on DOM content load
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('theme-toggle');
  if (!toggleBtn) return;

  const iconEl = document.getElementById('theme-toggle-icon');

  function updateIcon(theme) {
    if (iconEl) {
      iconEl.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  // Set initial icon state
  const currentTheme = document.documentElement.getAttribute('data-theme');
  updateIcon(currentTheme);

  // Toggle theme click listener
  toggleBtn.addEventListener('click', () => {
    const targetTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', targetTheme);
    localStorage.setItem('theme', targetTheme);
    updateIcon(targetTheme);
  });
});
