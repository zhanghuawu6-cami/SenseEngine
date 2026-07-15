"use client";

import { useEffect, useRef } from "react";

type Point = { x: number; y: number; vx: number; vy: number; phase: number; warm: boolean };

export function StateField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let ratio = 1;
    let pointerX = -1000;
    let pointerY = -1000;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const points: Point[] = Array.from({ length: 32 }, (_, index) => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00012,
      vy: (Math.random() - 0.5) * 0.00012,
      phase: Math.random() * Math.PI * 2,
      warm: index % 7 === 0,
    }));

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      const glow = context.createRadialGradient(width * 0.68, height * 0.42, 0, width * 0.68, height * 0.42, width * 0.55);
      glow.addColorStop(0, "rgba(184, 255, 109, 0.055)");
      glow.addColorStop(0.5, "rgba(70, 91, 88, 0.035)");
      glow.addColorStop(1, "rgba(5, 16, 24, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      points.forEach((point) => {
        if (!reducedMotion) {
          point.x += point.vx;
          point.y += point.vy;
          if (point.x < 0.04 || point.x > 0.96) point.vx *= -1;
          if (point.y < 0.08 || point.y > 0.92) point.vy *= -1;
        }
      });

      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        const x = point.x * width;
        const y = point.y * height;
        for (let nextIndex = index + 1; nextIndex < points.length; nextIndex += 1) {
          const next = points[nextIndex];
          const nx = next.x * width;
          const ny = next.y * height;
          const distance = Math.hypot(x - nx, y - ny);
          if (distance < 190) {
            context.strokeStyle = `rgba(177, 201, 190, ${(1 - distance / 190) * 0.11})`;
            context.lineWidth = 0.7;
            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(nx, ny);
            context.stroke();
          }
        }

        const pointerDistance = Math.hypot(x - pointerX, y - pointerY);
        const pointerBoost = pointerDistance < 180 ? (1 - pointerDistance / 180) * 3 : 0;
        const pulse = 1 + Math.sin(time * 0.0012 + point.phase) * 0.4 + pointerBoost;
        context.fillStyle = point.warm ? "rgba(231, 182, 107, 0.72)" : "rgba(184, 255, 109, 0.56)";
        context.beginPath();
        context.arc(x, y, Math.max(1.1, pulse), 0, Math.PI * 2);
        context.fill();
      }

      if (!reducedMotion) animationFrame = requestAnimationFrame(draw);
    };

    const onPointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointerX = event.clientX - bounds.left;
      pointerY = event.clientY - bounds.top;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    canvas.addEventListener("pointermove", onPointerMove);
    resize();
    draw(0);
    if (!reducedMotion) animationFrame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="state-field" aria-hidden="true" />;
}
