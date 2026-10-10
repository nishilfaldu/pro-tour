(() => {
  if (window.__tour) return;

  const STYLE = `
    * { box-sizing: border-box; pointer-events: none; }
    .cursor { position: fixed; left: 0; top: 0; width: 30px; height: 30px; z-index: 4;
      transform: translate(var(--x), var(--y)); transition: transform var(--ms) cubic-bezier(.22,.8,.26,1);
      filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    .cursor svg { display: block; transform-origin: 5px 2.5px; }
    .ripple { position: fixed; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; z-index: 3;
      border: 3px solid #5b8cff; background: rgba(91,140,255,.25); }
    .ring { position: fixed; border: 2px solid #5b8cff; border-radius: 8px; z-index: 2; opacity: 0;
      box-shadow: 0 0 0 5px rgba(91,140,255,.18); transition: opacity .25s, left .4s, top .4s, width .4s, height .4s; }
    .caption { position: fixed; left: 50%; bottom: 28px; z-index: 5; max-width: 82%; display: flex; gap: 14px; align-items: center;
      padding: 13px 22px; border-radius: 14px; background: rgba(15,18,26,.9); color: #fff;
      font: 500 21px/1.3 system-ui, -apple-system, sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.25);
      transform: translate(-50%, 16px); opacity: 0; transition: opacity .3s, transform .3s; }
    .caption.on { opacity: 1; transform: translate(-50%, 0); }
    .badge { flex: none; font: 700 12px/1 ui-monospace, SFMono-Regular, monospace; letter-spacing: .1em;
      padding: 6px 8px; border-radius: 6px; background: #5b8cff; }
    .checks { position: fixed; top: 20px; right: 20px; z-index: 5; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
    .check { padding: 9px 15px; border-radius: 10px; background: rgba(15,18,26,.9); color: #fff;
      font: 500 15px/1.3 system-ui, -apple-system, sans-serif; box-shadow: 0 6px 18px rgba(0,0,0,.2); }
    .check b { margin-right: 8px; }
    .check.pass b { color: #4ade80; }
    .check.fail { background: rgba(127,29,29,.92); }
    .check.fail b { color: #fecaca; }
    .check.same { color: #c8cede; }
    .check.same b { color: #8b93a7; }
    .card { position: fixed; inset: 0; z-index: 6; display: grid; place-content: center; gap: 16px; padding: 0 14%;
      text-align: center; background: rgba(11,13,19,.94); color: #fff; font-family: system-ui, -apple-system, sans-serif;
      opacity: 0; transition: opacity .4s; }
    .card.on { opacity: 1; }
    .card .eyebrow { font: 700 13px/1 ui-monospace, SFMono-Regular, monospace; letter-spacing: .16em; color: #8fb0ff; text-transform: uppercase; }
    .card h1 { margin: 0; font: 700 42px/1.15 system-ui, -apple-system, sans-serif; }
    .card p { margin: 0; font: 400 20px/1.45 system-ui, -apple-system, sans-serif; color: #c8cede; }
  `;
  const ARROW = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2v18l5-4.5 3.5 6.5 3-1.5-3.5-6.5H19z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const TIP = { x: 5, y: 2.5 };
  const stored = JSON.parse(sessionStorage.getItem('__tour_cursor') || 'null');
  const position = stored || { x: innerWidth * 0.5, y: innerHeight * 0.62 };
  let host, ui;

  // Overlay lives in the top layer so it stays above modal dialogs, which are also top-layer.
  function raise() {
    if (host.matches(':popover-open')) host.hidePopover();
    host.showPopover();
  }

  function mount() {
    if (host?.isConnected) return raise();
    host = document.createElement('div');
    host.setAttribute('popover', 'manual');
    host.style.cssText = 'display:block;position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${STYLE}</style><div class="ring"></div><div class="cursor">${ARROW}</div>
      <div class="caption"><span class="badge"></span><span class="text"></span></div><div class="checks"></div>
      <div class="card"><div class="eyebrow"></div><h1></h1><p></p></div>`;
    const $ = selector => shadow.querySelector(selector);
    ui = { ring: $('.ring'), cursor: $('.cursor'), caption: $('.caption'), checks: $('.checks'), card: $('.card') };
    place(0);
    document.documentElement.append(host);
    raise();
    new MutationObserver(raise).observe(document.documentElement, { subtree: true, attributeFilter: ['open'] });
  }

  function place(ms) {
    ui.cursor.style.setProperty('--ms', `${ms}ms`);
    ui.cursor.style.setProperty('--x', `${position.x - TIP.x}px`);
    ui.cursor.style.setProperty('--y', `${position.y - TIP.y}px`);
    sessionStorage.setItem('__tour_cursor', JSON.stringify(position));
  }

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  window.__tour = {
    async moveTo(x, y, ms) {
      mount();
      Object.assign(position, { x, y });
      place(ms);
      await wait(ms);
    },
    press(x, y) {
      mount();
      const ripple = document.createElement('div');
      ripple.className = 'ripple';
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      ui.cursor.before(ripple);
      ripple.animate([{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 650, easing: 'ease-out' })
        .finished.then(() => ripple.remove());
      ui.cursor.firstElementChild.animate([{ scale: 1 }, { scale: .82 }, { scale: 1 }], { duration: 220 });
    },
    ring(box) {
      mount();
      const pad = 6;
      Object.assign(ui.ring.style, { left: `${box.x - pad}px`, top: `${box.y - pad}px`,
        width: `${box.width + pad * 2}px`, height: `${box.height + pad * 2}px`, opacity: 1 });
    },
    clearRing() { mount(); ui.ring.style.opacity = 0; },
    caption(badge, text) {
      mount();
      ui.caption.querySelector('.badge').textContent = badge;
      ui.caption.querySelector('.text').textContent = text;
      ui.caption.classList.add('on');
    },
    clearCaption() { mount(); ui.caption.classList.remove('on'); },
    // state: 'pass' (became true in this step), 'same' (was already true), or 'fail'.
    check(text, state) {
      mount();
      const item = document.createElement('div');
      item.className = `check ${state}`;
      item.innerHTML = `<b>${state === 'fail' ? '✗' : '✓'}</b>`;
      item.append(text);
      ui.checks.append(item);
      item.animate([{ opacity: 0, transform: 'translateX(20px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'ease-out' });
      while (ui.checks.children.length > 4) ui.checks.firstElementChild.remove();
    },
    clearChecks() { mount(); ui.checks.replaceChildren(); },
    card(eyebrow, title, text) {
      mount();
      ui.card.querySelector('.eyebrow').textContent = eyebrow;
      ui.card.querySelector('h1').textContent = title;
      ui.card.querySelector('p').textContent = text || '';
      ui.card.classList.add('on');
    },
    hideCard() { mount(); ui.card.classList.remove('on'); },
  };
})();
