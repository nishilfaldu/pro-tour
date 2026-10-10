export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter(child => child != null && child !== false));
  return el;
}

export const uid = () => `:r${Math.random().toString(36).slice(2, 8)}:`;

let closeOpenPopup = null;

function openPopup(anchor, popup, onClose) {
  closeOpenPopup?.();
  const box = anchor.getBoundingClientRect();
  popup.style.top = `${box.bottom + 6}px`;
  popup.style.left = `${box.left}px`;
  popup.style.minWidth = `${box.width}px`;
  document.body.append(popup);
  requestAnimationFrame(() => popup.classList.add('open'));
  const outside = event => {
    if (!popup.contains(event.target) && !anchor.contains(event.target)) close();
  };
  const escape = event => {
    if (event.key === 'Escape') close();
  };
  function close() {
    popup.remove();
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escape, true);
    closeOpenPopup = null;
    onClose?.();
  }
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', escape, true);
  closeOpenPopup = close;
  return close;
}

export function Menu(anchor, items) {
  const menu = h('div', { class: 'popup menu', role: 'menu' });
  const close = openPopup(anchor, menu, () => anchor.setAttribute('aria-expanded', 'false'));
  anchor.setAttribute('aria-expanded', 'true');
  menu.append(...items.map(item => h('button', {
    type: 'button',
    role: 'menuitem',
    class: 'menu-item',
    onclick: () => {
      close();
      item.action();
    },
  }, item.label)));
}

export function toast(message) {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}
