/**
 * lib/modules/checks/model-geometry.ts
 *
 * Real geometry analysis of a glTF/GLB 3D model.
 *
 * WHY THIS FILE EXISTS. `lib/complete-avatar-testing.ts` reported avatar quality
 * from constants written into the source:
 *
 *     const polygonCount = 25000;
 *     const textureCount = 8;
 *
 * It made no network call and contained no `await`. Five hundred and nineteen
 * lines took those two literals, ran them through real-looking thresholds, and
 * emitted a scored report with pass/fail verdicts. A customer scanning their
 * avatar was told its polygon count regardless of what they uploaded.
 *
 * The contract in `lib/modules/contract.ts` already names that file as the reason
 * findings require evidence. This module is the replacement, and every number it
 * reports is read out of the binary the customer actually gave us.
 *
 * WHAT MAKES THIS MEASURABLE WITHOUT A RENDERER. glTF is a documented format: a
 * JSON chunk describing meshes, accessors, materials and images, and a binary
 * chunk holding the buffers. Triangle counts come from accessor counts on the
 * primitives, not from an estimate. Texture dimensions come from the PNG/JPEG
 * headers inside the buffer. None of that needs a GPU.
 *
 * WHAT IT STILL CANNOT DO is declared on the module, because a module that must
 * state its blind spots cannot claim "NO FAKE DATA - ALL REAL TESTING" over
 * numbers it invented.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201 · 2026-09-02
 */

import type {
  CheckContext,
  CheckModule,
  CheckOutcome,
  Evidence,
  Finding,
} from '../contract';

// glTF component types, from the specification. Needed to turn an accessor's
// component count into a byte length.
const COMPONENT_BYTES: Readonly<Record<number, number>> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};

const TYPE_COMPONENTS: Readonly<Record<string, number>> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

// Primitive modes that draw triangles. Modes 0-3 are points and lines and
// contribute no triangles at all — counting them as triangles would inflate every
// report for any model with a wireframe helper in it.
const TRIANGLES = 4;
const TRIANGLE_STRIP = 5;
const TRIANGLE_FAN = 6;

interface GltfAccessor {
  count?: number;
  componentType?: number;
  type?: string;
}

interface GltfPrimitive {
  mode?: number;
  indices?: number;
  attributes?: Record<string, number>;
  material?: number;
}

interface GltfMesh {
  name?: string;
  primitives?: GltfPrimitive[];
}

interface GltfDoc {
  asset?: { version?: string; generator?: string };
  meshes?: GltfMesh[];
  accessors?: GltfAccessor[];
  materials?: unknown[];
  images?: { uri?: string; mimeType?: string; bufferView?: number }[];
  textures?: unknown[];
  skins?: { joints?: number[] }[];
  animations?: { name?: string; channels?: unknown[] }[];
  nodes?: unknown[];
}

/**
 * Parses a GLB container. Returns the JSON chunk and the binary chunk.
 *
 * GLB is a 12-byte header (magic, version, total length) followed by chunks, each
 * an 8-byte header (length, type) and its payload. Anything that does not start
 * with the `glTF` magic is treated as plain .gltf JSON.
 */
function parseGlb(buf: Buffer): { doc: GltfDoc; bin: Buffer | null } | null {
  if (buf.length < 12) return null;

  const magic = buf.readUInt32LE(0);
  // 0x46546C67 === 'glTF' little-endian.
  if (magic !== 0x46546c67) {
    try {
      return { doc: JSON.parse(buf.toString('utf8')) as GltfDoc, bin: null };
    } catch {
      return null;
    }
  }

  let offset = 12;
  let doc: GltfDoc | null = null;
  let bin: Buffer | null = null;

  while (offset + 8 <= buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (end > buf.length) break;

    if (chunkType === 0x4e4f534a) {
      // 'JSON'
      try {
        doc = JSON.parse(buf.subarray(start, end).toString('utf8')) as GltfDoc;
      } catch {
        return null;
      }
    } else if (chunkType === 0x004e4942) {
      // 'BIN'
      bin = buf.subarray(start, end);
    }
    // Chunks are 4-byte aligned.
    offset = end + ((4 - (chunkLength % 4)) % 4);
  }

  return doc ? { doc, bin } : null;
}

/**
 * Triangles in a primitive, counted from the accessor the primitive actually
 * references — indices when indexed, POSITION when not.
 */
function trianglesInPrimitive(prim: GltfPrimitive, accessors: GltfAccessor[]): number {
  const mode = prim.mode ?? TRIANGLES;
  if (mode !== TRIANGLES && mode !== TRIANGLE_STRIP && mode !== TRIANGLE_FAN) return 0;

  const idx = prim.indices;
  const posIdx = prim.attributes?.['POSITION'];
  const accessorIndex = typeof idx === 'number' ? idx : posIdx;
  if (typeof accessorIndex !== 'number') return 0;

  const count = accessors[accessorIndex]?.count ?? 0;
  if (count === 0) return 0;

  if (mode === TRIANGLES) return Math.floor(count / 3);
  // Strips and fans produce count-2 triangles, which is why mode matters rather
  // than dividing everything by three.
  return Math.max(0, count - 2);
}

/** Reads dimensions out of a PNG or JPEG header without decoding the image. */
function imageDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1] ?? 0;
      // SOF0..SOF15, excluding the non-frame markers in that range.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

function fingerprint(rule: string, subject: string): string {
  return `${rule}:${subject}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
}

export const modelGeometryCheck: CheckModule = {
  id: 'model.geometry',
  version: '1.0.0',
  category: 'PERFORMANCE',
  title: '3D model geometry and texture budget',

  whatItChecks:
    'Parses a glTF or GLB model and reports its real triangle count, mesh and material counts, texture dimensions, skeleton joints and animation count. Flags budgets that will stall a mid-range phone.',

  whatItCannotCatch: [
    'Actual frame rate. That needs the model rendered on real hardware; triangle count predicts cost but does not measure it.',
    'Visual quality, topology errors, or whether the model looks right. A clean 8,000-triangle mesh and a broken one score identically here.',
    'Rigging correctness. Joint count is read from the skin; whether those joints are weighted sensibly is not inspected.',
    'Draco or Meshopt compressed geometry. Counts come from accessors, which remain accurate, but compressed buffer sizes are not decoded.',
    'Textures referenced by external URI rather than embedded in the GLB. Those are counted but not measured.',
  ],

  supportedTargetKinds: ['asset'],
  minimumAccessTier: 'public',
  intrusive: false,

  inputs: [
    {
      name: 'modelUrl',
      description: 'URL of a .glb or .gltf file to analyse.',
      required: true,
      kind: 'url',
    },
  ],

  estimatedCredits: 2,
  estimatedRuntimeMs: 8000,
  requiresAuthenticatedSession: false,
  requiresBrowser: false,

  async run(context: CheckContext): Promise<CheckOutcome> {
    const url = String(context.inputs?.['modelUrl'] ?? context.target?.url ?? '');
    if (!url) {
      return {
        status: 'inconclusive',
        reason: 'No model URL was supplied, so there was nothing to parse.',
      };
    }

    let buf: Buffer;
    let httpStatus = 0;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      });
      httpStatus = res.status;
      if (!res.ok) {
        return {
          status: 'inconclusive',
          reason: `The model could not be fetched: HTTP ${res.status}. Nothing was analysed.`,
        };
      }
      buf = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      return {
        status: 'inconclusive',
        reason: `The model could not be fetched: ${
          e instanceof Error ? e.message : 'network error'
        }. Nothing was analysed.`,
      };
    }

    const parsed = parseGlb(buf);
    if (!parsed) {
      return {
        status: 'inconclusive',
        reason:
          'The file was fetched but is not valid glTF or GLB — the glTF magic was absent and the body did not parse as JSON.',
      };
    }

    const { doc, bin } = parsed;
    const accessors = doc.accessors ?? [];
    const meshes = doc.meshes ?? [];

    // Every number below is counted from the file. None is a constant.
    let triangles = 0;
    for (const mesh of meshes) {
      for (const prim of mesh.primitives ?? []) {
        triangles += trianglesInPrimitive(prim, accessors);
      }
    }

    const materialCount = (doc.materials ?? []).length;
    const textureCount = (doc.textures ?? []).length;
    const imageCount = (doc.images ?? []).length;
    const jointCount = (doc.skins ?? []).reduce(
      (sum, s) => sum + (s.joints?.length ?? 0),
      0,
    );
    const animationCount = (doc.animations ?? []).length;
    const nodeCount = (doc.nodes ?? []).length;
    const byteLength = buf.byteLength;

    // Texture dimensions, read from embedded image headers where the binary
    // chunk is present.
    let largestTexture = 0;
    let measuredImages = 0;
    if (bin) {
      const gltfWithViews = doc as GltfDoc & {
        bufferViews?: { byteOffset?: number; byteLength?: number }[];
      };
      for (const img of doc.images ?? []) {
        if (typeof img.bufferView !== 'number') continue;
        const view = gltfWithViews.bufferViews?.[img.bufferView];
        if (!view) continue;
        const start = view.byteOffset ?? 0;
        const slice = bin.subarray(start, start + (view.byteLength ?? 0));
        const dims = imageDimensions(slice);
        if (dims) {
          measuredImages++;
          largestTexture = Math.max(largestTexture, dims.width, dims.height);
        }
      }
    }

    const measured = (metric: string, value: number, unit: string, method: string): Evidence => ({
      kind: 'measurement',
      metric,
      value,
      unit,
      // Counted from the file, not inferred. This flag is the difference between
      // this module and the one it replaces.
      estimated: false,
      method,
    });

    const findings: Finding[] = [];

    // Budgets stated as what they are: thresholds for a mid-range mobile GPU,
    // not laws. The report says which budget it applied.
    if (triangles > 100_000) {
      findings.push({
        ruleId: 'model.triangles.excessive',
        category: 'PERFORMANCE',
        severity: triangles > 300_000 ? 'HIGH' : 'MEDIUM',
        title: `Model has ${triangles.toLocaleString()} triangles`,
        description:
          `Counted ${triangles.toLocaleString()} triangles across ${meshes.length} mesh(es). ` +
          'A mid-range mobile GPU begins dropping frames on a single avatar above roughly 100,000 triangles, ' +
          'and this figure is per-model — a scene with several of these multiplies it.',
        subject: url,
        evidence: [
          measured('triangles', triangles, 'count', 'Summed from glTF accessor counts per primitive, respecting draw mode.'),
          measured('meshes', meshes.length, 'count', 'Length of the glTF meshes array.'),
        ],
        recommendedFix:
          'Decimate the mesh or supply an LOD chain. If the model is already authored for film, export a game-resolution variant rather than shipping the source.',
        fingerprint: fingerprint('model.triangles.excessive', url),
        autoFixable: false,
      });
    }

    if (largestTexture > 2048) {
      findings.push({
        ruleId: 'model.texture.oversized',
        category: 'PERFORMANCE',
        severity: largestTexture > 4096 ? 'HIGH' : 'MEDIUM',
        title: `Largest texture is ${largestTexture}px`,
        description:
          `Read ${largestTexture}px from the embedded image headers across ${measuredImages} measured image(s). ` +
          'Textures above 2048px consume disproportionate GPU memory on mobile and are frequently downsampled by the driver anyway, ' +
          'so the bytes are paid for and the detail is not delivered.',
        subject: url,
        evidence: [
          measured('largest_texture_edge', largestTexture, 'px', 'Read from PNG IHDR / JPEG SOF headers inside the GLB binary chunk.'),
          measured('images', imageCount, 'count', 'Length of the glTF images array.'),
        ],
        recommendedFix: 'Downsample to 2048px or below, or supply KTX2/Basis compressed textures.',
        fingerprint: fingerprint('model.texture.oversized', url),
        autoFixable: false,
      });
    }

    if (byteLength > 15 * 1024 * 1024) {
      findings.push({
        ruleId: 'model.filesize.excessive',
        category: 'PERFORMANCE',
        severity: 'MEDIUM',
        title: `Model file is ${(byteLength / 1024 / 1024).toFixed(1)} MB`,
        description:
          'On a mobile connection this is a multi-second wait before anything renders. ' +
          'The file downloads before the first frame, so this is felt as a blank screen rather than as a slow model.',
        subject: url,
        evidence: [
          {
            kind: 'http_response',
            url,
            method: 'GET',
            status: httpStatus,
            bodyExcerpt: `binary, ${byteLength} bytes`,
            headers: {},
          },
          measured('file_size', byteLength, 'bytes', 'Content length of the fetched body.'),
        ],
        recommendedFix: 'Apply Draco or Meshopt geometry compression and KTX2 textures.',
        fingerprint: fingerprint('model.filesize.excessive', url),
        autoFixable: false,
      });
    }

    if (jointCount > 150) {
      findings.push({
        ruleId: 'model.skeleton.excessive',
        category: 'PERFORMANCE',
        severity: 'LOW',
        title: `Skeleton has ${jointCount} joints`,
        description:
          'Some mobile GPUs cap the uniform space available for skinning matrices, and a skeleton this size can exceed it — ' +
          'the symptom is the model rendering unskinned rather than an error.',
        subject: url,
        evidence: [measured('joints', jointCount, 'count', 'Summed from the joints array of each glTF skin.')],
        recommendedFix: 'Reduce the bind skeleton, or split skinning across multiple meshes.',
        fingerprint: fingerprint('model.skeleton.excessive', url),
        autoFixable: false,
      });
    }

    const summaryEvidence: Evidence[] = [
      measured('triangles', triangles, 'count', 'Summed from glTF accessor counts per primitive.'),
      measured('meshes', meshes.length, 'count', 'Length of the glTF meshes array.'),
      measured('materials', materialCount, 'count', 'Length of the glTF materials array.'),
      measured('textures', textureCount, 'count', 'Length of the glTF textures array.'),
      measured('joints', jointCount, 'count', 'Summed from glTF skins.'),
      measured('animations', animationCount, 'count', 'Length of the glTF animations array.'),
      measured('nodes', nodeCount, 'count', 'Length of the glTF nodes array.'),
      measured('file_size', byteLength, 'bytes', 'Content length of the fetched body.'),
    ];

    if (findings.length === 0) {
      return {
        status: 'pass',
        summary:
          `${triangles.toLocaleString()} triangles, ${meshes.length} mesh(es), ${materialCount} material(s), ` +
          `${textureCount} texture(s), ${jointCount} joint(s), ${animationCount} animation(s), ` +
          `${(byteLength / 1024).toFixed(0)} KB. Within mobile budget.`,
        evidence: summaryEvidence as [Evidence, ...Evidence[]],
      };
    }

    return {
      status: 'fail',
      findings: findings as [Finding, ...Finding[]],
      summary: `${findings.length} budget issue(s) in a model of ${triangles.toLocaleString()} triangles.`,
    };
  },
};

export default modelGeometryCheck;
