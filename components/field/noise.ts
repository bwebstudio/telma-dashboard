/**
 * A line-for-line port of the GLSL simplex noise used in the vertex shader
 * (Ashima Arts / Ian McEwan, MIT). It has to be the same function, not merely
 * a simplex noise: the CPU uses it to find where a click lands on the surface,
 * and a different noise would put the ripple somewhere the eye does not see.
 */

const mod289 = (x: number) => x - Math.floor(x * (1 / 289)) * 289
const permute = (x: number) => mod289((x * 34 + 1) * x)
const taylorInvSqrt = (r: number) => 1.79284291400159 - 0.85373472095314 * r
const step = (edge: number, x: number) => (x < edge ? 0 : 1)

export function snoise(vx: number, vy: number, vz: number): number {
  const Cx = 1 / 6
  const Cy = 1 / 3

  const s = (vx + vy + vz) * Cy
  let ix = Math.floor(vx + s)
  let iy = Math.floor(vy + s)
  let iz = Math.floor(vz + s)

  const t = (ix + iy + iz) * Cx
  const x0x = vx - ix + t
  const x0y = vy - iy + t
  const x0z = vz - iz + t

  // g = step(x0.yzx, x0.xyz)
  const gx = step(x0y, x0x)
  const gy = step(x0z, x0y)
  const gz = step(x0x, x0z)
  const lx = 1 - gx
  const ly = 1 - gy
  const lz = 1 - gz

  // i1 = min(g.xyz, l.zxy), i2 = max(g.xyz, l.zxy)
  const i1x = Math.min(gx, lz)
  const i1y = Math.min(gy, lx)
  const i1z = Math.min(gz, ly)
  const i2x = Math.max(gx, lz)
  const i2y = Math.max(gy, lx)
  const i2z = Math.max(gz, ly)

  const x1x = x0x - i1x + Cx
  const x1y = x0y - i1y + Cx
  const x1z = x0z - i1z + Cx
  const x2x = x0x - i2x + Cy
  const x2y = x0y - i2y + Cy
  const x2z = x0z - i2z + Cy
  const x3x = x0x - 0.5
  const x3y = x0y - 0.5
  const x3z = x0z - 0.5

  ix = mod289(ix)
  iy = mod289(iy)
  iz = mod289(iz)

  const p0 = permute(permute(permute(iz) + iy) + ix)
  const p1 = permute(permute(permute(iz + i1z) + iy + i1y) + ix + i1x)
  const p2 = permute(permute(permute(iz + i2z) + iy + i2y) + ix + i2x)
  const p3 = permute(permute(permute(iz + 1) + iy + 1) + ix + 1)

  // ns = n_ * D.wyz - D.xzx
  const nsx = 2 / 7
  const nsy = 0.5 / 7 - 1
  const nsz = 1 / 7

  const grad = (p: number, out: Float64Array, o: number) => {
    const j = p - 49 * Math.floor(p * nsz * nsz)
    const x_ = Math.floor(j * nsz)
    const y_ = Math.floor(j - 7 * x_)
    const x = x_ * nsx + nsy
    const y = y_ * nsx + nsy
    const h = 1 - Math.abs(x) - Math.abs(y)
    const sh = -step(h, 0)
    const sx = Math.floor(x) * 2 + 1
    const sy = Math.floor(y) * 2 + 1
    const ax = x + sx * sh
    const ay = y + sy * sh
    const norm = taylorInvSqrt(ax * ax + ay * ay + h * h)
    out[o] = ax * norm
    out[o + 1] = ay * norm
    out[o + 2] = h * norm
  }

  grad(p0, G, 0)
  grad(p1, G, 3)
  grad(p2, G, 6)
  grad(p3, G, 9)

  let m0 = Math.max(0.6 - (x0x * x0x + x0y * x0y + x0z * x0z), 0)
  let m1 = Math.max(0.6 - (x1x * x1x + x1y * x1y + x1z * x1z), 0)
  let m2 = Math.max(0.6 - (x2x * x2x + x2y * x2y + x2z * x2z), 0)
  let m3 = Math.max(0.6 - (x3x * x3x + x3y * x3y + x3z * x3z), 0)
  m0 *= m0
  m1 *= m1
  m2 *= m2
  m3 *= m3

  return (
    42 *
    (m0 * m0 * (G[0] * x0x + G[1] * x0y + G[2] * x0z) +
      m1 * m1 * (G[3] * x1x + G[4] * x1y + G[5] * x1z) +
      m2 * m2 * (G[6] * x2x + G[7] * x2y + G[8] * x2z) +
      m3 * m3 * (G[9] * x3x + G[10] * x3y + G[11] * x3z))
  )
}

// Scratch for the four gradients, so a pick does not allocate.
const G = new Float64Array(12)

/** The same surface the vertex shader draws. Keep the two in step. */
export function surfaceHeight(x: number, z: number, t: number): number {
  const wx = snoise(x * 0.32, z * 0.32, t * 0.02)
  const wz = snoise(x * 0.32 + 7.3, z * 0.32 + 7.3, t * 0.02 + 3.1)
  const qx = x + 0.55 * wx
  const qz = z + 0.55 * wz
  const breathe = 1 + 0.07 * Math.sin(t * 0.21)
  return (
    (0.52 * snoise(qx * 0.36, qz * 0.36, t * 0.035) +
      0.17 * snoise(qx * 0.9 + 3.7, qz * 0.9 + 3.7, t * 0.055) +
      0.035 * snoise(qx * 2.1 - 5.1, qz * 2.1 - 5.1, t * 0.08)) *
    breathe
  )
}

export const GLSL_NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float surfaceHeight(vec2 p, float t) {
  vec2 w = vec2(
    snoise(vec3(p * 0.32, t * 0.02)),
    snoise(vec3(p * 0.32 + 7.3, t * 0.02 + 3.1))
  );
  vec2 q = p + 0.55 * w;
  float breathe = 1.0 + 0.07 * sin(t * 0.21);
  return (
    0.52 * snoise(vec3(q * 0.36, t * 0.035)) +
    0.17 * snoise(vec3(q * 0.9 + 3.7, t * 0.055)) +
    0.035 * snoise(vec3(q * 2.1 - 5.1, t * 0.08))
  ) * breathe;
}
`
