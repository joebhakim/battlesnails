import {
  EXPLORER_DEFAULT_SEED,
  createExplorerMapGrids
} from '../src/world/ExplorerWorld.js';

const seedArg = process.argv[2];
const numericSeed = Number(seedArg);
const rawSeed = seedArg === undefined
  ? EXPLORER_DEFAULT_SEED
  : Number.isFinite(numericSeed)
    ? numericSeed
    : seedArg;
const rawCellSize = process.argv[3];
const cellSize = rawCellSize === undefined ? undefined : Number(rawCellSize);
const grids = createExplorerMapGrids(rawSeed, { cellSize });

console.log(`Explorer worldgen v${grids.worldgenVersion} seed ${grids.seed}`);
console.log(`cellSize ${grids.cellSize}, ${grids.width} x ${grids.height}`);
console.log('');
console.log('features');
console.log(grids.featureGrid);
console.log('');
console.log('elevation');
console.log(grids.elevationGrid);
console.log('');
console.log('legend');
for (const [key, entry] of Object.entries(grids.legend.features)) {
  console.log(`${entry.symbol} ${key}: ${entry.label}`);
}
