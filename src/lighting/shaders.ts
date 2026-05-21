// 共通 GLSL: 配光プロファイル / シャドウキャスタ / ヘイズ散乱
//
// MAX_FIXTURES は store と同期。シェーダーでループ上限。

export const MAX_FIXTURES = 16
export const MAX_OCCLUDERS = 12

// 配光プロファイル: super-Gaussian + 中心ホットスポット
// kind: 0=PAR(オーバル) 1=Fresnel 2=PC 3=Profile
export const beamProfileGLSL = /* glsl */ `
float superGauss(float ang, float beamHalf, float fieldHalf, float flatness, float peak) {
  if (ang >= fieldHalf * 1.06) return 0.0;
  float sigma = beamHalf / pow(0.6931471805599453, 1.0 / (2.0 * flatness));
  float core = exp(-pow(ang / sigma, 2.0 * flatness));
  float centerW = exp(-pow(ang / (beamHalf * 0.3 + 1e-4), 2.0));
  float cutoff = 1.0 - smoothstep(fieldHalf, fieldHalf * 1.06, ang);
  return (core + peak * centerW) * cutoff;
}

// dirToSurface: 光源→面 方向 (normalize済)
// axis: ビーム方向 (light→target normalize済)
// upAxis: PAR楕円の長軸 (axis に直交)
float beamProfile(vec3 dirToSurface, vec3 axis, vec3 upAxis, int kind,
                  float beamHalf, float fieldHalf, float flatness, float peak, float ellipticity) {
  float cosA = dot(dirToSurface, axis);
  if (cosA <= 0.0) return 0.0;
  float ang = acos(clamp(cosA, -1.0, 1.0));

  if (kind == 0) {
    // PAR: 楕円配光
    // dirToSurface を beam ローカル座標に投影
    vec3 right = cross(axis, upAxis);
    // 投影成分
    vec3 perp = dirToSurface - axis * cosA;
    float plen = length(perp);
    if (plen < 1e-6) return superGauss(0.0, beamHalf, fieldHalf, flatness, peak);
    vec3 perpN = perp / plen;
    float cu = dot(perpN, upAxis);    // 縦軸成分
    float cr = dot(perpN, right);     // 横軸成分
    // 楕円距離: ellipticity > 1 なら横長 -> 横方向の有効角を縮める
    float effAng = ang * sqrt(cu*cu + (cr*cr) / (ellipticity * ellipticity));
    return superGauss(effAng, beamHalf, fieldHalf, flatness, peak);
  } else {
    return superGauss(ang, beamHalf, fieldHalf, flatness, peak);
  }
}
`

// SDFカプセル + Iñigo Quílez 流ソフトシャドウ (ペナンブラ式)
// occluders は (pos.xyz, radius, axis.xyz, halfHeight) でカプセル表現
export const occlusionGLSL = /* glsl */ `
struct Occluder {
  vec3 pos;
  vec3 axis;
  float radius;
  float halfHeight;
};
uniform int uOccluderCount;
uniform Occluder uOccluders[${MAX_OCCLUDERS}];

// 点 p から軸 [pa, pb] カプセル(半径r)までの符号付距離
float sdCapsulePts(vec3 p, vec3 pa, vec3 pb, float r) {
  vec3 ba = pb - pa;
  vec3 pq = p - pa;
  float h = clamp(dot(pq, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pq - ba * h) - r;
}

float sceneSDF(vec3 p) {
  float d = 1e9;
  for (int i = 0; i < ${MAX_OCCLUDERS}; i++) {
    if (i >= uOccluderCount) break;
    Occluder o = uOccluders[i];
    if (o.radius <= 0.0) continue;
    vec3 pa = o.pos - o.axis * o.halfHeight;
    vec3 pb = o.pos + o.axis * o.halfHeight;
    d = min(d, sdCapsulePts(p, pa, pb, o.radius));
  }
  return d;
}

uniform int uShadowSteps;       // 品質依存ステップ数 (10..36)

// ハード影 (高速)
float shadowToLight(vec3 surfPos, vec3 lightPos) {
  vec3 dir = lightPos - surfPos;
  float dist = length(dir);
  vec3 rd = dir / dist;
  vec3 ro = surfPos + rd * 0.05;
  float t = 0.0;
  for (int s = 0; s < 36; s++) {
    if (s >= uShadowSteps) break;
    if (t > dist - 0.05) break;
    float h = sceneSDF(ro + rd * t);
    if (h < 0.001) return 0.0;
    t += max(h, 0.04);
  }
  return 1.0;
}

// ソフト影 (IQ式ペナンブラ): k 大きいほど硬い
float softShadowToLight(vec3 surfPos, vec3 lightPos, float k) {
  vec3 dir = lightPos - surfPos;
  float dist = length(dir);
  vec3 rd = dir / dist;
  vec3 ro = surfPos + rd * 0.06;
  float res = 1.0;
  float t = 0.0;
  float ph = 1e20;
  for (int s = 0; s < 36; s++) {
    if (s >= uShadowSteps) break;
    if (t > dist - 0.05) break;
    float h = sceneSDF(ro + rd * t);
    if (h < 0.001) { res = 0.0; break; }
    float y = h*h / (2.0 * ph);
    float d = sqrt(max(h*h - y*y, 0.0));
    res = min(res, k * d / max(t - y, 1e-3));
    ph = h;
    t += clamp(h, 0.05, 0.4);
  }
  return clamp(res, 0.0, 1.0);
}
`

// フィクスチャ uniform 構造体
export const fixtureUniformGLSL = /* glsl */ `
struct Fixture {
  vec3 position;
  vec3 axis;
  vec3 upAxis;
  vec3 color;
  float beamHalf;
  float fieldHalf;
  float flatness;
  float peak;
  float ellipticity;
  float intensity;
  float shadow;
  int kind;
};
uniform int uFixtureCount;
uniform Fixture uFixtures[${MAX_FIXTURES}];
uniform float uAmbient;
uniform float uExposure;
`

// トーンマッピング (ACES filmic, fitted) + sRGB変換
export const toneMapGLSL = /* glsl */ `
vec3 acesTonemap(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}
// 線形 → sRGB (正確な区分関数)
vec3 linearToSRGB(vec3 c) {
  bvec3 cutoff = lessThan(c, vec3(0.0031308));
  vec3 lo = c * 12.92;
  vec3 hi = pow(max(c, vec3(0.0)), vec3(1.0/2.4)) * 1.055 - 0.055;
  return mix(hi, lo, vec3(cutoff));
}
// sRGB → 線形 (uniform で渡される色を線形空間に揃える)
vec3 srgbToLinear(vec3 c) {
  bvec3 cutoff = lessThan(c, vec3(0.04045));
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(hi, lo, vec3(cutoff));
}
`

// Cook-Torrance GGX マイクロファセット BRDF
// - D: GGX 法線分布
// - G: Smith マスキング/シャドウイング
// - F: Schlick Fresnel
// すべて物理ベース、エネルギー保存
export const pbrGLSL = /* glsl */ `
const float PI = 3.14159265359;

float D_GGX(float NdH, float a) {
  float a2 = a * a;
  float d = NdH * NdH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-6);
}
float V_SmithGGX(float NdL, float NdV, float a) {
  float a2 = a * a;
  float gv = NdL * sqrt(NdV * NdV * (1.0 - a2) + a2);
  float gl = NdV * sqrt(NdL * NdL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-4);
}
vec3 F_Schlick(float VdH, vec3 F0) {
  float f = pow(clamp(1.0 - VdH, 0.0, 1.0), 5.0);
  return F0 + (1.0 - F0) * f;
}

// Cook-Torrance BRDF: 拡散項 + 鏡面反射項
vec3 brdf(vec3 N, vec3 V, vec3 L, vec3 baseColor, float roughness, float metallic) {
  vec3 H = normalize(L + V);
  float NdL = max(dot(N, L), 0.0);
  float NdV = max(dot(N, V), 0.0);
  float NdH = max(dot(N, H), 0.0);
  float VdH = max(dot(V, H), 0.0);

  // 金属は色付きF0、誘電体は4%
  vec3 F0 = mix(vec3(0.04), baseColor, metallic);
  float a = max(roughness * roughness, 0.002);

  float D = D_GGX(NdH, a);
  float Vis = V_SmithGGX(NdL, NdV, a);
  vec3 F = F_Schlick(VdH, F0);

  vec3 specular = D * Vis * F;
  vec3 kd = (1.0 - F) * (1.0 - metallic);
  vec3 diffuse = kd * baseColor / PI;
  return (diffuse + specular) * NdL;
}

// 物理的逆二乗減衰 + ウィンドウイング (ソースの特異性回避)
float distanceAttenuation(float dist) {
  float d = max(dist, 0.05);
  // 1/d^2 を 30m で滑らかにゼロへ (シーンスコープ用)
  float invSq = 1.0 / (d * d);
  float falloffRange = 30.0;
  float w = clamp(1.0 - pow(d / falloffRange, 4.0), 0.0, 1.0);
  return invSq * w * w;
}
`
