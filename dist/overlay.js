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
    .menu { position: fixed; z-index: 3; display: none; padding: 4px; border-radius: 8px; background: #fff; color: #111;
      font: 15px/1.2 system-ui, -apple-system, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.08); }
    .menu div { padding: 7px 12px; border-radius: 5px; white-space: nowrap; transition: background .15s, color .15s; }
    .menu div.on { background: #5b8cff; color: #fff; }
    .ring { position: fixed; border: 2px solid #5b8cff; border-radius: 8px; z-index: 2; opacity: 0;
      box-shadow: 0 0 0 5px rgba(91,140,255,.18); transition: opacity .25s, left .4s, top .4s, width .4s, height .4s; }
    .notices { position: fixed; top: 20px; right: 20px; z-index: 5; width: min(440px, 46vw); display: flex; flex-direction: column;
      gap: 8px; align-items: stretch; }
    .notices.low { top: auto; bottom: 20px; }
    .notice { padding: 10px 15px; border-radius: 12px; background: rgba(15,18,26,.92); color: #fff;
      font: 500 15px/1.35 system-ui, -apple-system, sans-serif; box-shadow: 0 8px 22px rgba(0,0,0,.22); }
    .notice b { margin-right: 8px; }
    .notice.step { display: flex; gap: 12px; align-items: center; padding: 12px 16px; font: 600 18px/1.3 system-ui, -apple-system, sans-serif; }
    .notice.step .badge { flex: none; font: 700 11px/1 ui-monospace, SFMono-Regular, monospace; letter-spacing: .1em;
      padding: 6px 8px; border-radius: 6px; background: #5b8cff; }
    .notice.pass b { color: #4ade80; }
    .notice.fail { background: rgba(127,29,29,.94); }
    .notice.fail b { color: #fecaca; }
    .card { position: fixed; inset: 0; z-index: 6; display: grid; place-content: center; gap: 16px; padding: 0 14%;
      text-align: center; background: rgba(11,13,19,.94); color: #fff; font-family: system-ui, -apple-system, sans-serif;
      opacity: 0; transition: opacity .4s; }
    .card.on { opacity: 1; }
    .card .eyebrow { font: 700 13px/1 ui-monospace, SFMono-Regular, monospace; letter-spacing: .16em; color: #8fb0ff; text-transform: uppercase; }
    .card h1 { margin: 0; font: 700 42px/1.15 system-ui, -apple-system, sans-serif; }
    .card p { margin: 0; font: 400 20px/1.45 system-ui, -apple-system, sans-serif; color: #c8cede; }
  `;
  const ARROW =
    '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2v18l5-4.5 3.5 6.5 3-1.5-3.5-6.5H19z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const TIP = { x: 5, y: 2.5 };
  const stored = JSON.parse(sessionStorage.getItem('__tour_cursor') || 'null');
  const position = stored || { x: innerWidth * 0.5, y: innerHeight * 0.62 };
  // The notices sit top right, or bottom right once they have been in the way (see avoid).
  let low = sessionStorage.getItem('__tour_notices') === 'low';
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
    host.style.cssText =
      'display:block;position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;';
    // Closed, so the tour's locators (which pierce open shadow roots) cannot match a notice.
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>${STYLE}</style><div class="ring"></div><div class="menu"></div><div class="cursor">${ARROW}</div>
      <div class="notices"></div>
      <div class="card"><div class="eyebrow"></div><h1></h1><p></p></div>`;
    const $ = selector => shadow.querySelector(selector);
    ui = { ring: $('.ring'), menu: $('.menu'), cursor: $('.cursor'), notices: $('.notices'), card: $('.card') };
    ui.notices.classList.toggle('low', low);
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

  // The notices move to the other end of the screen when the element the cursor is going to is under them, such
  // as a button in a sticky header, unless it would be under them there too. They stay there until they are in
  // the way again.
  function avoid(box) {
    const { left, right, height } = ui.notices.getBoundingClientRect();
    const under = top => box.x < right && box.x + box.width > left && box.y < top + height && box.y + box.height > top;
    const [here, there] = low ? [innerHeight - 20 - height, 20] : [20, innerHeight - 20 - height];
    if (!height || !under(here) || under(there)) return;
    low = !low;
    sessionStorage.setItem('__tour_notices', low ? 'low' : 'top');
    ui.notices.classList.toggle('low', low);
    ui.notices.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
  }

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const appear = item =>
    item.animate(
      [
        { opacity: 0, transform: 'translateX(20px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 280, easing: 'ease-out' },
    );

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
      ripple
        .animate(
          [
            { transform: 'scale(.3)', opacity: 1 },
            { transform: 'scale(1.5)', opacity: 0 },
          ],
          { duration: 650, easing: 'ease-out' },
        )
        .finished.then(() => ripple.remove());
      ui.cursor.firstElementChild.animate([{ scale: 1 }, { scale: 0.82 }, { scale: 1 }], { duration: 220 });
    },
    ring(box) {
      mount();
      avoid(box);
      const pad = 6;
      Object.assign(ui.ring.style, {
        left: `${box.x - pad}px`,
        top: `${box.y - pad}px`,
        width: `${box.width + pad * 2}px`,
        height: `${box.height + pad * 2}px`,
        opacity: 1,
      });
    },
    clearRing() {
      mount();
      ui.ring.style.opacity = 0;
    },
    // Headless Chromium does not draw a native <select>'s open menu, so the overlay draws one.
    // Returns the box of the option at index `to`, for the cursor to move to.
    menu(box, labels, from) {
      mount();
      ui.menu.replaceChildren(
        ...labels.map((label, i) =>
          Object.assign(document.createElement('div'), { textContent: label, className: i === from ? 'on' : '' }),
        ),
      );
      Object.assign(ui.menu.style, {
        display: 'block',
        left: `${box.x}px`,
        minWidth: `${box.width}px`,
        top: `${box.y + box.height + 4}px`,
      });
      const height = ui.menu.getBoundingClientRect().height;
      if (box.y + box.height + 4 + height > innerHeight) ui.menu.style.top = `${Math.max(4, box.y - height - 4)}px`;
    },
    menuItem(index) {
      mount();
      for (const [i, item] of [...ui.menu.children].entries()) item.classList.toggle('on', i === index);
      const { x, y, width, height } = ui.menu.children[index].getBoundingClientRect();
      return { x, y, width, height };
    },
    hideMenu() {
      mount();
      ui.menu.style.display = 'none';
    },
    // One stack of notices: each step starts it afresh with its title, and its checks follow below.
    step(index, title) {
      mount();
      const item = document.createElement('div');
      item.className = 'notice step';
      const badge = Object.assign(document.createElement('span'), { className: 'badge', textContent: `STEP ${index}` });
      item.append(badge, title);
      ui.notices.replaceChildren(item);
      appear(item);
    },
    // state: 'pass' or 'fail'.
    check(text, state) {
      mount();
      const item = document.createElement('div');
      item.className = `notice ${state}`;
      item.append(Object.assign(document.createElement('b'), { textContent: state === 'fail' ? '✗' : '✓' }), text);
      ui.notices.append(item);
      appear(item);
      // The step's title stays; the oldest checks give way.
      while (ui.notices.children.length > 5) ui.notices.children[ui.notices.firstElementChild.classList.contains('step') ? 1 : 0].remove();
    },
    clearNotices() {
      mount();
      ui.notices.replaceChildren();
    },
    card(eyebrow, title, text) {
      mount();
      ui.card.querySelector('.eyebrow').textContent = eyebrow;
      ui.card.querySelector('h1').textContent = title;
      ui.card.querySelector('p').textContent = text || '';
      ui.card.classList.add('on');
    },
    hideCard() {
      mount();
      ui.card.classList.remove('on');
    },
  };
})();
