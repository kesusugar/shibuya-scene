import {parseConfig} from './foundation.mjs';

// Presentation defaults live outside the geometry dependency graph so changing
// the landing view does not invalidate the expensive static model pack.
export function parseLaunchConfig(search = '') {
  const params = new URLSearchParams(search);
  if (!params.has('tier')) params.set('tier', 'high');
  if (!params.has('time')) params.set('time', 'night');
  const config = parseConfig(params.toString());
  config.explicitTime = new URLSearchParams(search).has('time');
  return config;
}
