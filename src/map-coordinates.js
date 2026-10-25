// World +x is east and +z is south. Canvas maps have north at the top.
export function mapFraction(x, z, width, depth) {
  return { u: (x + width / 2) / width, v: (z + depth / 2) / depth };
}

export function mapPoint(x, z, width, depth, canvasWidth, canvasHeight) {
  const { u, v } = mapFraction(x, z, width, depth);
  return [u * canvasWidth, v * canvasHeight];
}

export function mapHeading(x, z, width, depth, canvasWidth, canvasHeight) {
  return Math.atan2(z * canvasHeight / depth, x * canvasWidth / width);
}
