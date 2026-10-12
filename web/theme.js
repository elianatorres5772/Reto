// Tema claro/oscuro: se aplica antes de pintar (script síncrono en <head>) para evitar parpadeo.
// Sin elección guardada, sigue la preferencia del sistema operativo.
(() => {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const saved = () => { try { const value = localStorage.getItem('theme'); return value === 'dark' || value === 'light' ? value : null; } catch { return null; } };
  const apply = theme => { root.dataset.theme = theme; };
  apply(saved() ?? (media.matches ? 'dark' : 'light'));
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-toggle');
    if (!button) return;
    const sync = () => {
      const dark = root.dataset.theme === 'dark';
      button.textContent = dark ? '☀ Modo claro' : '☾ Modo oscuro';
      button.setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    };
    sync();
    button.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      apply(next); sync();
      try { localStorage.setItem('theme', next); } catch { /* sin almacenamiento: el cambio dura esta visita */ }
    });
    media.addEventListener('change', event => { if (!saved()) { apply(event.matches ? 'dark' : 'light'); sync(); } });
  });
})();
