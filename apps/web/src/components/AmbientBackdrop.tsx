import { useEffect, useRef } from "react";
import * as THREE from "three";

import { prefersReducedMotion } from "../motion/motion.js";

/**
 * Fixed full-viewport WebGL landscape rendered behind the public pages
 * (home, login, register). A single shader plane draws a quiet nature scene:
 * layered misty hills in the brand greens under a soft sky, with a sun glow,
 * slow-drifting clouds, and floating pollen motes (fireflies after dark).
 * The hills parallax gently toward the pointer. Lazy-loaded so the admin
 * bundle never pays for three.js; pauses on hidden tabs; renders one static
 * frame under prefers-reduced-motion.
 */

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uAspect;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSun;
  uniform vec3 uHillFar;
  uniform vec3 uHillNear;
  uniform vec3 uMote;
  uniform float uIntensity;

  // Cheap value noise + fbm — plenty for soft ridgelines and clouds.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p = p * 2.1 + vec2(13.7, 7.3);
      amplitude *= 0.5;
    }
    return value;
  }

  // Height of one hill ridge at horizontal position x.
  float ridge(float x, float base, float amp, float freq, float seed) {
    return base + (fbm(vec2(x * freq + seed, seed * 1.7)) - 0.5) * amp;
  }

  // Floating motes (pollen by day, fireflies by night): one drifting,
  // twinkling point per sparse grid cell.
  float motes(vec2 uv, float scale, float t) {
    vec2 q = uv * scale;
    vec2 cell = floor(q);
    float rnd = hash(cell);

    // Only some cells carry a mote, so the field stays sparse.
    if (rnd > 0.35) {
      return 0.0;
    }

    vec2 center = vec2(0.5)
      + 0.32 * vec2(
          sin(t * (0.10 + 0.22 * rnd) + rnd * 6.2831),
          cos(t * (0.07 + 0.16 * rnd) + rnd * 9.42)
        );
    float d = length(fract(q) - center);
    float twinkle = 0.55 + 0.45 * sin(t * (0.6 + rnd * 1.4) + rnd * 12.0);
    return smoothstep(0.065, 0.0, d) * twinkle;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime;

    // --- Sky -----------------------------------------------------------
    vec3 color = mix(uSkyHorizon, uSkyTop, pow(clamp(uv.y, 0.0, 1.0), 0.85));

    // Slow cloud streaks drifting across the upper sky.
    float clouds = fbm(vec2(uv.x * 2.2 + t * 0.012, uv.y * 5.5));
    clouds = smoothstep(0.45, 0.85, clouds) * smoothstep(0.35, 0.75, uv.y);
    color = mix(color, uSkyTop + (uSkyHorizon - uSkyTop) * 0.25 + 0.06, clouds * 0.35);

    // Soft sun/moon glow low in the sky.
    vec2 sunPos = vec2(0.76, 0.62);
    vec2 toSun = (uv - sunPos) * vec2(uAspect, 1.0);
    float sunGlow = exp(-dot(toSun, toSun) * 42.0);
    color += uSun * sunGlow * 0.5;
    float sunHalo = exp(-dot(toSun, toSun) * 6.0);
    color += uSun * sunHalo * 0.12;

    // --- Hills ----------------------------------------------------------
    // Four ridgelines, far to near; nearer layers parallax more with the
    // pointer and sit lower on screen. Far hills dissolve into mist.
    float hillMask = 0.0;

    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float depth = (fi + 1.0) / 4.0;                 // 0.25 far → 1.0 near
      float base = 0.42 - fi * 0.10;
      float amp = 0.10 + fi * 0.04;
      float freq = 1.9 + fi * 0.75;
      float seed = 11.0 + fi * 23.7;
      float drift = t * 0.004 * (1.0 + fi);
      float px = uPointer.x * 0.022 * depth;
      float py = uPointer.y * 0.012 * depth;

      float yr = ridge(uv.x + px + drift, base + py, amp, freq, seed);
      float m = smoothstep(yr + 0.0035, yr - 0.004, uv.y);

      // Mist: far layers stay translucent and pale, near layers solidify.
      float density = mix(0.35, 0.92, depth);
      vec3 hillColor = mix(uHillFar, uHillNear, depth);
      // Faint top-light on each ridge crest.
      float crest = smoothstep(yr - 0.012, yr, uv.y) * m;
      hillColor += uSun * crest * 0.18 * (1.0 - depth * 0.6);

      color = mix(color, hillColor, m * density);
      hillMask = max(hillMask, m * density);
    }

    // Ground haze where the nearest hills meet the page bottom.
    float haze = smoothstep(0.18, 0.0, uv.y) * 0.25;
    color = mix(color, uSkyHorizon, haze);

    // --- Motes ----------------------------------------------------------
    vec2 mq = vec2(uv.x * uAspect, uv.y);
    float moteField = motes(mq + vec2(t * 0.008, t * 0.004), 14.0, t)
      + motes(mq * 1.6 + vec2(31.7, -t * 0.006), 22.0, t * 1.2) * 0.7;
    moteField *= smoothstep(0.65, 0.15, uv.y);        // keep them low, near the hills
    color += uMote * moteField;

    // Fine grain keeps the soft gradients from banding.
    float grain = (hash(uv * vec2(1920.0, 1080.0) + uTime) - 0.5) * 0.02;
    color += grain;

    // Sky stays sheer so page text keeps contrast; hills read more solid.
    float alpha = 0.30 + hillMask * 0.62 + sunGlow * 0.18 + moteField * 0.5;
    gl_FragColor = vec4(color, clamp(alpha * uIntensity, 0.0, 0.92));
  }
`;

const THEMES = {
  light: {
    skyTop: new THREE.Color("#dcebdf"),
    skyHorizon: new THREE.Color("#f6ecd2"),
    sun: new THREE.Color("#ffe5ae"),
    hillFar: new THREE.Color("#b9cfba"),
    hillNear: new THREE.Color("#39684c"),
    mote: new THREE.Color("#e8d795"),
    intensity: 0.85
  },
  dark: {
    skyTop: new THREE.Color("#060e0a"),
    skyHorizon: new THREE.Color("#16322a"),
    sun: new THREE.Color("#bfe3cd"),
    hillFar: new THREE.Color("#1c3a2c"),
    hillNear: new THREE.Color("#050b07"),
    mote: new THREE.Color("#a5f0b4"),
    intensity: 0.9
  }
} as const;

function activeTheme(): keyof typeof THEMES {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export default function AmbientBackdrop() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
    } catch {
      // No WebGL: the CSS mesh wash already covers the page.
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const theme = THEMES[activeTheme()];

    const uniforms = {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uAspect: { value: 1 },
      uSkyTop: { value: theme.skyTop.clone() },
      uSkyHorizon: { value: theme.skyHorizon.clone() },
      uSun: { value: theme.sun.clone() },
      uHillFar: { value: theme.hillFar.clone() },
      uHillNear: { value: theme.hillNear.clone() },
      uMote: { value: theme.mote.clone() },
      uIntensity: { value: theme.intensity }
    };

    const material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      uniforms,
      vertexShader: VERTEX_SHADER
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(quad);

    const reduceMotion = prefersReducedMotion();
    const pointerTarget = new THREE.Vector2(0, 0);
    const clock = new THREE.Clock();
    let frame = 0;
    let isVisible = !document.hidden;

    function resize() {
      const { clientHeight, clientWidth } = host as HTMLDivElement;
      renderer.setSize(clientWidth, clientHeight, false);
      uniforms.uAspect.value = clientWidth / Math.max(clientHeight, 1);
    }

    function render() {
      uniforms.uTime.value = clock.getElapsedTime();
      // Ease the shader's pointer toward the real cursor for a fluid drift.
      uniforms.uPointer.value.lerp(pointerTarget, 0.05);
      renderer.render(scene, camera);
    }

    function loop() {
      render();
      frame = requestAnimationFrame(loop);
    }

    function onPointerMove(event: PointerEvent) {
      pointerTarget.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * -2 + 1
      );
    }

    function onVisibility() {
      const visible = !document.hidden;

      if (visible === isVisible) {
        return;
      }

      isVisible = visible;
      cancelAnimationFrame(frame);

      if (visible && !reduceMotion) {
        clock.start();
        loop();
      }
    }

    resize();

    if (reduceMotion) {
      render();
    } else {
      loop();
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
    }

    window.addEventListener("resize", resize);

    // Follow the light/dark toggle live.
    const themeObserver = new MutationObserver(() => {
      const next = THEMES[activeTheme()];
      uniforms.uSkyTop.value.copy(next.skyTop);
      uniforms.uSkyHorizon.value.copy(next.skyHorizon);
      uniforms.uSun.value.copy(next.sun);
      uniforms.uHillFar.value.copy(next.hillFar);
      uniforms.uHillNear.value.copy(next.hillNear);
      uniforms.uMote.value.copy(next.mote);
      uniforms.uIntensity.value = next.intensity;

      if (reduceMotion) {
        render();
      }
    });
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["data-theme"],
      attributes: true
    });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      themeObserver.disconnect();
      quad.geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div aria-hidden="true" className="ambient-backdrop" ref={hostRef} />;
}
