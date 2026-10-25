// Build public/models/rider.glb from a rigged humanoid GLB (Mixamo or Ready Player Me bone names):
// drop the hat and teeth meshes, shrink textures to 512 px WebP, quantize and meshopt-compress.
//   node tools/build_rider.mjs path/to/character.glb public/models/rider.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, meshopt, quantize, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
const [src, dst] = process.argv.slice(2);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot();
for (const node of root.listNodes()) {
  const m = node.getMesh();
  if (m && /^(Mesh|Wolf3D_Teeth)$/.test(m.getName())) { m.dispose(); node.dispose(); }   // hat, teeth
}
await doc.transform(
  prune(), dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }),
  quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(dst, doc);
