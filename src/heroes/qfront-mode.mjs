// Cityscape C2: which QFRONT is drawn. 'deep' (default): opaque glass with rooms drawn behind it
// (deep-glass.mjs) and the Blender-built crown, fins and lettering once loaded.
// 'classic' (?qfront=classic): the RUN S4/QFRONT-GLASS version -- 38% glass over box rooms.
// Read from the URL at import, because the hero module builds before the scene's own settings run.
const asked=typeof location!=='undefined'?new URLSearchParams(location.search).get('qfront'):null;
export const QFRONT_MODE={current:asked==='classic'?'classic':'deep'};
