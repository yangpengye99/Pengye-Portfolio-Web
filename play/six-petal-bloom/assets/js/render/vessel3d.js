// 3D 器物渲染：以旋转体（lathe）程序生成器形，WebGL 着色出釉光、菲涅耳边光与结晶闪烁。
// 器内表面按极坐标圆盘取样釉面贴图，因此贴图上的纹样坐标与点击落点一一对应。
(function attachVessel3d(root, factory) {
  const api = factory(root.LCN || {});
  root.LCN = root.LCN || {};
  Object.assign(root.LCN, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function createVessel3dApi(core) {
  'use strict';

  const TWO_PI = Math.PI * 2;
  const THETA_STEPS = 132;
  const PROFILE_STEPS = 56;
  // 拾取网格只服务于手指落点，不参与可见器物渲染。
  // 18×10 仍能覆盖六瓣口沿，同时把每次轻点的求交面数从 1680 降到 324。
  const PICK_THETA = 18;
  const PICK_PROFILE = 10;

  const VERTEX_SHADER = [
    'attribute vec3 aPosition;',
    'attribute vec3 aNormal;',
    'attribute vec2 aUv;',
    'attribute vec2 aMeta;',
    'uniform mat4 uProjection;',
    'uniform mat4 uModelView;',
    'uniform mat3 uNormalMatrix;',
    'varying vec3 vNormal;',
    'varying vec3 vView;',
    'varying vec2 vUv;',
    'varying vec2 vMeta;',
    'void main() {',
    '  vec4 viewPosition = uModelView * vec4(aPosition, 1.0);',
    '  vNormal = normalize(uNormalMatrix * aNormal);',
    '  vView = -viewPosition.xyz;',
    '  vUv = aUv;',
    '  vMeta = aMeta;',
    '  gl_Position = uProjection * viewPosition;',
    '}',
  ].join('\n');

  const FRAGMENT_SHADER = [
    'precision mediump float;',
    'varying vec3 vNormal;',
    'varying vec3 vView;',
    'varying vec2 vUv;',
    'varying vec2 vMeta;',
    'uniform sampler2D uTexture;',
    'uniform sampler2D uMask;',
    'uniform float uTime;',
    'uniform float uShimmer;',
    'uniform vec3 uRimColor;',
    'uniform float uRimStrength;',
    'uniform float uReflectionStrength;',
    'void main() {',
    '  vec3 normal = normalize(vNormal);',
    '  vec3 view = normalize(vView);',
    '  if (!gl_FrontFacing) normal = -normal;',
    '  vec4 texel = texture2D(uTexture, vUv);',
    // 外壁在侧视时会把径向贴图压扁；邻域差分把真实片缘重新提成一线，不另造图案。
    '  float outerSample = 0.0018;',
    '  vec3 outerSampleX = texture2D(uTexture, vUv + vec2(outerSample, 0.0)).rgb;',
    '  vec3 outerSampleY = texture2D(uTexture, vUv + vec2(0.0, outerSample)).rgb;',
    '  float outerTextureEdge = clamp((length(texel.rgb - outerSampleX) + length(texel.rgb - outerSampleY)) * 2.4, 0.0, 1.0);',
    '  vec3 base = texel.rgb;',
    // 结晶遮罩来自单独的贴图：釉色本身也可能很亮，用亮度阈值会把口沿误判成结晶。
    '  float crystal = texture2D(uMask, vUv).g;',
    // 器内表面（vMeta.x==0）光照拉平，纹路以贴图本色呈现；器外壁保留光影塑形。
    '  float innerF = 1.0 - clamp(vMeta.x, 0.0, 1.0);',
    '  float outerF = 1.0 - innerF;',
    // 外壁沿用同一纹理场：保留约半强度、压低饱和度，形成淡于内壁的釉下包裹感。
    '  float glazeRadius = clamp(length(vUv - vec2(0.5)) * 2.0, 0.0, 1.0);',
    '  vec3 outerGlaze = mix(vec3(0.78, 0.86, 0.86), vec3(0.94, 0.97, 0.95), smoothstep(0.16, 1.0, glazeRadius));',
    '  float outerPatternShare = 0.64;',
    '  float outerPatternChroma = 0.84;',
    '  float outerLineGain = 0.22;',
    '  float outerLuma = dot(base, vec3(0.299, 0.587, 0.114));',
    '  vec3 outerPattern = mix(vec3(outerLuma), base, outerPatternChroma);',
    '  base = mix(base, mix(outerGlaze, outerPattern, outerPatternShare), outerF);',
    '  crystal *= mix(1.0, 0.62, outerF);',
    // 内壁完全平光：贴图本色直出，任何方向光都不落在纹路上。
    '  float shade = 1.0 - innerF;',
    '  vec3 keyLight = normalize(vec3(-0.42, 0.86, 0.52));',
    '  vec3 fillLight = normalize(vec3(0.68, 0.34, 0.46));',
    '  float key = max(dot(normal, keyLight), 0.0);',
    '  float fill = max(dot(normal, fillLight), 0.0);',
    '  vec3 ambient = vec3(0.055, 0.072, 0.075);',
    '  vec3 lit = base * (ambient + vec3(0.97) * innerF + vec3(0.30) * (1.0 - innerF) + key * 0.72 * shade + fill * 0.22 * shade);',
    '  lit += mix(outerPattern, vec3(0.96, 1.0, 1.0), 0.56) * outerTextureEdge * outerLineGain * outerF;',
    // 釉面高光：宽而柔、幅度克制，且高光避开结晶区，不盖纹路细节。
    '  vec3 halfVector = normalize(keyLight + view);',
    '  float glaze = pow(max(dot(normal, halfVector), 0.0), 26.0);',
    '  float sharp = pow(max(dot(normal, halfVector), 0.0), 128.0);',
    // 器内不加任何镜面高光；器外壁保留克制的一点，避开结晶区。
    '  float clearArea = (1.0 - crystal * 0.85) * (1.0 - innerF);',
    '  lit += vec3(0.86, 0.94, 0.96) * glaze * 0.14 * clearArea;',
    '  lit += vec3(1.0) * sharp * 0.08 * clearArea;',
    // 菲涅耳边光只勾器外轮廓，把白瓷从黑底里托出来。
    '  float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 3.2);',
    '  lit += vec3(0.58, 0.74, 0.80) * fresnel * 0.40 * (1.0 - innerF);',
    // 清釉反光：以视线反射向量采一宽一窄两扇虚拟窗光，随器形与观察角度游走。
    '  vec3 reflected = reflect(-view, normal);',
    '  float panelDistance = length(vec2((reflected.x + 0.30) / 0.34, (reflected.y - 0.18) / 0.78));',
    '  float softPanel = pow(1.0 - smoothstep(0.18, 1.18, panelDistance), 1.45);',
    '  float streakDistance = length(vec2((reflected.x - 0.20) / 0.12, (reflected.y + 0.03) / 0.92));',
    '  float narrowStreak = pow(1.0 - smoothstep(0.10, 1.06, streakDistance), 1.8);',
    '  float glassReflection = softPanel * 0.34 + narrowStreak * 0.18;',
    '  float reflectionClear = 1.0 - crystal * 0.72;',
    '  float surfaceReflection = mix(0.92, 0.68, innerF);',
    '  float reflectionFresnel = 0.50 + fresnel * 0.82;',
    '  lit += vec3(0.91, 0.98, 1.0) * glassReflection * reflectionClear * surfaceReflection * reflectionFresnel * uReflectionStrength;',
    // 口沿只加连续的菲涅耳折光与镜面亮线，不叠矩形色块。
    '  float rimF = clamp(vMeta.y, 0.0, 1.0);',
    '  float rimSpec = pow(max(dot(normal, halfVector), 0.0), 54.0);',
    '  float rimRefraction = pow(1.0 - max(dot(normal, view), 0.0), 1.65);',
    '  lit += vec3(0.88, 0.97, 1.0) * rimF * (rimSpec * 0.34 + rimRefraction * 0.11) * reflectionClear * uReflectionStrength;',
    // 结晶微闪：极轻、低频，只提示晶体在呼吸，不改写它的颜色。
    '  float twinkle = sin(uTime * 1.7 + vUv.x * 58.0 + vUv.y * 41.0) * 0.5 + 0.5;',
    '  twinkle *= sin(uTime * 0.9 - vUv.y * 33.0) * 0.5 + 0.5;',
    '  lit += vec3(0.90, 0.97, 1.0) * crystal * twinkle * uShimmer;',
    // 口沿酱色：胎骨在薄釉处透出的一线。
    '  lit = mix(lit, uRimColor * (0.30 + key * 0.75), vMeta.y * uRimStrength);',
    '  gl_FragColor = vec4(lit, 1.0);',
    '}',
  ].join('\n');

  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        out[column * 4 + row] = a[row] * b[column * 4]
          + a[4 + row] * b[column * 4 + 1]
          + a[8 + row] * b[column * 4 + 2]
          + a[12 + row] * b[column * 4 + 3];
      }
    }
    return out;
  }

  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const out = new Float32Array(16);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  }

  function rotationMatrix(yaw, pitch) {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cx = Math.cos(pitch);
    const sx = Math.sin(pitch);
    // R = Rx(pitch) * Ry(yaw)，列主序。
    return [
      cy, sx * sy, -cx * sy,
      0, cx, sx,
      sy, -sx * cy, cx * cy,
    ];
  }

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`shader-compile-failed: ${log}`);
    }
    return shader;
  }

  // 旋转体表面：θ 为周向，s 为沿轮廓的归一化弧长。
  function surfacePoint(sample, theta, lobes) {
    const factor = core.lobeFactor({ lobes }, sample.s);
    const wave = Math.cos(lobes.count * theta);
    const radius = sample.r * (1 + lobes.amp * factor * wave);
    return {
      x: Math.cos(theta) * radius,
      y: sample.y + lobes.wave * factor * wave,
      z: Math.sin(theta) * radius,
    };
  }

  function buildSurface(samples, lobes, uvFor, thetaSteps, flip) {
    const rows = samples.length;
    const columns = thetaSteps + 1;
    const positions = new Float32Array(rows * columns * 3);
    const normals = new Float32Array(rows * columns * 3);
    const uvs = new Float32Array(rows * columns * 2);
    const metas = new Float32Array(rows * columns * 2);
    const indices = [];
    const disc = new Float32Array(rows * columns * 2);
    const epsilon = 0.001;

    for (let row = 0; row < rows; row += 1) {
      const sample = samples[row];
      for (let column = 0; column < columns; column += 1) {
        const theta = (column / thetaSteps) * TWO_PI;
        const point = surfacePoint(sample, theta, lobes);
        const index = row * columns + column;
        positions[index * 3] = point.x;
        positions[index * 3 + 1] = point.y;
        positions[index * 3 + 2] = point.z;

        // 用参数方向的有限差分求法线，六瓣起伏因此自动带上正确的明暗。
        const nextTheta = surfacePoint(sample, theta + epsilon, lobes);
        const forward = row < rows - 1;
        const neighbour = surfacePoint(samples[forward ? row + 1 : row - 1], theta, lobes);
        const direction = forward ? 1 : -1;
        const tangentA = [nextTheta.x - point.x, nextTheta.y - point.y, nextTheta.z - point.z];
        const tangentB = [
          (neighbour.x - point.x) * direction,
          (neighbour.y - point.y) * direction,
          (neighbour.z - point.z) * direction,
        ];
        let nx = tangentA[1] * tangentB[2] - tangentA[2] * tangentB[1];
        let ny = tangentA[2] * tangentB[0] - tangentA[0] * tangentB[2];
        let nz = tangentA[0] * tangentB[1] - tangentA[1] * tangentB[0];
        const length = Math.hypot(nx, ny, nz) || 1;
        nx /= length; ny /= length; nz /= length;
        if (flip) { nx = -nx; ny = -ny; nz = -nz; }
        if (sample.r < 1e-4) { nx = 0; ny = flip ? -1 : 1; nz = 0; }
        normals[index * 3] = nx;
        normals[index * 3 + 1] = ny;
        normals[index * 3 + 2] = nz;

        const uv = uvFor(sample.s, theta);
        uvs[index * 2] = uv.u;
        uvs[index * 2 + 1] = uv.v;
        disc[index * 2] = uv.discX;
        disc[index * 2 + 1] = uv.discY;
        metas[index * 2] = uv.surface;
        metas[index * 2 + 1] = uv.rim;
      }
    }

    for (let row = 0; row < rows - 1; row += 1) {
      for (let column = 0; column < thetaSteps; column += 1) {
        const a = row * columns + column;
        const b = a + 1;
        const c = a + columns;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    return { positions, normals, uvs, metas, disc, indices, rows, columns };
  }

  function buildBand(inner, outer, lobes, thetaSteps, rimColorStrength) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const metas = [];
    const indices = [];
    const innerTop = inner[inner.length - 1];
    const outerTop = outer[outer.length - 1];
    for (let column = 0; column <= thetaSteps; column += 1) {
      const theta = (column / thetaSteps) * TWO_PI;
      const a = surfacePoint(innerTop, theta, lobes);
      const b = surfacePoint(outerTop, theta, lobes);
      const radial = [Math.cos(theta), 0.45, Math.sin(theta)];
      const length = Math.hypot(radial[0], radial[1], radial[2]);
      [a, b].forEach((point) => {
        positions.push(point.x, point.y, point.z);
        normals.push(radial[0] / length, radial[1] / length, radial[2] / length);
        uvs.push(0.5 + 0.5 * 0.995 * Math.cos(theta), 1 - (0.5 + 0.5 * 0.995 * Math.sin(theta)));
        metas.push(2, rimColorStrength);
      });
    }
    for (let column = 0; column < thetaSteps; column += 1) {
      const base = column * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      metas: new Float32Array(metas),
      indices,
    };
  }

  function buildVesselMesh(vessel, thetaSteps, profileSteps) {
    const inner = core.samplePath(vessel.inner, profileSteps);
    const outer = core.samplePath(vessel.outer, profileSteps);
    const lobes = vessel.lobes;
    const rimStrength = vessel.rimBand ? 1 : 0;

    const innerSurface = buildSurface(inner, lobes, (s, theta) => {
      const discX = s * Math.cos(theta);
      const discY = s * Math.sin(theta);
      return {
        u: 0.5 + 0.5 * discX,
        v: 1 - (0.5 + 0.5 * discY),
        discX,
        discY,
        surface: 0,
        rim: rimStrength * Math.pow(Math.max(0, (s - 0.965) / 0.035), 1.5),
      };
    }, thetaSteps, false);

    // 器外壁取样从器心附近一路延展至口沿；着色器再把它混淡成包裹在釉下的纹路。
    const outerSurface = buildSurface(outer, lobes, (s, theta) => {
      const mapped = 0.24 + s * 0.76;
      const discX = mapped * Math.cos(theta);
      const discY = mapped * Math.sin(theta);
      return {
        u: 0.5 + 0.5 * discX,
        v: 1 - (0.5 + 0.5 * discY),
        discX,
        discY,
        surface: 1,
        rim: rimStrength * Math.pow(Math.max(0, (s - 0.965) / 0.035), 1.5),
      };
    }, thetaSteps, true);

    const band = buildBand(inner, outer, lobes, thetaSteps, rimStrength);

    const parts = [innerSurface, outerSurface, band];
    let vertexCount = 0;
    let indexCount = 0;
    parts.forEach((part) => {
      vertexCount += part.positions.length / 3;
      indexCount += part.indices.length;
    });

    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const metas = new Float32Array(vertexCount * 2);
    const indices = new Uint16Array(indexCount);
    let vertexOffset = 0;
    let indexOffset = 0;
    parts.forEach((part) => {
      positions.set(part.positions, vertexOffset * 3);
      normals.set(part.normals, vertexOffset * 3);
      uvs.set(part.uvs, vertexOffset * 2);
      metas.set(part.metas, vertexOffset * 2);
      for (let index = 0; index < part.indices.length; index += 1) {
        indices[indexOffset + index] = part.indices[index] + vertexOffset;
      }
      vertexOffset += part.positions.length / 3;
      indexOffset += part.indices.length;
    });

    let minY = Infinity;
    let maxY = -Infinity;
    let maxRadius = 0;
    for (let index = 0; index < positions.length; index += 3) {
      minY = Math.min(minY, positions[index + 1]);
      maxY = Math.max(maxY, positions[index + 1]);
      maxRadius = Math.max(maxRadius, Math.hypot(positions[index], positions[index + 2]));
    }

    return { positions, normals, uvs, metas, indices, bounds: { minY, maxY, maxRadius } };
  }

  // 供拾取用的低分辨率器内表面副本。
  function buildPickMesh(vessel) {
    const inner = core.samplePath(vessel.inner, PICK_PROFILE);
    const triangles = [];
    for (let row = 0; row < inner.length - 1; row += 1) {
      for (let column = 0; column < PICK_THETA; column += 1) {
        const t0 = (column / PICK_THETA) * TWO_PI;
        const t1 = ((column + 1) / PICK_THETA) * TWO_PI;
        const corner = (sample, theta) => {
          const point = surfacePoint(sample, theta, vessel.lobes);
          return { x: point.x, y: point.y, z: point.z, dx: sample.s * Math.cos(theta), dy: sample.s * Math.sin(theta) };
        };
        const a = corner(inner[row], t0);
        const b = corner(inner[row], t1);
        const c = corner(inner[row + 1], t0);
        const d = corner(inner[row + 1], t1);
        triangles.push([a, c, b], [b, c, d]);
      }
    }
    return triangles;
  }

  function rayTriangle(origin, direction, triangle) {
    const [a, b, c] = triangle;
    const e1 = [b.x - a.x, b.y - a.y, b.z - a.z];
    const e2 = [c.x - a.x, c.y - a.y, c.z - a.z];
    const p = [
      direction[1] * e2[2] - direction[2] * e2[1],
      direction[2] * e2[0] - direction[0] * e2[2],
      direction[0] * e2[1] - direction[1] * e2[0],
    ];
    const determinant = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(determinant) < 1e-9) return null;
    const inverse = 1 / determinant;
    const t = [origin[0] - a.x, origin[1] - a.y, origin[2] - a.z];
    const u = (t[0] * p[0] + t[1] * p[1] + t[2] * p[2]) * inverse;
    if (u < -1e-4 || u > 1.0001) return null;
    const q = [
      t[1] * e1[2] - t[2] * e1[1],
      t[2] * e1[0] - t[0] * e1[2],
      t[0] * e1[1] - t[1] * e1[0],
    ];
    const v = (direction[0] * q[0] + direction[1] * q[1] + direction[2] * q[2]) * inverse;
    if (v < -1e-4 || u + v > 1.0001) return null;
    const distance = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inverse;
    if (distance <= 0) return null;
    return {
      distance,
      x: a.dx + (b.dx - a.dx) * u + (c.dx - a.dx) * v,
      y: a.dy + (b.dy - a.dy) * u + (c.dy - a.dy) * v,
    };
  }

  function createVesselRenderer(canvas, options) {
    const settings = options || {};
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    }) || canvas.getContext('experimental-webgl', { alpha: true, antialias: true, preserveDrawingBuffer: true });
    if (!gl) return null;

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('program-link-failed');
    gl.useProgram(program);

    const attributes = {
      position: gl.getAttribLocation(program, 'aPosition'),
      normal: gl.getAttribLocation(program, 'aNormal'),
      uv: gl.getAttribLocation(program, 'aUv'),
      meta: gl.getAttribLocation(program, 'aMeta'),
    };
    const uniforms = {
      projection: gl.getUniformLocation(program, 'uProjection'),
      modelView: gl.getUniformLocation(program, 'uModelView'),
      normalMatrix: gl.getUniformLocation(program, 'uNormalMatrix'),
      texture: gl.getUniformLocation(program, 'uTexture'),
      mask: gl.getUniformLocation(program, 'uMask'),
      time: gl.getUniformLocation(program, 'uTime'),
      shimmer: gl.getUniformLocation(program, 'uShimmer'),
      rimColor: gl.getUniformLocation(program, 'uRimColor'),
      rimStrength: gl.getUniformLocation(program, 'uRimStrength'),
      reflectionStrength: gl.getUniformLocation(program, 'uReflectionStrength'),
    };

    const buffers = {
      position: gl.createBuffer(),
      normal: gl.createBuffer(),
      uv: gl.createBuffer(),
      meta: gl.createBuffer(),
      index: gl.createBuffer(),
    };
    function createSurfaceTexture() {
      const handle = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, handle);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return handle;
    }
    const texture = createSurfaceTexture();
    const maskTexture = createSurfaceTexture();
    // 增量贴图用可复用的小画布裁出脏区。直接把 Canvas 交给 WebGL，
    // 避免 getImageData 把 GPU/Canvas 像素同步读回 JS 主线程。
    const colorPatchCanvas = document.createElement('canvas');
    const colorPatchCtx = colorPatchCanvas.getContext('2d');
    const maskPatchCanvas = document.createElement('canvas');
    const maskPatchCtx = maskPatchCanvas.getContext('2d');
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    gl.enable(gl.DEPTH_TEST);
    // 器内器外同时可见，靠深度缓冲排序；法线在片元里按朝向翻转。
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);

    let mesh = null;
    let pickMesh = null;
    let indexCount = 0;
    let vessel = null;
    let rimColor = [0.55, 0.36, 0.21];
    let rimStrength = 0;
    let textureCanvas = null;
    let cachedCanvasRect = null;
    let boundingRadius = 1.2;
    let reflectionStrength = settings.reflectionStrength === undefined
      ? 0.82
      : Math.max(0, Math.min(1.25, Number(settings.reflectionStrength) || 0));
    const view = { yaw: 0, pitch: 1.50, zoom: 1, targetY: 0, panX: 0, panY: 0 };
    const limits = { minPitch: 0.10, maxPitch: 1.54, minZoom: 0.58, maxZoom: 1.85 };
    const fieldOfView = settings.fieldOfView || (30 * Math.PI / 180);
    const margin = settings.margin || 1.06;

    // 相机距离由包围球与当前画布比例反推，因此换器物、转屏、缩放都能自动构图。
    function fitDistance() {
      const aspect = canvas.width / Math.max(1, canvas.height);
      const halfVertical = fieldOfView / 2;
      const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
      return (boundingRadius * margin) / Math.max(0.02, Math.sin(Math.min(halfVertical, halfHorizontal)));
    }

    function currentDistance() {
      return fitDistance() * view.zoom;
    }

    function uploadMesh() {
      const bind = (buffer, data, location, size) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
      };
      bind(buffers.position, mesh.positions, attributes.position, 3);
      bind(buffers.normal, mesh.normals, attributes.normal, 3);
      bind(buffers.uv, mesh.uvs, attributes.uv, 2);
      bind(buffers.meta, mesh.metas, attributes.meta, 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      indexCount = mesh.indices.length;
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      cachedCanvasRect = rect.width > 0 && rect.height > 0
        ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        : null;
      // 离屏画布（缩略图）没有布局尺寸，直接沿用它自身的像素尺寸。
      if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
        const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    // modelView = T(0,0,-distance) · R(yaw,pitch) · T(0,-targetY,0)
    function matrices() {
      const aspect = canvas.width / Math.max(1, canvas.height);
      const projection = perspective(fieldOfView, aspect, 0.1, 60);
      const rotation = rotationMatrix(view.yaw, view.pitch);
      const distance = currentDistance();
      const modelView = new Float32Array([
        rotation[0], rotation[1], rotation[2], 0,
        rotation[3], rotation[4], rotation[5], 0,
        rotation[6], rotation[7], rotation[8], 0,
        rotation[3] * -view.targetY + view.panX,
        rotation[4] * -view.targetY + view.panY,
        rotation[5] * -view.targetY - distance,
        1,
      ]);
      return { projection, modelView, rotation };
    }

    function render(timeSeconds) {
      if (!mesh) return;
      const { projection, modelView, rotation } = matrices();
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniformMatrix4fv(uniforms.projection, false, projection);
      gl.uniformMatrix4fv(uniforms.modelView, false, modelView);
      gl.uniformMatrix3fv(uniforms.normalMatrix, false, new Float32Array(rotation));
      gl.uniform1f(uniforms.time, timeSeconds || 0);
      gl.uniform1f(uniforms.shimmer, settings.shimmer === undefined ? 0.22 : settings.shimmer);
      gl.uniform3fv(uniforms.rimColor, new Float32Array(rimColor));
      gl.uniform1f(uniforms.rimStrength, rimStrength);
      gl.uniform1f(uniforms.reflectionStrength, reflectionStrength);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniforms.texture, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, maskTexture);
      gl.uniform1i(uniforms.mask, 1);
      gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
    }

    return {
      supported: true,
      get view() { return view; },
      get limits() { return limits; },
      get vessel() { return vessel; },
      resize,
      render,
      setShimmer(value) { settings.shimmer = value; },
      setReflectionStrength(value) {
        reflectionStrength = Math.max(0, Math.min(1.25, Number(value) || 0));
      },
      setVessel(nextVessel) {
        vessel = nextVessel;
        mesh = buildVesselMesh(nextVessel, THETA_STEPS, PROFILE_STEPS);
        pickMesh = buildPickMesh(nextVessel);
        uploadMesh();
        const bounds = mesh.bounds;
        view.targetY = (bounds.minY + bounds.maxY) / 2;
        boundingRadius = Math.hypot(bounds.maxRadius, (bounds.maxY - bounds.minY) / 2);
        if (nextVessel.rimBand) {
          const { r, g, b } = core.hexToRgb(nextVessel.rimBand);
          rimColor = [r / 255, g / 255, b / 255];
          rimStrength = 1;
        } else {
          rimStrength = 0;
        }
      },
      setTexture(sourceCanvas, maskSource) {
        textureCanvas = sourceCanvas;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
        if (maskSource) {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, maskTexture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskSource);
        }
      },
      /** 只上传贴图的脏矩形，避免生长动画时逐帧整张重传。 */
      updateTextureRegion(sourceCanvas, maskSource, rect) {
        if (!textureCanvas) return this.setTexture(sourceCanvas, maskSource);
        const upload = (unit, handle, source, patchCanvas, patchCtx) => {
          if (!source) return;
          if (patchCanvas.width !== rect.width || patchCanvas.height !== rect.height) {
            patchCanvas.width = rect.width;
            patchCanvas.height = rect.height;
          } else {
            patchCtx.clearRect(0, 0, rect.width, rect.height);
          }
          patchCtx.drawImage(
            source,
            rect.x, rect.y, rect.width, rect.height,
            0, 0, rect.width, rect.height,
          );
          gl.activeTexture(unit);
          gl.bindTexture(gl.TEXTURE_2D, handle);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, rect.x, rect.y, gl.RGBA, gl.UNSIGNED_BYTE, patchCanvas);
        };
        upload(gl.TEXTURE0, texture, sourceCanvas, colorPatchCanvas, colorPatchCtx);
        upload(gl.TEXTURE1, maskTexture, maskSource, maskPatchCanvas, maskPatchCtx);
        return undefined;
      },
      orbit(deltaYaw, deltaPitch) {
        view.yaw += deltaYaw;
        view.pitch = Math.max(limits.minPitch, Math.min(limits.maxPitch, view.pitch + deltaPitch));
      },
      zoom(factor) {
        view.zoom = Math.max(limits.minZoom, Math.min(limits.maxZoom, view.zoom * factor));
      },
      /** 平移取景：输入屏幕像素位移，换算成视图空间平移。 */
      pan(deltaXPx, deltaYPx) {
        const worldPerPixel = (2 * currentDistance() * Math.tan(fieldOfView / 2)) / Math.max(1, canvas.clientHeight || canvas.height);
        view.panX = Math.max(-1.4, Math.min(1.4, view.panX + deltaXPx * worldPerPixel));
        view.panY = Math.max(-1.4, Math.min(1.4, view.panY - deltaYPx * worldPerPixel));
      },
      setOrientation(next) {
        // 每次显式定位都回到画面中心：平移只属于当前取景过程。
        view.panX = 0;
        view.panY = 0;
        if (next.yaw !== undefined) view.yaw = next.yaw;
        if (next.pitch !== undefined) view.pitch = Math.max(limits.minPitch, Math.min(limits.maxPitch, next.pitch));
        if (next.zoom !== undefined) {
          view.zoom = Math.max(limits.minZoom, Math.min(limits.maxZoom, next.zoom));
        }
      },
      /** 屏幕坐标 → 器内表面的圆盘坐标（圆心 0,0、口沿半径 1）；点在器外返回 null。 */
      pick(clientX, clientY) {
        if (!pickMesh) return null;
        const rect = cachedCanvasRect || canvas.getBoundingClientRect();
        const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
        const aspect = rect.width / Math.max(1, rect.height);
        const tangent = Math.tan(fieldOfView / 2);
        const directionView = [ndcX * tangent * aspect, ndcY * tangent, -1];
        const rotation = rotationMatrix(view.yaw, view.pitch);
        // 视图空间 → 模型空间：旋转矩阵为正交阵，逆即转置。
        const transpose = (vector) => [
          rotation[0] * vector[0] + rotation[1] * vector[1] + rotation[2] * vector[2],
          rotation[3] * vector[0] + rotation[4] * vector[1] + rotation[5] * vector[2],
          rotation[6] * vector[0] + rotation[7] * vector[1] + rotation[8] * vector[2],
        ];
        const translation = [
          rotation[3] * -view.targetY,
          rotation[4] * -view.targetY,
          rotation[5] * -view.targetY - currentDistance(),
        ];
        const origin = transpose([-translation[0], -translation[1], -translation[2]]);
        const direction = transpose(directionView);
        let best = null;
        for (let index = 0; index < pickMesh.length; index += 1) {
          const hit = rayTriangle(origin, direction, pickMesh[index]);
          if (hit && (!best || hit.distance < best.distance)) best = hit;
        }
        return best ? { x: best.x, y: best.y } : null;
      },
      snapshot() {
        return canvas.toDataURL('image/png');
      },
    };
  }

  return { buildPickMesh, buildVesselMesh, createVesselRenderer };
}));
