const tooltipEl = document.getElementById('tooltip');

export function showTooltip(text, pageX, pageY) {
  tooltipEl.textContent = text;
  tooltipEl.style.display = 'block';
  const tw = tooltipEl.offsetWidth;
  const th = tooltipEl.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = pageX + 14;
  let top = pageY - 10;

  if (left + tw + 4 > vw) left = pageX - tw - 10;
  if (top + th + 4 > vh) top = pageY - th - 4;

  tooltipEl.style.left = `${Math.max(0, left)}px`;
  tooltipEl.style.top = `${Math.max(0, top)}px`;
}

export function hideTooltip() {
  tooltipEl.style.display = 'none';
}
