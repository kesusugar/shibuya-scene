// Crowd performance: the crowd's and the traffic's neighbour grids are keyed by a number for the
// cell (i, j), not by an "i,j" string -- the crowd asks its nine cells thousands of times a frame,
// and the strings were a large share of its time and garbage.
//
// A grid that is keyed this way carries its key function (`grid.key`); `gridKey` asks it, and
// falls back to the "i,j" string for a plain Map (a test's stand-in crowd), so code that reads a
// grid it was handed works with either.
export const GRID_KEY = (i, j) => i * 2097152 + j;
export const gridKey = (grid, i, j) => grid?.key ? grid.key(i, j) : i + ',' + j;
