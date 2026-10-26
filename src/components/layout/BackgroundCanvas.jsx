import React, { useEffect, useRef } from 'react';

/**
 * BackgroundCanvas Component
 * Renders a calm, ambient, high-performance WebGL/Canvas dynamic particle field.
 * Completely free of mouse tracking or cursor repulsion effects.
 */
export const BackgroundCanvas = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    const particleCount = width < 768 ? 25 : 55;
    const particles = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(Math.random() * 0.4 + 0.1), // Gentle natural upward drift
        radius: Math.random() * 2 + 1,
        color: Math.random() > 0.4 ? 'rgba(6, 182, 212, ' : 'rgba(139, 92, 246, ',
        alpha: Math.random() * 0.4 + 0.2,
      });
    }

    let animationFrameId;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Render Ambient Grid Lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
      ctx.lineWidth = 1;
      const gridSize = 64;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (!prefersReducedMotion) {
        particles.forEach((p, idx) => {
          p.x += p.vx;
          p.y += p.vy;

          if (p.y < -10) {
            p.y = height + 10;
            p.x = Math.random() * width;
          }
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;

          // Draw Particle Node
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = `${p.color}${p.alpha})`;
          ctx.fill();

          // Connect Nearby Nodes
          for (let j = idx + 1; j < particles.length; j++) {
            const p2 = particles[j];
            const pDist = Math.hypot(p.x - p2.x, p.y - p2.y);
            if (pDist < 100) {
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.strokeStyle = `rgba(6, 182, 212, ${0.1 * (1 - pDist / 100)})`;
              ctx.stroke();
            }
          }
        });
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 w-full h-full pointer-events-none"
      aria-hidden="true"
    />
  );
};
