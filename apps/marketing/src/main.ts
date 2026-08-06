const APP_URL = 'https://app.travelagencycrm.in';

function initMobileNav(): void {
  const nav = document.querySelector<HTMLElement>('.nav');
  const toggle = document.querySelector<HTMLButtonElement>('.nav-toggle');
  if (!nav || !toggle) return;

  const setOpen = (open: boolean) => {
    nav.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
  };

  toggle.addEventListener('click', () => {
    setOpen(nav.dataset.open !== 'true');
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setOpen(false));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.dataset.open === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
}

function setCurrentYear(): void {
  const el = document.querySelector<HTMLElement>('[data-current-year]');
  if (el) el.textContent = String(new Date().getFullYear());
}

initMobileNav();
setCurrentYear();
