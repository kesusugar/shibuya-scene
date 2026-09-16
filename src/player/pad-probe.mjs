// What the browser reports for a connected controller.
//
// The driving code is written against the Standard Gamepad mapping and whether a given pad
// matches it cannot be decided from here. A Switch-style controller may arrive as
// `mapping: "standard"` with Nintendo's own A/B positions swapped relative to the indices,
// or as `mapping: ""` where the indices mean nothing in particular; third-party pads often
// carry an X-input mode that settles it either way. So rather than guess, this shows exactly
// what the browser sees -- press a button, read its index.
//
// Rendered as one tab of the diagnostics panel.

/** Chrome hands back a fresh snapshot per call, and hides pads until one is used. */
export const pads = () => {
 if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
 return [...navigator.getGamepads()].filter(Boolean);
};

const STANDARD = ['A / 下', 'B / 右', 'X / 左', 'Y / 上', 'L1', 'R1', 'L2 トリガー', 'R2 トリガー',
                  'Select / −', 'Start / +', 'L3 押し込み', 'R3 押し込み',
                  '十字 上', '十字 下', '十字 左', '十字 右', 'ホーム'];
const AXIS = {0: '左右移動', 1: '前後移動', 2: '視点 左右', 3: '視点 上下'};
// What this project currently binds, so a press says whether it did anything.
const BOUND = {0: '乗る/降りる', 1: '走る', 6: 'ブレーキ/バック', 7: 'アクセル', 9: '終了', 10: '走る'};

export function padSnapshot() {
 return pads().map(p => ({
  index: p.index, id: p.id, mapping: p.mapping, connected: p.connected,
  axes: [...p.axes].map(v => Number(v.toFixed(3))),
  buttons: [...p.buttons].map(b => ({pressed: b.pressed, value: Number(b.value.toFixed(3))}))
 }));
}

export function padHtml() {
 const list = pads();
 if (!list.length) return '<p class="dg-note">コントローラーが見つかりません。<br>接続してから<b>何かボタンを一度押して</b>ください（Chrome は使われるまでパッドを返しません）。</p>';
 const out = [];
 for (const p of list) {
  const standard = p.mapping === 'standard';
  out.push(`<h3>#${p.index} ${p.id}</h3>`);
  out.push(`<p class="${standard ? 'dg-ok' : 'dg-warn'}">mapping: <b>${p.mapping || '(空 = 非標準)'}</b><br>` +
   (standard ? 'このゲームの割り当てがそのまま使えます'
             : 'インデックスの意味が保証されません。X-input モードがあれば切り替えてください') + '</p>');
  out.push('<div class="dg-rows dg-rows2">' + [...p.axes].map((v, i) =>
   `<span>axes[${i}]${AXIS[i] ? ' · ' + AXIS[i] : ''}</span>` +
   `<b class="${Math.abs(v) > .2 ? 'dg-live' : ''}">${v.toFixed(3)}</b>`).join('') + '</div>');
  out.push('<div class="dg-rows dg-rows3">' + [...p.buttons].map((b, i) =>
   `<span>buttons[${i}]${BOUND[i] ? ' · ' + BOUND[i] : ''}</span>` +
   `<b class="${b.pressed ? 'dg-live' : ''}">${b.value.toFixed(2)}${b.pressed ? ' ●' : ''}</b>` +
   `<em>${STANDARD[i] ?? ''}</em>`).join('') + '</div>');
 }
 return out.join('');
}
