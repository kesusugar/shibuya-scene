// A gamepad read-out, for working out what a controller actually reports.
//
// The driving code is written against the Standard Gamepad mapping, and whether a given pad
// matches it is not something that can be decided from here: a Switch-style controller may
// arrive as `mapping: "standard"` with Nintendo's own A/B positions swapped relative to the
// indices, or as `mapping: ""` where the indices mean nothing in particular. Third-party
// pads often have an X-input mode that settles it. So rather than guess, this panel shows
// exactly what the browser sees -- press a button, read its index -- and offers the whole
// thing as JSON to hand back.
//
// Opened with ?pad=1. It runs its own frame loop so it works without entering player mode,
// and it never touches the scene.

/** Chrome hands back a fresh snapshot per call, and hides pads until one is used. */
const pads = () => {
 if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
 return [...navigator.getGamepads()].filter(Boolean);
};

const STANDARD = ['A / 下', 'B / 右', 'X / 左', 'Y / 上', 'L1 / ZL側前', 'R1', 'L2 トリガー',
                  'R2 トリガー', 'Select / −', 'Start / +', 'L3 スティック押', 'R3 スティック押',
                  '十字 上', '十字 下', '十字 左', '十字 右', 'ホーム'];
// What this project currently binds, so the panel says whether a press did anything.
const AXIS = {0: '左右移動', 1: '前後移動', 2: '視点 左右', 3: '視点 上下'};
const BOUND = {0: '乗る/降りる', 1: '走る', 6: 'ブレーキ/バック', 7: 'アクセル', 9: '終了', 10: '走る'};

export function createPadProbe() {
 if (typeof document === 'undefined') return {dispose() {}};
 const root = document.createElement('section');
 root.className = 'pad-probe';
 root.innerHTML = '<h2>Gamepad Probe</h2><div class="pad-body">パッドのボタンを一度押してください（Chrome は使用されるまでパッドを返しません）</div>';
 const body = root.querySelector('.pad-body');
 const copy = document.createElement('button');
 copy.type = 'button'; copy.textContent = 'Copy JSON';
 root.append(copy);
 document.body.appendChild(root);

 let latest = null, raf = 0, disposed = false;

 copy.addEventListener('click', async () => {
  try {
   await navigator.clipboard.writeText(JSON.stringify(latest ?? {pads: 0}, null, 2));
   copy.textContent = 'Copied'; setTimeout(() => {copy.textContent = 'Copy JSON';}, 1500);
  } catch {copy.textContent = 'Copy failed';}
 });

 const render = () => {
  const list = pads();
  latest = {
   at: new Date().toISOString(), userAgent: navigator.userAgent,
   pads: list.map(p => ({
    index: p.index, id: p.id, mapping: p.mapping, connected: p.connected,
    axes: [...p.axes].map(v => Number(v.toFixed(3))),
    buttons: [...p.buttons].map(b => ({pressed: b.pressed, value: Number(b.value.toFixed(3))}))
   }))
  };
  if (!list.length) {
   body.textContent = 'パッドが見つかりません。接続してから何かボタンを押してください。';
   raf = requestAnimationFrame(render); return;
  }
  const rows = [];
  for (const p of list) {
   const standard = p.mapping === 'standard';
   rows.push(`<h3>#${p.index} ${p.id}</h3>`);
   rows.push(`<p class="${standard ? 'pad-ok' : 'pad-warn'}">mapping: <b>${p.mapping || '(空 = 非標準)'}</b> — ` +
    (standard ? 'このゲームの割り当てがそのまま使えます'
              : 'インデックスの意味が保証されません。X-input モードがあれば切り替えてください') + '</p>');
   // Its own two-column grid: the button grid has a third column for the label, and axes
   // rows sharing it wrap into the next row's cells.
   rows.push('<div class="pad-grid pad-axes">' + [...p.axes].map((v, i) =>
    `<span>axes[${i}]${AXIS[i] ? ' · ' + AXIS[i] : ''}</span>` +
    `<b class="${Math.abs(v) > .2 ? 'pad-live' : ''}">${v.toFixed(3)}</b>`).join('') + '</div>');
   rows.push('<div class="pad-grid">' + [...p.buttons].map((b, i) =>
    `<span>buttons[${i}]${BOUND[i] ? ' · ' + BOUND[i] : ''}</span>` +
    `<b class="${b.pressed ? 'pad-live' : ''}">${b.value.toFixed(2)}${b.pressed ? ' ●' : ''}</b>` +
    `<em>${STANDARD[i] ?? ''}</em>`).join('') + '</div>');
  }
  body.innerHTML = rows.join('');
  raf = requestAnimationFrame(render);
 };
 raf = requestAnimationFrame(render);

 return {
  get snapshot() {return latest;},
  dispose() {
   if (disposed) return; disposed = true;
   cancelAnimationFrame(raf); root.remove();
  }
 };
}
