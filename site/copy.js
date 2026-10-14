// A copy button copies the text of the element its data-copy names, and says so for two seconds.
for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const text = document.getElementById(button.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Selected';
      getSelection().selectAllChildren(document.getElementById(button.dataset.copy));
    }
    setTimeout(() => {
      button.textContent = 'Copy';
    }, 2000);
  });
}
