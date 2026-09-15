// Reconstructed artwork for the reference advertisement inventory.
//
// Every panel here is drawn from scratch with canvas primitives. No official logo file,
// brand font or downloaded asset is used, and none is committed. These are recognisable
// approximations of the signs visible in the reference frame, in the spirit of a
// streetscape reconstruction; they are not reproductions of the trademark artwork.
//
// The reference panels live in their own atlas rather than in the city atlas. The city
// atlas spreads 32 tiles across every generic sign in the scene, so a tile there is small
// and shared; these are the signs the camera actually reads, so they get their own sheet
// with far more pixels per panel.

import {CanvasTexture, DataTexture, SRGBColorSpace, LinearFilter, RGBAFormat} from 'three';
import {REFERENCE_ADS} from './reference-ads.mjs';

// 4096 was measured at 11.7 s to rasterise its 64 MB backing store, against 0.4 s for the
// 16 MB sheet, and it cannot be prebaked away: a committed PNG still has to decode and
// upload the same 64 MB bitmap. HIGH therefore matches the city atlas at 2048, which still
// gives each reference panel 409x341 against a shared city tile's 256x512.
export const REFERENCE_QUALITY = Object.freeze({high: 2048, medium: 1024, low: 512});
// Columns follow the number of panels actually being drawn, so a sheet built for the
// advertisements this scene places does not reserve pixels for the ones it does not.
export const REFERENCE_COLUMNS = 5;
export const columnsFor = count => Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count))));

export function referenceAtlasEntries(size, count, columns = columnsFor(count)) {
 const rows = Math.max(1, Math.ceil(count / columns)), w = size / columns, h = size / rows;
 const padding = Math.max(2, size / 1024);
 return Array.from({length: count}, (_, id) => {
  const x = (id % columns) * w, y = Math.floor(id / columns) * h;
  return {id, x, y, w, h, padding,
   u0: (x + padding) / size, u1: (x + w - padding) / size,
   v0: 1 - (y + h - padding) / size, v1: 1 - (y + padding) / size};
 });
}

// Drawing helpers. Every painter works in a 0..1 square that is scaled to its tile, so a
// panel's artwork is independent of the atlas resolution it lands on.
function tools(c) {
 const text = (value, size, x, y, {weight = '700', family = '"Hiragino Sans","Yu Gothic","Meiryo",system-ui,sans-serif', align = 'center', max = .92, style = ''} = {}) => {
  c.textAlign = align; c.textBaseline = 'middle';
  c.font = `${style} ${weight} ${size}px ${family}`.trim();
  c.fillText(value, x, y, max);
 };
 const box = (x, y, w, h, fill) => {c.fillStyle = fill; c.fillRect(x, y, w, h);};
 const disc = (x, y, r, fill) => {c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();};
 const ring = (x, y, r, width, stroke) => {c.strokeStyle = stroke; c.lineWidth = width; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();};
 const column = (chars, size, x, top, step, fill) => {c.fillStyle = fill; [...chars].forEach((ch, i) => text(ch, size, x, top + i * step));};
 return {text, box, disc, ring, column};
}

/**
 * One painter per inventory id, drawn in a unit square. Each is a different composition,
 * not a recoloured template: the point of the reference pass is that the camera reads a
 * street of distinct advertisers rather than one sticker repeated in eight palettes.
 */
export const REFERENCE_ART = Object.freeze({
 1(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#c8102e');
  box(.04, .05, .92, .34, '#ffffff');
  c.fillStyle = '#c8102e'; text('カラオケ', .23, .5, .22);
  c.fillStyle = '#ffffff'; text('BIG ECHO', .2, .5, .56, {family: 'Arial,sans-serif', weight: '900'});
  box(.2, .72, .6, .035, '#ffd400');
  c.fillStyle = '#ffe9ec'; text('０円クーポン配布中', .075, .5, .87);},

 2(c) {const {text, disc} = tools(c); c.fillStyle = '#ffffff'; c.fillRect(0, 0, 1, 1);
  disc(.5, .38, .21, '#e6007e');
  c.fillStyle = '#ffffff'; text('Æ', .24, .5, .37, {family: 'Georgia,serif'});
  c.fillStyle = '#2b2b2b'; text('AEON', .17, .5, .71, {family: 'Arial,sans-serif', weight: '900'});
  c.fillStyle = '#7a7a7a'; text('SHIBUYA', .06, .5, .87, {family: 'Arial,sans-serif'});},

 3(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#f7f4ec');
  box(.05, .16, .22, .62, '#c2172b');
  c.fillStyle = '#ffffff'; text('本', .42, .16, .47);
  c.fillStyle = '#1d1d1d'; text('渋谷書店', .23, .63, .42);
  c.fillStyle = '#6b6b6b'; text('SHIBUYA BOOKS', .072, .63, .66, {family: 'Arial,sans-serif'});},

 4(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#ffffff');
  box(0, 0, .34, 1, '#e4002b');
  c.fillStyle = '#ffffff'; text('Cafe', .18, .17, .3, {family: 'Georgia,serif', style: 'italic', max: .3});
  text('レストラン', .1, .17, .62, {max: .32});
  c.fillStyle = '#e4002b'; text('ガスト', .34, .67, .42, {max: .58});
  c.fillStyle = '#8a8a8a'; text('モーニング 7:00-', .07, .67, .78, {max: .6});},

 5(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#ffffff');
  box(0, 0, 1, .26, '#00833e');
  c.fillStyle = '#ffffff'; text('7F', .19, .13, .13, {family: 'Arial,sans-serif', weight: '900'});
  c.fillStyle = '#fff6d8'; text('しゃぶしゃぶ食べ放題', .1, .6, .13);
  c.fillStyle = '#00833e'; text('しゃぶ葉', .3, .5, .55);
  c.fillStyle = '#c64a12'; text('SHABU-YO', .085, .5, .82, {family: 'Arial,sans-serif'});},

 6(c) {const {text, box, disc} = tools(c); box(0, 0, 1, 1, '#ffffff');
  box(0, 0, 1, .46, '#123c8c');
  c.fillStyle = '#ffffff'; text('英会話', .26, .5, .23);
  disc(.18, .68, .1, '#f08300');
  c.fillStyle = '#123c8c'; text('イーオン', .21, .6, .67);
  c.fillStyle = '#5a5a5a'; text('駅前留学・無料体験', .073, .5, .9);},

 7(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#0d2f6b');
  c.fillStyle = '#7fd4ff'; text('光回線', .19, .5, .17);
  box(.08, .3, .84, .3, '#ffffff');
  c.fillStyle = '#0d2f6b'; text('イーチカン', .2, .5, .45);
  c.fillStyle = '#ffe066'; text('月額 2,980円〜', .11, .5, .72);
  c.fillStyle = '#b9d2f2'; text('工事費無料キャンペーン', .065, .5, .89);},

 8(c) {const {text, box, column} = tools(c); box(0, 0, 1, 1, '#f5e7c8');
  box(.06, .04, .88, .92, '#8c1f1f');
  column('もんじゃ', .13, .5, .16, .16, '#ffe9b0');
  box(.24, .78, .52, .02, '#ffe9b0');
  c.fillStyle = '#ffe9b0'; text('鉄板焼', .09, .5, .88);},

 9(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#111318');
  box(.03, .06, .94, .5, '#e01f26');
  c.fillStyle = '#ffffff'; text('LIVE', .3, .5, .2, {family: 'Impact,Arial,sans-serif', weight: '900'});
  text('MAX', .24, .5, .44, {family: 'Impact,Arial,sans-serif', weight: '900'});
  c.fillStyle = '#ffd400'; text('カラオケ・ライブハウス', .085, .5, .68);
  c.fillStyle = '#9aa3ad'; text('OPEN 24H', .07, .5, .86, {family: 'Arial,sans-serif'});},

 10(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#ffffff');
  box(0, .12, 1, .46, '#e60012');
  c.fillStyle = '#ffffff'; text('アコム', .3, .5, .35);
  c.fillStyle = '#e60012'; text('ACOM', .13, .5, .69, {family: 'Arial,sans-serif', weight: '900'});
  c.fillStyle = '#555555'; text('はじめてのかたは30日間金利0円', .058, .5, .87);},

 11(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#0a0a0a');
  c.fillStyle = '#ffffff'; text('LUSH', .34, .5, .42, {family: 'Georgia,"Times New Roman",serif', weight: '700'});
  box(.28, .62, .44, .012, '#ffffff');
  c.fillStyle = '#d8d8d8'; text('FRESH HANDMADE COSMETICS', .052, .5, .75, {family: 'Arial,sans-serif'});},

 12(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#ffffff');
  c.fillStyle = '#1a1a1a'; text('1', .3, .5, .17, {family: 'Arial,sans-serif', weight: '900'});
  text('0', .3, .5, .42, {family: 'Arial,sans-serif', weight: '900'});
  text('9', .3, .5, .67, {family: 'Arial,sans-serif', weight: '900'});
  box(.2, .86, .6, .03, '#1a1a1a');},

 13(c) {const {text, box, disc, ring} = tools(c); box(0, 0, 1, 1, '#f4f2e9');
  disc(.5, .4, .3, '#1a4fa0'); ring(.5, .4, .325, .022, '#d81f34');
  c.fillStyle = '#ffffff'; text('UC', .3, .5, .41, {family: 'Arial,sans-serif', weight: '900'});
  disc(.29, .84, .07, '#eb001b'); disc(.4, .84, .07, '#f79e1b');
  c.fillStyle = '#1a4fa0'; text('VISA', .12, .72, .85, {family: 'Arial,sans-serif', weight: '900', style: 'italic', max: .3});},

 14(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#ffffff');
  box(0, 0, 1, .2, '#0f4c8a');
  c.fillStyle = '#ffffff'; text('のどのお守り', .1, .5, .1);
  c.fillStyle = '#123c2c'; text('龍角散', .3, .5, .42);
  box(.18, .62, .64, .16, '#c8a02c');
  c.fillStyle = '#ffffff'; text('ダイレクト', .12, .5, .7);
  c.fillStyle = '#666666'; text('スティック / 顆粒', .06, .5, .89);},

 15(c) {const {text, box, disc} = tools(c); box(0, 0, 1, 1, '#0b4bb0');
  disc(.5, .36, .17, '#ffffff');
  c.fillStyle = '#0b4bb0'; text('久', .2, .5, .36);
  c.fillStyle = '#ffffff'; text('Hisamitsu', .15, .5, .66, {family: 'Arial,sans-serif', weight: '700'});
  c.fillStyle = '#bcd4f7'; text('久光製薬', .085, .5, .85);},

 16(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#00954a');
  box(.06, .1, .88, .42, '#ffffff');
  c.fillStyle = '#00954a'; text('サロンパス', .21, .5, .31);
  c.fillStyle = '#ffffff'; text('肩・腰・関節に', .11, .5, .65);
  box(.3, .76, .4, .025, '#ffe066');
  c.fillStyle = '#d8f2e2'; text('HISAMITSU', .07, .5, .88, {family: 'Arial,sans-serif'});},

 17(c) {const {text, box, column} = tools(c); box(0, 0, 1, 1, '#140c18');
  c.shadowColor = '#ff4fa3'; c.shadowBlur = 24;
  column('もん字', .16, .5, .2, .22, '#ff7ec0');
  c.shadowBlur = 0;
  c.fillStyle = '#ffe066'; text('お好み焼', .07, .5, .88);},

 // A crimson sheet, not a red band floating on black: the near-black ground this started
 // with vanished against a night facade, leaving only the band reading as the whole sign.
 18(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#bf0000');
  box(0, .66, 1, .34, '#8e0000');
  c.fillStyle = '#ffffff'; text('Rakuten', .22, .5, .33, {family: '"Times New Roman",Georgia,serif', weight: '700'});
  c.fillStyle = '#ffffff'; text('楽天市場', .17, .5, .82);},

 19(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#0058a3');
  box(.07, .24, .86, .38, '#ffda1a');
  c.fillStyle = '#0058a3'; text('IKEA', .26, .5, .43, {family: 'Arial,sans-serif', weight: '900'});
  c.fillStyle = '#ffffff'; text('渋谷ストア', .12, .5, .77);},

 20(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#0c0c0e');
  c.fillStyle = '#ffffff'; text('ACN', .3, .5, .38, {family: 'Arial,sans-serif', weight: '300'});
  c.strokeStyle = '#7b2fd4'; c.lineWidth = .035;
  c.beginPath(); c.moveTo(.3, .2); c.lineTo(.62, .2); c.stroke();
  c.fillStyle = '#8a8f98'; text('CONSULTING', .06, .5, .68, {family: 'Arial,sans-serif'});},

 21(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#0b0b12');
  // A vision panel, so the artwork is a lit screen rather than a printed sheet.
  for (let y = 0; y < 1; y += .045) {c.fillStyle = y % .09 < .045 ? '#141a2e' : '#0d1120'; c.fillRect(0, y, 1, .045);}
  box(.08, .12, .84, .34, '#ff2d55');
  c.fillStyle = '#ffffff'; text('DMM', .24, .5, .29, {family: 'Arial,sans-serif', weight: '900'});
  c.fillStyle = '#7fe8ff'; text('動画・電子書籍', .11, .5, .6);
  box(.2, .72, .6, .04, '#ffd400');
  c.fillStyle = '#9aa7c4'; text('SHIBUYA VISION', .06, .5, .87, {family: 'Arial,sans-serif'});},

 // A bookshop fascia: cream ground with a dark frame, because an unframed near-white panel
 // is indistinguishable from the pale generated stickers on the walls beside it.
 22(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#17223a'); box(.035, .08, .93, .84, '#fbfaf5');
  c.fillStyle = '#17223a'; text('大盛堂書店', .3, .5, .42);
  box(.18, .66, .64, .022, '#b8912f');
  c.fillStyle = '#4a4a4a'; text('TAISEIDO BOOK STORE', .085, .5, .8, {family: 'Arial,sans-serif'});},

 24(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#16181d');
  c.fillStyle = '#e8ecf2'; text('QFRONT', .28, .5, .5, {family: 'Arial,sans-serif', weight: '300'});},

 26(c) {const {text, disc, ring, box} = tools(c); box(0, 0, 1, 1, '#ffffff');
  disc(.5, .42, .26, '#00704a'); ring(.5, .42, .215, .022, '#ffffff');
  c.fillStyle = '#ffffff'; text('☕', .2, .5, .42);
  c.fillStyle = '#00704a'; text('STARBUCKS', .11, .5, .82, {family: 'Arial,sans-serif', weight: '700'});},

 23(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#d9111f');
  c.fillStyle = '#ffffff';
  text('Coca-Cola', .21, .5, .42, {family: '"Brush Script MT","Segoe Script","Apple Chancery",cursive', weight: '700', style: 'italic', max: .86});
  c.strokeStyle = '#ffffff'; c.lineWidth = .016;
  c.beginPath(); c.moveTo(.1, .62); c.bezierCurveTo(.32, .55, .62, .72, .9, .58); c.stroke();
  c.fillStyle = '#ffd9dc'; text('SHIBUYA', .06, .5, .83, {family: 'Arial,sans-serif'});},

 25(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#f2f6ff');
  box(0, 0, 1, .28, '#0b2d6b');
  c.fillStyle = '#ffffff'; text('Start saving now!', .1, .5, .14, {family: 'Arial,sans-serif', weight: '700'});
  c.fillStyle = '#0b2d6b'; text('いま、はじめる', .11, .5, .44);
  box(.18, .58, .64, .17, '#e8b000');
  c.fillStyle = '#20324f'; text('資産形成', .12, .5, .665);
  c.fillStyle = '#6a7a95'; text('SHIBUYA BANK', .06, .5, .87, {family: 'Arial,sans-serif'});},

 27(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#0a3d91');
  c.fillStyle = '#ffffff'; text('TSUTAYA', .2, .5, .38, {family: 'Arial,sans-serif', weight: '900'});
  box(.2, .56, .6, .03, '#ffd400');
  c.fillStyle = '#ffd400'; text('BOOKS / CAFE', .085, .5, .73, {family: 'Arial,sans-serif'});},

 28(c) {const {column, box} = tools(c); box(0, 0, 1, 1, '#123a7a');
  column('SEIBU', .13, .5, .16, .17, '#ffffff');},

 29(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#00a05a');
  box(.06, .3, .16, .18, '#ffffff'); box(.1, .26, .08, .26, '#ffffff');
  c.fillStyle = '#ffffff'; text('CITY DRUG', .17, .6, .39, {family: 'Arial,sans-serif', weight: '900'});
  c.fillStyle = '#eaffe9'; text('毎日を楽しもう', .13, .5, .72);},

 30(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#e2001a');
  box(.05, .08, .9, .46, '#ffffff');
  c.fillStyle = '#e2001a'; text('サンドラッグ', .17, .5, .31);
  c.fillStyle = '#ffffff'; text('SUN DRUG', .12, .5, .68, {family: 'Arial,sans-serif', weight: '900'});
  c.fillStyle = '#ffd9dc'; text('処方せん受付', .075, .5, .87);}
});

/** Ids the inventory carries that this sheet can draw. */
export const PAINTED_IDS = Object.freeze(Object.keys(REFERENCE_ART).map(Number).sort((a, b) => a - b));

export function paintReferenceAtlas(ctx, size, ids = PAINTED_IDS, columns = columnsFor(ids.length)) {
 const entries = referenceAtlasEntries(size, ids.length, columns);
 ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, size, size);
 ids.forEach((id, index) => {
  const e = entries[index], paint = REFERENCE_ART[id];
  if (!paint) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(e.x + e.padding, e.y + e.padding, e.w - 2 * e.padding, e.h - 2 * e.padding); ctx.clip();
  ctx.translate(e.x, e.y); ctx.scale(e.w, e.h);
  ctx.lineJoin = 'round';
  paint(ctx);
  ctx.restore();
 });
 return entries;
}

export function createReferenceAtlas({tier = 'high', maxTextureSize = 4096, canvasFactory, ids = PAINTED_IDS} = {}) {
 const requested = REFERENCE_QUALITY[tier];
 if (!requested) throw Error('Unknown reference atlas tier');
 if (!(maxTextureSize >= 128)) throw Error('GPU texture limit too small');
 const size = Math.min(requested, 2 ** Math.floor(Math.log2(maxTextureSize)));
 const canvas = canvasFactory ? canvasFactory() : typeof document !== 'undefined' ? document.createElement('canvas') : null;
 let texture, mode;
 if (canvas) {
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Reference sign Canvas 2D unavailable');
  paintReferenceAtlas(ctx, size, ids);
  texture = new CanvasTexture(canvas); mode = 'canvas';
 } else {
  texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat); mode = 'cpu-placeholder';
 }
 texture.colorSpace = SRGBColorSpace; texture.minFilter = LinearFilter; texture.magFilter = LinearFilter;
 texture.generateMipmaps = false; texture.needsUpdate = true;
 const entries = referenceAtlasEntries(size, ids.length);
 const index = new Map(ids.map((id, i) => [id, entries[i]]));
 let disposed = false;
 return {texture, mode, size, ids, entries, entryFor: id => index.get(id) ?? null,
  dispose() {if (disposed) return; disposed = true; texture.dispose();}};
}

/** Inventory entries this sheet has artwork for, for reporting and tests. */
export const PAINTED_ADS = Object.freeze(REFERENCE_ADS.filter(ad => REFERENCE_ART[ad.id]));
