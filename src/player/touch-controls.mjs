// On-screen controls, for playing on a phone.
//
// Not a diagnostic: these are the controls, and on a touch device they are the only ones
// there are. So the left thumb gets a stick rather than a row of arrow buttons -- walking and
// steering both want to be analogue, and a D-pad makes a car weave -- and the rest of the
// screen is drag-to-look, which is what the mouse does under pointer lock. The right thumb
// gets the actions. Looking around is a drag on the scene, handled by the controller on the
// canvas: an overlay wide enough to catch every drag also swallows every button the page has.
//
// Everything is tracked per pointer id. A phone has more than one finger on the glass at
// once, and steering while looking around is the normal case, not the exception.

export const TOUCH = Object.freeze({
 radius: 56,          // px the stick travels before it reads as full deflection
 deadzone: .14        // of that travel, below which it reads as nothing
});

/** Is this a device that wants them? A mouse-only desktop should not get a thumbstick. */
export const wantsTouch = () =>
 typeof navigator !== 'undefined' &&
 ((navigator.maxTouchPoints ?? 0) > 0 ||
  (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches));

/**
 * @param {{onAxes?:(axes:any)=>void, onDrive?:()=>void, onExit?:()=>void}} [options]
 */
export function createTouchControls({onAxes, onDrive, onExit} = {}) {
 if (typeof document === 'undefined') return {show() {}, hide() {}, setDriving() {}, dispose() {}};

 const root = document.createElement('div');
 root.className = 'tc';
 root.hidden = true;
 root.innerHTML =
  `<div class="tc-stick"><div class="tc-base"><div class="tc-knob"></div></div></div>
   <div class="tc-acts">
     <button type="button" class="tc-run">走る</button>
     <button type="button" class="tc-drive">乗る</button>
     <button type="button" class="tc-exit">観察</button>
   </div>`;
 document.body.appendChild(root);

 const stickZone = root.querySelector('.tc-stick');
 const base = root.querySelector('.tc-base');
 const knob = root.querySelector('.tc-knob');
 const runBtn = root.querySelector('.tc-run');
 const driveBtn = root.querySelector('.tc-drive');

 let stickId = null, origin = null, running = false, driving = false;
 const axes = {forward: 0, strafe: 0, running: false};

 const push = () => onAxes?.({...axes, running: axes.running || running});
 const rest = () => {
  axes.forward = 0; axes.strafe = 0;
  base.classList.remove('on');
  knob.style.transform = 'translate(-50%,-50%)';
  push();
 };

 // --- the stick ------------------------------------------------------------------------
 stickZone.addEventListener('pointerdown', e => {
  if (stickId !== null) return;
  e.preventDefault();
  stickId = e.pointerId; stickZone.setPointerCapture?.(e.pointerId);
  // The stick appears where the thumb lands rather than at a fixed spot, so it never has to
  // be found by looking down at the screen.
  const box = stickZone.getBoundingClientRect();
  origin = {x: e.clientX, y: e.clientY};
  base.style.left = (e.clientX - box.left) + 'px';
  base.style.top = (e.clientY - box.top) + 'px';
  base.classList.add('on');
 });
 stickZone.addEventListener('pointermove', e => {
  if (e.pointerId !== stickId || !origin) return;
  e.preventDefault();
  let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
  const len = Math.hypot(dx, dy);
  if (len > TOUCH.radius) {dx *= TOUCH.radius / len; dy *= TOUCH.radius / len;}
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  const nx = dx / TOUCH.radius, ny = -dy / TOUCH.radius;
  const dead = v => Math.abs(v) < TOUCH.deadzone ? 0 : v;
  axes.strafe = dead(nx); axes.forward = dead(ny);
  push();
 });
 for (const type of ['pointerup', 'pointercancel']) stickZone.addEventListener(type, e => {
  if (e.pointerId !== stickId) return;
  stickId = null; origin = null; rest();
 });

 // --- actions --------------------------------------------------------------------------
 const holdRun = on => {running = on; runBtn.classList.toggle('on', on); push();};
 runBtn.addEventListener('pointerdown', e => {e.preventDefault(); runBtn.setPointerCapture?.(e.pointerId); holdRun(true);});
 for (const type of ['pointerup', 'pointercancel', 'pointerleave']) runBtn.addEventListener(type, () => holdRun(false));
 driveBtn.addEventListener('click', e => {e.preventDefault(); onDrive?.();});
 root.querySelector('.tc-exit').addEventListener('click', e => {e.preventDefault(); onExit?.();});

 return {
  show() {root.hidden = false; document.body.classList.add('tc-on');},
  hide() {root.hidden = true; document.body.classList.remove('tc-on'); stickId = null; origin = null; holdRun(false); rest();},
  /** Driving has no run button, and the get-in button becomes a get-out button. */
  setDriving(on) {
   driving = on;
   driveBtn.textContent = on ? '降りる' : '乗る';
   runBtn.hidden = on;
   if (on) holdRun(false);
  },
  get driving() {return driving;},
  dispose() {onAxes?.({forward: 0, strafe: 0, running: false}); document.body.classList.remove('tc-on'); root.remove();}
 };
}
