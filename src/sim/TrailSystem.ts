export interface TrailCell {
  x: number;
  z: number;
}

interface PlanarPoint {
  x: number;
  z: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

export function createTrailCellKey(cellX: number, cellZ: number): string {
  return `${cellX}:${cellZ}`;
}

export function quantizeTrailCoord(value: number, cellSize: number): number {
  return Math.round(value / cellSize);
}

export function circleIntersectsTrailCell(x: number, z: number, radius: number, cell: TrailCell, cellSize: number): boolean {
  const halfSize = cellSize / 2;
  const closestX = clamp(x, cell.x - halfSize, cell.x + halfSize);
  const closestZ = clamp(z, cell.z - halfSize, cell.z + halfSize);
  const deltaX = x - closestX;
  const deltaZ = z - closestZ;
  return (deltaX * deltaX) + (deltaZ * deltaZ) <= radius * radius;
}

export function serializeTrailCells(cells: Map<string, TrailCell>): TrailCell[] {
  return Array.from(cells.values()).map((cell) => ({
    x: cell.x,
    z: cell.z
  }));
}

export function markTrailAtPosition(cells: Map<string, TrailCell>, position: PlanarPoint, cellSize: number): void {
  const cellX = quantizeTrailCoord(position.x, cellSize);
  const cellZ = quantizeTrailCoord(position.z, cellSize);
  const key = createTrailCellKey(cellX, cellZ);

  if (!cells.has(key)) {
    cells.set(key, {
      x: cellX * cellSize,
      z: cellZ * cellSize
    });
  }
}

export function depositTrailSegment(cells: Map<string, TrailCell>, start: PlanarPoint, end: PlanarPoint, cellSize: number): void {
  const distance = Math.hypot(end.x - start.x, end.z - start.z);
  const steps = Math.max(1, Math.ceil(distance / (cellSize * 0.45)));

  for (let index = 0; index <= steps; index += 1) {
    const alpha = steps === 0 ? 1 : index / steps;
    markTrailAtPosition(cells, {
      x: lerp(start.x, end.x, alpha),
      z: lerp(start.z, end.z, alpha)
    }, cellSize);
  }
}

export function isCircleOnTrail(cells: Map<string, TrailCell>, position: PlanarPoint, radius: number, cellSize: number): boolean {
  const centerCellX = quantizeTrailCoord(position.x, cellSize);
  const centerCellZ = quantizeTrailCoord(position.z, cellSize);
  const searchRadius = Math.ceil((radius + cellSize) / cellSize);

  for (let cellX = centerCellX - searchRadius; cellX <= centerCellX + searchRadius; cellX += 1) {
    for (let cellZ = centerCellZ - searchRadius; cellZ <= centerCellZ + searchRadius; cellZ += 1) {
      const cell = cells.get(createTrailCellKey(cellX, cellZ));
      if (!cell) {
        continue;
      }

      if (circleIntersectsTrailCell(position.x, position.z, radius, cell, cellSize)) {
        return true;
      }
    }
  }

  return false;
}
