interface SpatialPosition {
  x: number;
  z: number;
}

interface SpatialIndexOptions<T> {
  cellSize: number;
  getId: (item: T) => string | number;
  getPosition: (item: T) => SpatialPosition;
  getRadius: (item: T) => number;
  include?: (item: T) => boolean;
}

function createCellKey(cellX: number, cellZ: number): string {
  return `${cellX}:${cellZ}`;
}

function quantizeSpatialCoord(value: number, cellSize: number): number {
  return Math.floor(value / cellSize);
}

export function createSpatialIndex<T>(items: Iterable<T>, options: SpatialIndexOptions<T>): Map<string, T[]> {
  const cells = new Map<string, T[]>();
  const safeCellSize = Math.max(1, options.cellSize);

  for (const item of items) {
    if (options.include && !options.include(item)) {
      continue;
    }

    const position = options.getPosition(item);
    const radius = Math.max(0, options.getRadius(item));
    const minCellX = quantizeSpatialCoord(position.x - radius, safeCellSize);
    const maxCellX = quantizeSpatialCoord(position.x + radius, safeCellSize);
    const minCellZ = quantizeSpatialCoord(position.z - radius, safeCellSize);
    const maxCellZ = quantizeSpatialCoord(position.z + radius, safeCellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const key = createCellKey(cellX, cellZ);
        const bucket = cells.get(key);
        if (bucket) {
          bucket.push(item);
        } else {
          cells.set(key, [item]);
        }
      }
    }
  }

  return cells;
}

export function querySpatialIndex<T>(
  cells: Map<string, T[]> | null | undefined,
  position: SpatialPosition,
  radius: number,
  options: SpatialIndexOptions<T>
): T[] {
  if (!cells || cells.size === 0 || !position) {
    return [];
  }

  const safeCellSize = Math.max(1, options.cellSize);
  const safeRadius = Math.max(0, radius);
  const minCellX = quantizeSpatialCoord(position.x - safeRadius, safeCellSize);
  const maxCellX = quantizeSpatialCoord(position.x + safeRadius, safeCellSize);
  const minCellZ = quantizeSpatialCoord(position.z - safeRadius, safeCellSize);
  const maxCellZ = quantizeSpatialCoord(position.z + safeRadius, safeCellSize);
  const seen = new Set<string | number>();
  const nearby: T[] = [];

  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      const bucket = cells.get(createCellKey(cellX, cellZ));
      if (!bucket) {
        continue;
      }

      for (const item of bucket) {
        const id = options.getId(item);
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);

        const itemPosition = options.getPosition(item);
        const maximumDistance = safeRadius + Math.max(0, options.getRadius(item));
        const deltaX = position.x - itemPosition.x;
        const deltaZ = position.z - itemPosition.z;
        if ((deltaX * deltaX) + (deltaZ * deltaZ) <= maximumDistance * maximumDistance) {
          nearby.push(item);
        }
      }
    }
  }

  return nearby;
}

export function removeSpatialIndexItem<T>(
  cells: Map<string, T[]> | null | undefined,
  item: T,
  options: SpatialIndexOptions<T>
) {
  if (!cells || cells.size === 0 || !item) {
    return;
  }

  const safeCellSize = Math.max(1, options.cellSize);
  const position = options.getPosition(item);
  const radius = Math.max(0, options.getRadius(item));
  const id = options.getId(item);
  const minCellX = quantizeSpatialCoord(position.x - radius, safeCellSize);
  const maxCellX = quantizeSpatialCoord(position.x + radius, safeCellSize);
  const minCellZ = quantizeSpatialCoord(position.z - radius, safeCellSize);
  const maxCellZ = quantizeSpatialCoord(position.z + radius, safeCellSize);

  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      const key = createCellKey(cellX, cellZ);
      const bucket = cells.get(key);
      if (!bucket) {
        continue;
      }

      for (let index = bucket.length - 1; index >= 0; index -= 1) {
        const candidate = bucket[index];
        if (candidate === item || options.getId(candidate) === id) {
          bucket.splice(index, 1);
        }
      }

      if (bucket.length === 0) {
        cells.delete(key);
      }
    }
  }
}
