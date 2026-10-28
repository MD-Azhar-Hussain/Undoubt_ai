const query = new URLSearchParams(window.location.search);
const width = Number(query.get('width'));
const frame = document.getElementById('preview');
frame.style.width = `${[320,390,768,1280].includes(width) ? width : 390}px`;
frame.src = `./index.html?role=${query.get('role') === 'host' ? 'host' : 'participant'}`;
frame.onload = () => {
  const document = frame.contentDocument;
  const measure = () => {
    const overflow = document.documentElement.scrollWidth > frame.clientWidth;
    frame.dataset.overflow = String(overflow);
    frame.title = `Room preview · ${frame.clientWidth}px · ${overflow ? 'horizontal overflow' : 'fits viewport'}`;
  };
  new ResizeObserver(measure).observe(document.documentElement);
  new MutationObserver(measure).observe(document.body, { childList: true, subtree: true });
  measure();
};
