import { PARTICLE_SIZE, makeParticles, particleAt } from '#particles';
import { el, navMotion } from '#ui/context';
import { symbolNodes } from '#ui/controls';

// The dust of a button of the navigation that goes or comes back with its module (MOD-3). An
// optional module: to remove it, nav.js sets `button.hidden` instead of calling showNavButton.

// The time of the dust of a button, and of the close or the open of its place in the bar.
const DUST_MS = 900;
const PLACE_MS = 300;

// The pixels of a button of the bottom bar: its icon, then its label, in their colours.
const drawButton = async (button) => {
  const box = button.getBoundingClientRect();
  const canvas = el('canvas', { width: Math.ceil(box.width), height: Math.ceil(box.height) });
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const glyph = button.querySelector('.icon');
  const place = glyph.getBoundingClientRect();
  const look = getComputedStyle(glyph);
  const copy = glyph.cloneNode(true);
  // A data: image loads no other file, so the copy carries the shapes of its symbol.
  const use = copy.querySelector('use');
  if (use) use.replaceWith(...(await symbolNodes(use.getAttribute('href').split('#')[1])));
  Object.entries({
    xmlns: 'http://www.w3.org/2000/svg',
    width: place.width,
    height: place.height,
    fill: 'none',
    stroke: look.color,
    'stroke-width': look.strokeWidth,
    'stroke-linecap': look.strokeLinecap,
    'stroke-linejoin': look.strokeLinejoin,
  }).forEach(([name, value]) => copy.setAttribute(name, value));
  const image = new Image();
  image.src = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
  await image.decode();
  context.drawImage(image, place.left - box.left, place.top - box.top, place.width, place.height);
  const label = button.querySelector('span');
  const text = label.getBoundingClientRect();
  const font = getComputedStyle(label);
  context.font = `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
  context.fillStyle = font.color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label.textContent, text.left - box.left + text.width / 2, text.top - box.top + text.height / 2);
  return { box, image: context.getImageData(0, 0, canvas.width, canvas.height) };
};

// Plays the dust of a picture at `box` on a canvas over the page: the particles leave, or with
// `back` they come in and settle. Resolves at the end, or at once when `run` is cancelled.
const playDust = ({ box, image }, back, run) =>
  new Promise((resolve) => {
    const particles = makeParticles(image);
    const pad = 80;
    const canvas = el('canvas', { className: 'dust', width: box.width + 2 * pad, height: box.height + 2 * pad });
    Object.assign(canvas.style, { left: `${box.left - pad}px`, top: `${box.top - pad}px` });
    document.body.append(canvas);
    const context = canvas.getContext('2d');
    run.stops.push(() => {
      canvas.remove();
      resolve();
    });
    const start = performance.now();
    const frame = (now) => {
      if (run.cancelled) return;
      const t = Math.min(1, (now - start) / DUST_MS);
      context.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((particle) => {
        const { x, y, alpha } = particleAt(particle, back ? 1 - t : t);
        if (alpha <= 0) return;
        context.globalAlpha = alpha;
        context.fillStyle = particle.color;
        context.fillRect(pad + x, pad + y, PARTICLE_SIZE, PARTICLE_SIZE);
      });
      if (t < 1) requestAnimationFrame(frame);
      else {
        canvas.remove();
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });

// The open or the close of the place of a button in the bar.
const movePlace = (button, open, run, delay = 0) => {
  const frames = [{ flexGrow: 0, minWidth: 0 }, { flexGrow: 1, minWidth: 0 }];
  const motion = button.animate(frames, {
    duration: PLACE_MS,
    delay,
    easing: 'ease',
    direction: open ? 'normal' : 'reverse',
    fill: 'both',
  });
  run.stops.push(() => motion.cancel());
  return motion.finished.catch(() => {});
};

// The effects of the bar that run, by button. Each entry is the run that a later change cancels.
const navRuns = new Map();

const endRun = (button) => {
  const run = navRuns.get(button);
  if (!run) return;
  run.cancelled = true;
  run.stops.forEach((stop) => stop());
  button.style.opacity = '';
  button.style.overflow = '';
  navRuns.delete(button);
};

// A button that goes breaks into dust, then its place closes. A button that comes back opens its
// place, then its dust comes in and settles (MOD-3).
const runNavEffect = async (button, shown) => {
  const run = { shown, cancelled: false, stops: [] };
  navRuns.set(button, run);
  button.hidden = false;
  button.style.overflow = 'hidden';
  try {
    if (shown) {
      button.style.opacity = '0';
      await movePlace(button, true, run);
      if (run.cancelled) return;
      const picture = await drawButton(button);
      if (run.cancelled) return;
      await playDust(picture, true, run);
    } else {
      const picture = await drawButton(button);
      if (run.cancelled) return;
      button.style.opacity = '0';
      await Promise.all([playDust(picture, false, run), movePlace(button, false, run, DUST_MS * 0.35)]);
    }
  } catch {
    // A picture that cannot be drawn ends the effect: the button takes its place at once.
  }
  if (run.cancelled) return;
  endRun(button);
  button.hidden = !shown;
};

// Shows or hides the button of a section in the bottom bar. With `navMotion` the change is the
// effect of runNavEffect; a button keeps its effect until the effect ends or a change cancels it.
export const showNavButton = (button, shown) => {
  const run = navRuns.get(button);
  if (run ? run.shown === shown : shown === !button.hidden) return;
  endRun(button);
  if (!navMotion || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    button.hidden = !shown;
    return;
  }
  runNavEffect(button, shown);
};
