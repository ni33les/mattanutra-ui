/** Measure at stage changes/resize. CSS follows the spline without a JS animation loop. */
export function positionPharmacyFlight(section: HTMLElement) {
  const sprite = section.querySelector<HTMLElement>(".mn-pharmacy-waiting-nong");
  const spinner = section.querySelector<HTMLElement>('li[aria-current="step"] .lucide-loader-circle');
  const placeholder = section.querySelector<HTMLElement>(".mn-pharmacy-waiting-placeholder");
  if (!sprite || !spinner || !placeholder) return;
  const box = section.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const marker = spinner.parentElement!.getBoundingClientRect();
  const homeBox = placeholder.getBoundingClientRect();
  const home = { x: homeBox.left - box.left + homeBox.width / 2, y: homeBox.bottom - box.top };
  const target = { x: marker.left - box.left + marker.width / 2, y: marker.top - box.top - 6 };
  const curves = [
    `C ${home.x - box.width * .3} ${home.y} ${target.x - box.width * .2} ${target.y - 100} ${target.x} ${target.y}`,
    `C ${target.x + box.width * .3} ${target.y - 100} ${home.x + box.width * .3} ${home.y + 60} ${home.x} ${home.y}`
  ];
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  let d = `M ${home.x} ${home.y}`;
  const lengths = curves.map(curve => {
    d += ` ${curve}`;
    path.setAttribute("d", d);
    return path.getTotalLength();
  });
  sprite.style.setProperty("--flight-path", `path("${d}")`);
  sprite.style.setProperty("--active-stop", `${lengths[0] / lengths[1] * 100}%`);
}
