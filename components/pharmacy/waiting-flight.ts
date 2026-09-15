/** Measure only at mount/resize. CSS follows the spline without a JS animation loop. */
export function positionPharmacyFlight(section: HTMLElement) {
  const sprite = section.querySelector<HTMLElement>(".mn-pharmacy-waiting-nong");
  const markers = section.querySelectorAll<HTMLElement>("ol li > span:first-child");
  if (!sprite || markers.length !== 3) return;
  const box = section.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const landing = (marker: HTMLElement) => {
    const rect = marker.getBoundingClientRect();
    return { x: rect.left - box.left + rect.width / 2, y: rect.top - box.top - 6 };
  };
  const first = landing(markers[1]), second = landing(markers[2]);
  const start = { x: -sprite.offsetWidth, y: Math.min(96, box.height * .2) };
  const end = { x: box.width + sprite.offsetWidth, y: Math.max(40, second.y - box.height * .45) };
  const curves = [
    `C ${box.width * .2} ${start.y - 40} ${first.x - box.width * .25} ${first.y - 150} ${first.x} ${first.y}`,
    `C ${first.x + box.width * .5} ${first.y - box.height * .3} ${second.x + box.width * .5} ${second.y - box.height * .3} ${second.x} ${second.y}`,
    `C ${second.x + box.width * .3} ${second.y - box.height * .45} ${end.x} 40 ${end.x} ${end.y}`
  ];
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  let d = `M ${start.x} ${start.y}`;
  const lengths = curves.map(curve => {
    d += ` ${curve}`;
    path.setAttribute("d", d);
    return path.getTotalLength();
  });
  sprite.style.setProperty("--flight-path", `path("${d}")`);
  sprite.style.setProperty("--first-stop", `${lengths[0] / lengths[2] * 100}%`);
  sprite.style.setProperty("--second-stop", `${lengths[1] / lengths[2] * 100}%`);
}
