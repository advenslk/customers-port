import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HeroSculpturalPrism } from './HelzerXBrand';

interface ThreePrismCanvasProps {
  className?: string;
  interactive?: boolean;
  variant?: 'hero' | 'auth';
}

export function ThreePrismCanvas({
  className = '',
  interactive = true,
  variant = 'hero',
}: ThreePrismCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fallbackMode, setFallbackMode] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let pmremGenerator: THREE.PMREMGenerator | null = null;
    let envRT: THREE.WebGLRenderTarget | null = null;
    let animationId = 0;

    const disposables: Array<{ dispose: () => void }> = [];

    try {
      const width = container.clientWidth || 440;
      const height = container.clientHeight || 380;

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.22;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);

      const canvas = renderer.domElement;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.touchAction = interactive ? 'none' : 'auto';
      container.innerHTML = '';
      container.appendChild(canvas);

      scene = new THREE.Scene();

      pmremGenerator = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      envRT = pmremGenerator.fromScene(roomEnv, 0.04);
      scene.environment = envRT.texture;
      roomEnv.dispose();

      camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
      camera.position.set(0, 0.2, variant === 'auth' ? 7.6 : 7.1);

      // Studio Three-Point Lighting: Warm Molten Key + Cool Slate Fill + Sharp Copper Rim
      const ambient = new THREE.AmbientLight(0x2a1812, 0.7);
      scene.add(ambient);

      const keyLight = new THREE.DirectionalLight(0xff9254, 3.2);
      keyLight.position.set(4.5, 5.2, 4.8);
      scene.add(keyLight);

      const moltenPoint = new THREE.PointLight(0xff5e1a, 18, 20, 1.8);
      moltenPoint.position.set(2.2, -1.6, 3.4);
      scene.add(moltenPoint);

      const coolRim = new THREE.DirectionalLight(0x7aa4d6, 1.5);
      coolRim.position.set(-5.0, 2.8, -3.5);
      scene.add(coolRim);

      const warmRim = new THREE.DirectionalLight(0xff7838, 2.2);
      warmRim.position.set(1.5, -4.5, -3.0);
      scene.add(warmRim);

      // Materials matching the obsidian + molten brushed copper reference
      const copperMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#ea580c'),
        metalness: 0.92,
        roughness: 0.24,
        clearcoat: 0.55,
        clearcoatRoughness: 0.18,
        emissive: new THREE.Color('#5a1d06'),
        emissiveIntensity: 0.35,
        envMapIntensity: 1.45,
      });

      const darkObsidianMetal = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#191416'),
        metalness: 0.88,
        roughness: 0.28,
        clearcoat: 0.45,
        clearcoatRoughness: 0.22,
        envMapIntensity: 1.25,
      });

      const glowingCoreMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#ff8142'),
        metalness: 0.75,
        roughness: 0.15,
        emissive: new THREE.Color('#ff5514'),
        emissiveIntensity: 0.8,
        clearcoat: 0.8,
      });

      disposables.push(copperMat, darkObsidianMetal, glowingCoreMat);

      // Build rounded extruded sculptural beams (reminiscent of the 3D intersecting HelzerX / WMT prism)
      const createRoundedBeamShape = (w: number, h: number, r: number) => {
        const shape = new THREE.Shape();
        const hw = w / 2;
        const hh = h / 2;
        shape.moveTo(-hw + r, -hh);
        shape.lineTo(hw - r, -hh);
        shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
        shape.lineTo(hw, hh - r);
        shape.quadraticCurveTo(hw, hh, hw - r, hh);
        shape.lineTo(-hw + r, hh);
        shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
        shape.lineTo(-hw, -hh + r);
        shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
        return shape;
      };

      const sculptureGroup = new THREE.Group();
      scene.add(sculptureGroup);

      const mainArmGeo = new THREE.ExtrudeGeometry(createRoundedBeamShape(3.55, 1.02, 0.24), {
        depth: 0.95,
        bevelEnabled: true,
        bevelThickness: 0.14,
        bevelSize: 0.12,
        bevelSegments: 5,
      });
      mainArmGeo.center();
      disposables.push(mainArmGeo);

      const crossArmGeo = new THREE.ExtrudeGeometry(createRoundedBeamShape(3.45, 0.96, 0.22), {
        depth: 0.88,
        bevelEnabled: true,
        bevelThickness: 0.14,
        bevelSize: 0.12,
        bevelSegments: 5,
      });
      crossArmGeo.center();
      disposables.push(crossArmGeo);

      // Intersecting sculptural arms
      const armA = new THREE.Mesh(mainArmGeo, copperMat);
      armA.rotation.set(0.18, 0.24, Math.PI / 4);
      sculptureGroup.add(armA);

      const armB = new THREE.Mesh(crossArmGeo, darkObsidianMetal);
      armB.rotation.set(-0.22, -0.18, -Math.PI / 4);
      armB.position.z = 0.08;
      sculptureGroup.add(armB);

      // Vertical spine accent bar
      const spineGeo = new THREE.ExtrudeGeometry(createRoundedBeamShape(0.84, 2.7, 0.2), {
        depth: 0.72,
        bevelEnabled: true,
        bevelThickness: 0.12,
        bevelSize: 0.1,
        bevelSegments: 4,
      });
      spineGeo.center();
      disposables.push(spineGeo);

      const spineMesh = new THREE.Mesh(spineGeo, copperMat);
      spineMesh.position.set(0, -0.04, -0.18);
      spineMesh.rotation.y = 0.25;
      sculptureGroup.add(spineMesh);

      // Molten faceted core octahedron nested cleanly at intersection
      const coreGeo = new THREE.OctahedronGeometry(0.62, 0);
      disposables.push(coreGeo);
      const coreMesh = new THREE.Mesh(coreGeo, glowingCoreMat);
      coreMesh.position.set(0, 0, 0.34);
      coreMesh.scale.set(1, 1, 0.75);
      sculptureGroup.add(coreMesh);

      // Subtle architectural metallic orbit ring
      const ringGeo = new THREE.TorusGeometry(2.55, 0.022, 16, 96);
      disposables.push(ringGeo);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xff7b3b,
        metalness: 0.9,
        roughness: 0.25,
        transparent: true,
        opacity: 0.42,
      });
      disposables.push(ringMat);
      const orbitRing = new THREE.Mesh(ringGeo, ringMat);
      orbitRing.rotation.set(Math.PI / 2.6, -0.35, 0.2);
      sculptureGroup.add(orbitRing);

      // Floating micro-shatter prism satellites
      const shardGeo = new THREE.OctahedronGeometry(0.14, 0);
      disposables.push(shardGeo);
      const shards: Array<{ mesh: THREE.Mesh; radius: number; speed: number; offset: number; yAmp: number }> = [];
      for (let i = 0; i < 6; i++) {
        const shard = new THREE.Mesh(shardGeo, i % 2 === 0 ? copperMat : darkObsidianMetal);
        const radius = 2.35 + (i % 3) * 0.36;
        const offset = (i / 6) * Math.PI * 2;
        shard.position.set(Math.cos(offset) * radius, Math.sin(offset * 1.5) * 0.9, Math.sin(offset) * 1.1);
        sculptureGroup.add(shard);
        shards.push({ mesh: shard, radius, speed: 0.22 + i * 0.04, offset, yAmp: 0.55 + (i % 2) * 0.35 });
      }

      // Base rest orientation matching visual weight
      sculptureGroup.rotation.set(0.14, -0.28, 0.04);

      // Pointer & drag state
      let targetRotX = 0.14;
      let targetRotY = -0.28;
      let pointerParallaxX = 0;
      let pointerParallaxY = 0;
      let isDragging = false;
      let prevX = 0;
      let prevY = 0;
      let contextLost = false;

      const onPointerDown = (e: PointerEvent) => {
        if (!interactive) return;
        isDragging = true;
        prevX = e.clientX;
        prevY = e.clientY;
        canvas.style.cursor = 'grabbing';
      };

      const onPointerMove = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
        const ny = -(((e.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);
        pointerParallaxX = THREE.MathUtils.clamp(nx, -1, 1) * 0.26;
        pointerParallaxY = THREE.MathUtils.clamp(ny, -1, 1) * 0.2;

        if (isDragging && interactive) {
          const dx = e.clientX - prevX;
          const dy = e.clientY - prevY;
          targetRotY += dx * 0.0085;
          targetRotX = THREE.MathUtils.clamp(targetRotX + dy * 0.0065, -0.75, 0.75);
          prevX = e.clientX;
          prevY = e.clientY;
        }
      };

      const onPointerUp = () => {
        isDragging = false;
        canvas.style.cursor = interactive ? 'grab' : 'default';
      };

      const onContextLost = (e: Event) => {
        e.preventDefault();
        contextLost = true;
      };

      const onContextRestored = () => {
        contextLost = false;
      };

      canvas.style.cursor = interactive ? 'grab' : 'default';
      canvas.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('webglcontextlost', onContextLost);
      canvas.addEventListener('webglcontextrestored', onContextRestored);

      const resizeObserver = new ResizeObserver((entries) => {
        if (!renderer || !camera) return;
        for (const entry of entries) {
          const w = Math.max(entry.contentRect.width, 120);
          const h = Math.max(entry.contentRect.height, 120);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      });
      resizeObserver.observe(container);

      const clock = new THREE.Clock();

      const animate = () => {
        animationId = requestAnimationFrame(animate);
        if (contextLost || !renderer || !scene || !camera) return;

        const elapsed = clock.getElapsedTime();

        if (!prefersReducedMotion) {
          const idleDriftY = !isDragging ? Math.sin(elapsed * 0.45) * 0.18 : 0;
          const idleDriftX = !isDragging ? Math.cos(elapsed * 0.35) * 0.06 : 0;
          sculptureGroup.position.y = Math.sin(elapsed * 1.1) * 0.1;

          sculptureGroup.rotation.y = THREE.MathUtils.lerp(
            sculptureGroup.rotation.y,
            targetRotY + pointerParallaxX + idleDriftY,
            0.055
          );
          sculptureGroup.rotation.x = THREE.MathUtils.lerp(
            sculptureGroup.rotation.x,
            targetRotX - pointerParallaxY + idleDriftX,
            0.055
          );

          coreMesh.rotation.y = elapsed * 0.65;
          coreMesh.rotation.z = elapsed * 0.35;
          orbitRing.rotation.z = elapsed * 0.18;

          shards.forEach((s) => {
            const angle = s.offset + elapsed * s.speed;
            s.mesh.position.x = Math.cos(angle) * s.radius;
            s.mesh.position.y = Math.sin(angle * 1.4) * s.yAmp;
            s.mesh.position.z = Math.sin(angle) * 1.05;
            s.mesh.rotation.x += 0.012;
            s.mesh.rotation.y += 0.015;
          });
        }

        renderer.render(scene, camera);
      };

      animate();

      return () => {
        cancelAnimationFrame(animationId);
        resizeObserver.disconnect();
        canvas.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);

        disposables.forEach((d) => d.dispose());
        envRT?.dispose();
        pmremGenerator?.dispose();
        renderer?.dispose();
      };
    } catch {
      setFallbackMode(true);
    }
  }, [interactive, variant]);

  if (fallbackMode) {
    return <HeroSculpturalPrism />;
  }

  return (
    <div className={`relative w-full h-full select-none ${className}`}>
      <div
        className="absolute inset-6 rounded-full blur-3xl opacity-45 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(255,107,44,0.52) 0%, rgba(194,65,12,0.18) 52%, transparent 76%)',
        }}
      />
      <div
        ref={containerRef}
        className="relative w-full h-full min-h-[320px] md:min-h-[400px]"
        aria-label="Interactive 3D HelzerX architectural sculpture"
      />
    </div>
  );
}
