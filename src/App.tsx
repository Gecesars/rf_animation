// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

// ================================================
// Arranjo Colinear — AF × Espaçamento (d/λ)
// ================================================

// --- Utilidades ---
const deg2rad = (deg: number) => (Math.PI / 180) * deg;
const rad2deg = (rad: number) => (180 / Math.PI) * rad;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const toDb = (x: number) => 10 * Math.log10(Math.max(x, 1e-12));

// --- Fator de elemento ---
function elemIsotropic(_thetaRad: number): number {
  return 1.0;
}
// Dipolo fino λ/2 vertical: |E(θ)| ~ |cos((π/2)cosθ)/sinθ|
function elemDipoleHalfWave(thetaRad: number): number {
  const s = Math.max(Math.abs(Math.sin(thetaRad)), 1e-6);
  const c = Math.cos(thetaRad);
  return Math.abs(Math.cos((Math.PI / 2) * c) / s);
}

// --- Array Factor ---
// AF = sin(N ψ / 2) / sin(ψ / 2), ψ = 2π (d/λ) cosθ
function arrayFactorMag(N: number, dOverLambda: number, thetaRad: number): number {
  const psi = 2 * Math.PI * dOverLambda * Math.cos(thetaRad);
  const half = psi / 2;
  const den = Math.sin(half);
  if (Math.abs(den) < 1e-9) return N; // limite → N
  return Math.abs(Math.sin(N * half) / den);
}

// --- Padrão completo (campo/potência) ---
function computePattern(
  N: number,
  dOverLambda: number,
  elem: "isotropic" | "dipole",
  samples = 721 // 0.25°
) {
  const elemFn = elem === "isotropic" ? elemIsotropic : elemDipoleHalfWave;
  const thetas: number[] = [];
  const fieldRaw: number[] = [];
  const powerRaw: number[] = [];

  for (let i = 0; i < samples; i++) {
    const thDeg = (180 * i) / (samples - 1);
    const th = deg2rad(thDeg);
    const Af = arrayFactorMag(N, dOverLambda, th);
    const Ef = elemFn(th);
    const F = Af * Ef; // campo não normalizado
    thetas.push(thDeg);
    fieldRaw.push(F);
    powerRaw.push(F * F);
  }
  const maxField = Math.max(...fieldRaw);
  const fieldNorm = fieldRaw.map((v) => v / (maxField || 1));
  const powerNorm = fieldNorm.map((v) => v * v);
  return { thetas, fieldRaw, powerRaw, fieldNorm, powerNorm };
}

// HPBW medindo cruzamentos de -3 dB e retornando bordas
function measureHPBW(thetas: number[], powerNorm: number[]) {
  const target = 0.5; // -3 dB (potência)
  // índice mais próximo de 90°
  let idx90 = 0,
    best = Infinity;
  for (let i = 0; i < thetas.length; i++) {
    const d = Math.abs(thetas[i] - 90);
    if (d < best) {
      best = d;
      idx90 = i;
    }
  }
  const interp = (x1: number, y1: number, x2: number, y2: number, y: number) =>
    Math.abs(y2 - y1) < 1e-9 ? x1 : x1 + ((y - y1) * (x2 - x1)) / (y2 - y1);

  let L: number | null = null,
    R: number | null = null;
  // esquerda
  let i = idx90;
  while (i > 0 && powerNorm[i] > target) i--;
  if (i > 0) L = interp(thetas[i], powerNorm[i], thetas[i + 1], powerNorm[i + 1], target);
  // direita
  i = idx90;
  while (i < thetas.length - 1 && powerNorm[i] > target) i++;
  if (i < thetas.length - 1) R = interp(thetas[i - 1], powerNorm[i - 1], thetas[i], powerNorm[i], target);

  if (L !== null && R !== null) return { left: L, right: R, width: R - L };
  return { left: null as number | null, right: null as number | null, width: null as number | null };
}

// Diretividade (ganho relativo) para padrão azimutalmente simétrico
// D = 4π Umax / Prad = 2 * Pmax / ∫ P(θ) sinθ dθ
function computeDirectivity(powerRaw: number[], thetasDeg: number[]) {
  const Pmax = Math.max(...powerRaw);
  // integral ∫ P(θ) sinθ dθ (θ em rad) via trapézios
  let integral = 0;
  for (let i = 0; i < powerRaw.length - 1; i++) {
    const th1 = deg2rad(thetasDeg[i]);
    const th2 = deg2rad(thetasDeg[i + 1]);
    const p1 = powerRaw[i] * Math.sin(th1);
    const p2 = powerRaw[i + 1] * Math.sin(th2);
    integral += 0.5 * (p1 + p2) * (th2 - th1);
  }
  const Dlin = (2 * Pmax) / Math.max(integral, 1e-12);
  const DdBi = 10 * Math.log10(Dlin);
  return { Dlin, DdBi };
}

// Grating lobes (broadside, elemento isotrópico) — cos θ = ±(λ/d)
function gratingLobeAngles(dOverLambda: number): number[] {
  const r = 1 / dOverLambda;
  if (r > 1) return [];
  const a = clamp(r, -1, 1);
  const th1 = rad2deg(Math.acos(a));
  const th2 = 180 - th1;
  return [th1, th2];
}

// Varredura do ganho relativo em função de d/λ
function sweepDirectivity(
  N: number,
  elem: "isotropic" | "dipole",
  dMin = 0.4,
  dMax = 1.6,
  step = 0.01
) {
  const outDb: number[] = [];
  const outX: number[] = [];
  for (let d = dMin; d <= dMax + 1e-9; d += step) {
    const { thetas, powerRaw } = computePattern(N, d, elem, 721);
    const { DdBi } = computeDirectivity(powerRaw, thetas);
    outX.push(+d.toFixed(3));
    outDb.push(DdBi);
  }
  return { x: outX, DdBi: outDb };
}

// ================================================
// COMPONENTE PRINCIPAL
// ================================================
export default function App() {
  const [N, setN] = useState(11);
  const [dOverLambda, setD] = useState(0.85);
  const [elem, setElem] = useState<"isotropic" | "dipole">("dipole");
  const [animate, setAnimate] = useState(true);
  const [speed, setSpeed] = useState(0.25); // λ/s
  const [dir, setDir] = useState(1);

  // Animação: varre d/λ entre 0.4 e 1.6
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const stepFn = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (animate) {
        setD((prev) => {
          let v = prev + dir * speed * dt;
          if (v > 1.6) {
            v = 1.6;
            setDir(-1);
          }
          if (v < 0.4) {
            v = 0.4;
            setDir(1);
          }
          return v;
        });
      }
      raf = requestAnimationFrame(stepFn);
    };
    raf = requestAnimationFrame(stepFn);
    return () => cancelAnimationFrame(raf);
  }, [animate, dir, speed]);

  // Padrão atual
  const { thetas, fieldRaw, powerRaw, fieldNorm, powerNorm } = useMemo(
    () => computePattern(N, dOverLambda, elem),
    [N, dOverLambda, elem]
  );

  const hpbw = useMemo(() => measureHPBW(thetas, powerNorm), [thetas, powerNorm]);
  const hpbwApprox = 50.8 / (N * dOverLambda);
  const glAngles = useMemo(() => gratingLobeAngles(dOverLambda), [dOverLambda]);
  const { DdBi } = useMemo(() => computeDirectivity(powerRaw, thetas), [powerRaw, thetas]);

  // Varredura de ganho × espaçamento (recalcula quando N/elemento mudam)
  const sweep = useMemo(() => sweepDirectivity(N, elem, 0.4, 1.6, 0.01), [N, elem]);

  // --- Layout ---
  const W = 1180,
    H = 640;
  const cx = 300,
    cy = H / 2; // polar
  const R = 250;

  // Construção do path polar (campo normalizado)
  const pathPolar = useMemo(() => {
    const cmds: string[] = [];
    for (let i = 0; i < thetas.length; i++) {
      const th = thetas[i];
      const amp = fieldNorm[i];
      const phi = deg2rad(90 - th); // 90° → horizonte para a direita
      const r = amp * R;
      const x = cx + r * Math.cos(phi);
      const y = cy - r * Math.sin(phi);
      cmds.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    return cmds.join(" ");
  }, [thetas, fieldNorm]);

  // Auxiliares do gráfico planar (dB × θ)
  const plan = useMemo(() => {
    const x0 = 650,
      y0 = 70,
      w = 480,
      h = 260;
    const padL = 44,
      padB = 26,
      padT = 10,
      padR = 12;
    const xmin = 0,
      xmax = 180;
    const ymin = -40,
      ymax = 0; // dB fixo para melhor leitura
    const X = (th: number) =>
      x0 + padL + ((th - xmin) / (xmax - xmin)) * (w - padL - padR);
    const Y = (db: number) =>
      y0 + padT + (1 - (db - ymin) / (ymax - ymin)) * (h - padT - padB);

    // path dB
    let d = "";
    for (let i = 0; i < thetas.length; i++) {
      const th = thetas[i];
      const db = toDb(powerNorm[i]);
      d += `${i === 0 ? "M" : "L"} ${X(th).toFixed(1)} ${Y(db).toFixed(1)} `;
    }

    // faixa HPBW sombreada
    let shade: { xL: number; xR: number; yT: number; yB: number } | null = null;
    if (hpbw.left !== null && hpbw.right !== null) {
      shade = { xL: X(hpbw.left), xR: X(hpbw.right), yT: Y(0), yB: Y(-40) };
    }

    return { x0, y0, w, h, padL, padB, padT, padR, X, Y, path: d, shade };
  }, [thetas, powerNorm, hpbw]);

  // Gráfico ganho × d/λ
  const gainChart = useMemo(() => {
    const x0 = 650,
      y0 = 360,
      w = 480,
      h = 220;
    const padL = 44,
      padB = 28,
      padT = 10,
      padR = 12;
    const xmin = 0.4,
      xmax = 1.6;
    const ymin = Math.min(-2, Math.floor(Math.min(...sweep.DdBi) - 1));
    const ymax = Math.ceil(Math.max(...sweep.DdBi) + 1);
    const X = (x: number) =>
      x0 + padL + ((x - xmin) / (xmax - xmin)) * (w - padL - padR);
    const Y = (y: number) =>
      y0 + padT + (1 - (y - ymin) / (ymax - ymin)) * (h - padT - padB);

    // path principal
    let d = "";
    for (let i = 0; i < sweep.x.length; i++) {
      d += `${i === 0 ? "M" : "L"} ${X(sweep.x[i]).toFixed(1)} ${Y(sweep.DdBi[i]).toFixed(1)} `;
    }

    // marcador do ponto atual
    const cxm = X(dOverLambda);
    const cym = Y(DdBi);

    return { x0, y0, w, h, padL, padB, padT, padR, X, Y, path: d, cxm, cym, ymin, ymax };
  }, [sweep, dOverLambda, DdBi]);

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <header className="mb-3">
          <h1 className="text-2xl md:text-3xl font-semibold">
            Arranjo Colinear — Fator de Agrupamento × Espaçamento (d/λ)
          </h1>
          <p className="text-neutral-400 mt-1">
            Padrão vertical (broadside, α = 0). 90° = horizonte. Curvas em <span className="underline">campo</span> e{" "}
            <span className="underline">potência (dB)</span>.
          </p>
        </header>

        {/* GRÁFICOS PRINCIPAIS */}
        <div className="rounded-2xl bg-neutral-900 p-4 shadow-lg overflow-hidden">
          <svg width={W} height={H}>
            {/* --- POLAR --- */}
            <text x={40} y={30} fill="#9ca3af" fontSize={14}>
              Polar (campo normalizado)
            </text>
            {/* grade polar */}
            {[0.2, 0.4, 0.6, 0.8, 1.0].map((r, i) => (
              <circle key={i} cx={cx} cy={cy} r={r * R} fill="none" stroke="#262626" />
            ))}
            {Array.from({ length: 7 }).map((_, i) => {
              const ang = deg2rad(i * 30);
              const x = cx + R * Math.cos(ang);
              const y = cy - R * Math.sin(ang);
              return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#262626" />;
            })}
            <text x={cx} y={cy - R - 8} textAnchor="middle" fill="#9ca3af" fontSize={12}>
              0° (zênite)
            </text>
            <text x={cx + R + 10} y={cy + 4} fill="#9ca3af" fontSize={12}>
              90° (horizonte)
            </text>
            <text x={cx} y={cy + R + 16} textAnchor="middle" fill="#9ca3af" fontSize={12}>
              180° (nadir)
            </text>
            {/* padrão */}
            <motion.path
              d={pathPolar}
              fill="none"
              stroke="#22d3ee"
              strokeWidth={2.7}
              initial={false}
              animate={{ d: pathPolar }}
              transition={{ duration: 0.4 }}
            />
            {/* grating lobes */}
            {gratingLobeAngles(dOverLambda).map((ang, idx) => {
              const phi = deg2rad(90 - ang);
              const x = cx + R * Math.cos(phi);
              const y = cy - R * Math.sin(phi);
              return (
                <g key={`gl-${idx}`}>
                  <line x1={cx} y1={cy} x2={x} y2={y} stroke="#ef4444" strokeDasharray="5 4" />
                  <text x={x} y={y} fill="#ef4444" fontSize={12} dx={4} dy={-4}>
                    GL
                  </text>
                </g>
              );
            })}

            {/* --- PLANAR dB × θ --- */}
            <text x={650} y={30} fill="#9ca3af" fontSize={14}>
              Potência (dB) vs θ
            </text>
            {/* container */}
            <rect x={plan.x0} y={plan.y0} width={plan.w} height={plan.h} fill="#0b0b0b" stroke="#1f2937" rx={12} />
            {/* grid y & labels */}
            {[-40, -30, -20, -10, 0].map((v, i) => (
              <g key={i}>
                <line
                  x1={plan.x0 + plan.padL}
                  y1={plan.Y(v)}
                  x2={plan.x0 + plan.w - plan.padR}
                  y2={plan.Y(v)}
                  stroke="#1f2937"
                />
                <text x={plan.x0 + 8} y={plan.Y(v) + 4} fontSize={11} fill="#9ca3af">
                  {v} dB
                </text>
              </g>
            ))}
            {/* grid x */}
            {[0, 30, 60, 90, 120, 150, 180].map((t, i) => (
              <g key={i}>
                <line
                  x1={plan.X(t)}
                  y1={plan.y0 + plan.h - plan.padB}
                  x2={plan.X(t)}
                  y2={plan.y0 + plan.h - plan.padB + 4}
                  stroke="#374151"
                />
                <text x={plan.X(t)} y={plan.y0 + plan.h - 6} fontSize={11} fill="#9ca3af" textAnchor="middle">
                  {t}°
                </text>
              </g>
            ))}
            {/* faixa HPBW */}
            {plan.shade && (
              <rect
                x={plan.shade.xL}
                y={plan.shade.yT}
                width={plan.shade.xR - plan.shade.xL}
                height={plan.shade.yB - plan.shade.yT}
                fill="#10b98122"
                stroke="none"
              />
            )}
            {/* linha -3 dB */}
            <line
              x1={plan.x0 + plan.padL}
              y1={plan.Y(-3)}
              x2={plan.x0 + plan.w - plan.padR}
              y2={plan.Y(-3)}
              stroke="#10b981"
              strokeDasharray="6 4"
            />
            {/* curva */}
            <path d={plan.path} fill="none" stroke="#a78bfa" strokeWidth={2.2} />

            {/* --- GANHO vs d/λ --- */}
            <text x={650} y={320} fill="#9ca3af" fontSize={14}>
              Ganho relativo (diretividade, dBi) vs d/λ
            </text>
            <rect x={gainChart.x0} y={gainChart.y0} width={gainChart.w} height={gainChart.h} fill="#0b0b0b" stroke="#1f2937" rx={12} />
            {/* grid y */}
            {Array.from({ length: 6 }).map((_, i) => {
              const yv = gainChart.ymin + (i * (gainChart.ymax - gainChart.ymin)) / 5;
              return (
                <g key={i}>
                  <line
                    x1={gainChart.x0 + gainChart.padL}
                    y1={gainChart.Y(yv)}
                    x2={gainChart.x0 + gainChart.w - gainChart.padR}
                    y2={gainChart.Y(yv)}
                    stroke="#1f2937"
                  />
                  <text x={gainChart.x0 + 8} y={gainChart.Y(yv) + 4} fontSize={11} fill="#9ca3af">
                    {yv.toFixed(0)} dBi
                  </text>
                </g>
              );
            })}
            {/* grid x */}
            {[0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6].map((v, i) => (
              <g key={i}>
                <line
                  x1={gainChart.X(v)}
                  y1={gainChart.y0 + gainChart.h - gainChart.padB}
                  x2={gainChart.X(v)}
                  y2={gainChart.y0 + gainChart.h - gainChart.padB + 4}
                  stroke="#374151"
                />
                <text x={gainChart.X(v)} y={gainChart.y0 + gainChart.h - 6} fontSize={11} fill="#9ca3af" textAnchor="middle">
                  {v.toFixed(1)}
                </text>
              </g>
            ))}
            {/* curva de ganho */}
            <path d={gainChart.path} fill="none" stroke="#38bdf8" strokeWidth={2.2} />
            {/* marcador do ponto atual */}
            <circle cx={gainChart.cxm} cy={gainChart.cym} r={4.5} fill="#38bdf8" />

            {/* Painel de métricas (compacto) */}
            <rect x={40} y={24} width={240} height={92} rx={14} fill="#0a0a0a" stroke="#1f2937" />
            <text x={56} y={48} fill="#d1d5db" fontSize={14}>
              N = {N} | d/λ = {dOverLambda.toFixed(3)}
            </text>
            <text x={56} y={68} fill="#d1d5db" fontSize={14}>
              Elemento: {elem === "dipole" ? "Dipolo λ/2" : "Isotrópico"}
            </text>
            <text x={56} y={88} fill="#9ca3af" fontSize={12}>
              Diretividade ≈ {DdBi.toFixed(2)} dBi
            </text>
          </svg>

          {/* CONTROLES PRÓXIMOS AOS GRÁFICOS */}
          <div className="grid md:grid-cols-2 gap-4 mt-3">
            <div className="rounded-2xl bg-neutral-900/60 border border-neutral-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Nº de elementos (N)</div>
                <div className="text-neutral-300">{N}</div>
              </div>
              <input
                type="range"
                min={2}
                max={64}
                step={1}
                value={N}
                onChange={(e) => setN(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex items-center justify-between mt-4 mb-2">
                <div className="font-medium">Espaçamento d/λ</div>
                <div className="text-neutral-300">{dOverLambda.toFixed(3)} λ</div>
              </div>
              <input
                type="range"
                min={0.4}
                max={1.6}
                step={0.001}
                value={dOverLambda}
                onChange={(e) => setD(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <label
                  className={`px-3 py-1.5 rounded-xl border ${
                    elem === "dipole" ? "bg-neutral-800 border-neutral-700" : "border-neutral-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="elem"
                    className="mr-2"
                    checked={elem === "dipole"}
                    onChange={() => setElem("dipole")}
                  />{" "}
                  Dipolo λ/2 (vertical)
                </label>
                <label
                  className={`px-3 py-1.5 rounded-xl border ${
                    elem === "isotropic" ? "bg-neutral-800 border-neutral-700" : "border-neutral-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="elem"
                    className="mr-2"
                    checked={elem === "isotropic"}
                    onChange={() => setElem("isotropic")}
                  />{" "}
                  Isotrópico
                </label>
                <button
                  onClick={() => setAnimate((v) => !v)}
                  className="ml-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition"
                >
                  {animate ? "Pausar animação" : "Reproduzir animação"}
                </button>
                <div className="text-sm text-neutral-300">Velocidade</div>
                <input
                  type="range"
                  min={0.05}
                  max={0.8}
                  step={0.01}
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                />
              </div>
            </div>

            <div className="rounded-2xl bg-neutral-900/60 border border-neutral-800 p-4 grid grid-cols-2 gap-3 text-sm">
              <div className="bg-neutral-800/50 rounded-xl p-3">
                <div className="text-neutral-400">HPBW (medida)</div>
                <div className="text-xl font-semibold">{hpbw.width ? `${hpbw.width.toFixed(1)}°` : "—"}</div>
                <div className="text-neutral-500 mt-1">−3 dB em torno de 90°</div>
              </div>
              <div className="bg-neutral-800/50 rounded-xl p-3">
                <div className="text-neutral-400">HPBW (aprox.)</div>
                <div className="text-xl font-semibold">{hpbwApprox.toFixed(1)}°</div>
                <div className="text-neutral-500 mt-1">50.8·λ/(N·d)</div>
              </div>
              <div className="bg-neutral-800/50 rounded-xl p-3">
                <div className="text-neutral-400">Ganho relativo (diretividade)</div>
                <div className="text-xl font-semibold">{DdBi.toFixed(2)} dBi</div>
                <div className="text-neutral-500 mt-1">2·Pmax / ∫P(θ)sinθ dθ</div>
              </div>
              <div className="bg-neutral-800/50 rounded-xl p-3">
                <div className="text-neutral-400">Grating lobes (isotrópico)</div>
                {glAngles.length ? (
                  <div className="text-lg font-semibold">
                    θ ≈ {glAngles[0].toFixed(1)}° e {glAngles[1].toFixed(1)}°
                  </div>
                ) : (
                  <div className="text-lg font-semibold">Sem lóbulos (d &lt; λ)</div>
                )}
                <div className="text-neutral-500 mt-1">cosθ = ±(λ/d)</div>
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-neutral-400">
            Dica: veja no gráfico de ganho como o pico se aproxima de d/λ ≲ 1 conforme N aumenta, e como lóbulos de grade (se presentes) reduzem o ganho útil no horizonte.
          </div>
        </div>
      </div>
    </div>
  );
}
