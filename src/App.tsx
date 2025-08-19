import React, { useEffect, useMemo, useState } from "react";

/**
 * EFTX — Hub Broadcast & Telecom (offline, zero-dependency)
 * ---------------------------------------------------------
 * • Single-file React + TypeScript app for Canvas and Vite.
 * • No external UI libs; only Tailwind utility classes (Canvas supports it).
 * • All widgets are implemented locally (Cards, Tabs, Modals, Charts, Sliders...).
 * • Ready to be dropped into src/App.tsx of a Vite + React + TS project.
 *
 * Images: use the ASSETS[] array below. For Canvas preview, if an image
 *   is not available it shows a generated SVG placeholder automatically.
 */

// ----------------------------- helpers -----------------------------
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const dbmToW = (dbm: number) => Math.pow(10, (dbm - 30) / 10);
const wToDbm = (w: number) => 10 * Math.log10(w) + 30;
const fmt2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "-");

// FSPL(dB) for f[MHz], d[km]
const fspl = (fMHz: number, dKm: number) =>
  32.44 + 20 * Math.log10(clamp(fMHz, 0.001, 1e9)) + 20 * Math.log10(clamp(dKm, 0.000001, 1e9));

// First Fresnel radius (m) at point with d1, d2 (km) and f[GHz]
const fresnelR1 = (d1Km: number, d2Km: number, fGHz: number) => 17.32 * Math.sqrt((d1Km * d2Km) / (fGHz * (d1Km + d2Km)));

// Array factor (vertical) — simple synth for demo (N, spacing in λ, progressive phase ψ)
function arrayPattern(N: number, dLambda: number, psiDeg: number, nullFill: number) {
  const data: { ang: number; dB: number }[] = [];
  const M = N;
  const idx = Array.from({ length: M }, (_, i) => i - (M - 1) / 2);
  const w = idx.map((i) => {
    const u = (i + (M - 1) / 2) / (M - 1);
    const rc = 0.5 * (1 - Math.cos(2 * Math.PI * u));
    return (1 - nullFill) * 1 + nullFill * rc;
  });
  const psi = (psiDeg * Math.PI) / 180;
  for (let ang = -90; ang <= 90; ang++) {
    const th = ((ang + 90) * Math.PI) / 180;
    const u = Math.cos(th);
    let re = 0,
      im = 0;
    idx.forEach((n, k) => {
      const ph = 2 * Math.PI * dLambda * n * u + psi * (n + (M - 1) / 2);
      re += w[k] * Math.cos(ph);
      im += w[k] * Math.sin(ph);
    });
    const mag2 = re * re + im * im;
    data.push({ ang, dB: 10 * Math.log10(mag2) });
  }
  const max = Math.max(...data.map((d) => d.dB));
  return data.map((d) => ({ ...d, dB: d.dB - max }));
}

// ----------------------------- minimal UI -----------------------------
const Card: React.FC<{ className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>> = ({ className = "", children, ...rest }) => (
  <div className={"rounded-2xl border bg-white/70 dark:bg-neutral-900/70 backdrop-blur shadow-sm " + className} {...rest}>
    {children}
  </div>
);
const CardHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={"p-5 border-b border-black/5 dark:border-white/10 " + className}>{children}</div>
);
const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={"p-5 " + className}>{children}</div>
);
const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = "", children, ...rest }) => (
  <button
    className={
      "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold " +
      "bg-blue-600 text-white hover:bg-blue-700 active:scale-[.98] transition " +
      className
    }
    {...rest}
  >
    {children}
  </button>
);
const ButtonSecondary: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = "", children, ...rest }) => (
  <button className={"rounded-2xl px-4 py-2 text-sm font-semibold border hover:bg-black/5 dark:hover:bg-white/5 transition " + className} {...rest}>
    {children}
  </button>
);
const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = "", ...rest }) => (
  <input className={"w-full rounded-xl border px-3 py-2 text-sm bg-white/80 dark:bg-neutral-900/80 outline-none focus:ring-2 focus:ring-blue-500 " + className} {...rest} />
);
const Label: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <label className={"text-xs font-medium text-neutral-600 dark:text-neutral-300 " + className}>{children}</label>
);
const Badge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] text-neutral-600 dark:text-neutral-300">{children}</span>
);

const Modal: React.FC<{ open: boolean; onClose: () => void; title?: string; children: React.ReactNode; maxW?: string }> = ({ open, onClose, title, children, maxW = "max-w-2xl" }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative w-[92vw] ${maxW} rounded-2xl bg-white dark:bg-neutral-900 border shadow-xl overflow-hidden`}>
        <div className="flex items-center justify-between border-b p-4">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="text-sm px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

const Section: React.FC<{ id: string; title: string; subtitle?: string; children: React.ReactNode }> = ({ id, title, subtitle, children }) => (
  <section id={id} className="py-14 sm:py-20">
    <div className="max-w-7xl mx-auto px-4">
      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-neutral-600 dark:text-neutral-300 mt-2 max-w-3xl">{subtitle}</p>}
      </div>
      {children}
    </div>
  </section>
);

const Stat: React.FC<{ label: string; value: string; icon?: string }> = ({ label, value, icon = "⚡" }) => (
  <Card>
    <CardContent className="p-5 flex items-center gap-4">
      <div className="p-2 rounded-xl bg-blue-600/10">{icon}</div>
      <div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
      </div>
    </CardContent>
  </Card>
);

// ----------------------------- assets (offline) -----------------------------
/**
 * Substitua os paths abaixo por arquivos reais na pasta /public/assets
 * quando mover para o Vite/VSCode. No Canvas, se não houver imagem
 * no caminho indicado, mostramos automaticamente um placeholder SVG.
 */
const ASSETS: { src: string; caption: string }[] = [
  { src: "/assets/20161201_144700.jpg", caption: "S11 UHF banda larga medido em campo" },
  { src: "/assets/20171005_083303.jpg", caption: "Analisador Advantest — SWR em VHF/UHF" },
  { src: "/assets/20171009_103304.jpg", caption: "Simulações 3D — diagrama de radiação" },
  { src: "/assets/20180426_113455.jpg", caption: "Torre com painéis setoriais e enlaces" },
  { src: "/assets/DSC05533.JPG", caption: "Painel setorial UHF pressurizado" },
  { src: "/assets/P1140586.jpg", caption: "Colinear FM (bays) — arranjo vertical" },
  { src: "/assets/antena-disco.jpg", caption: "Antena direcional com alimentador corneta" },
];

const ImgOrPlaceholder: React.FC<{ src: string; alt?: string; className?: string; caption?: string }> = ({ src, alt = "", className = "", caption }) => {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    setOk(true);
  }, [src]);
  return (
    <div className={"relative " + className}>
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="w-full h-full object-cover rounded-xl border" onError={() => setOk(false)} />
      ) : (
        <svg viewBox="0 0 400 240" className="w-full h-full rounded-xl border bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-neutral-800 dark:to-neutral-900">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          <rect width="400" height="240" fill="url(#g)" />
          <g fill="#00000055" className="dark:fill-white/30">
            <circle cx="80" cy="140" r="40" />
            <rect x="120" y="100" width="190" height="80" rx="8" />
            <path d="M60 180 L340 180" stroke="#00000055" strokeWidth="6" />
          </g>
          <text x="200" y="220" textAnchor="middle" fontSize="14" fill="#00000080" className="dark:fill-white/50">Imagem offline (substitua por /assets/...)</text>
        </svg>
      )}
      {caption && <div className="absolute bottom-2 left-2 right-2 text-[11px] px-2 py-1 rounded bg-black/50 text-white">{caption}</div>}
    </div>
  );
};

const Gallery: React.FC = () => {
  const [idx, setIdx] = useState(0);
  const next = () => setIdx((i) => (i + 1) % ASSETS.length);
  const prev = () => setIdx((i) => (i - 1 + ASSETS.length) % ASSETS.length);
  useEffect(() => {
    const id = setInterval(next, 4500);
    return () => clearInterval(id);
  }, []);
  const item = ASSETS[idx];
  return (
    <div className="relative">
      <ImgOrPlaceholder src={item.src} caption={item.caption} className="h-64 md:h-80" />
      <div className="absolute inset-0 flex items-center justify-between px-2">
        <ButtonSecondary onClick={prev} className="backdrop-blur bg-white/40 dark:bg-black/30">◀</ButtonSecondary>
        <ButtonSecondary onClick={next} className="backdrop-blur bg-white/40 dark:bg-black/30">▶</ButtonSecondary>
      </div>
    </div>
  );
};

// ----------------------------- simple chart -----------------------------
function normalizeData(data: { x: number; y: number }[]) {
  if (!data.length) return { pts: "", yMin: 0, yMax: 1 };
  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const W = 600, H = 260, P = 28;
  const mapX = (x: number) => P + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * P);
  const mapY = (y: number) => H - P - ((y - yMin) / (yMax - yMin || 1)) * (H - 2 * P);
  const pts = data.map(({ x, y }) => `${mapX(x)},${mapY(y)}`).join(" ");
  return { pts, yMin, yMax, W, H, P, mapX, mapY } as any;
}

const LineChartMini: React.FC<{ data: { x: number; y: number }[]; unitY?: string; unitX?: string }> = ({ data, unitY = "dBm", unitX = "km" }) => {
  const { pts, yMin, yMax, W, H, P, mapX, mapY } = normalizeData(data) as any;
  const ticksY = 5;
  const ticksX = 6;
  const xs = data.map((d) => d.x);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-64 rounded-xl border">
      {/* grid */}
      {[...Array(ticksY + 1)].map((_, i) => {
        const y = P + ((H - 2 * P) * i) / ticksY;
        return <line key={i} x1={P} y1={y} x2={W - P} y2={y} stroke="#000" strokeOpacity={0.08} />;
      })}
      {[...Array(ticksX + 1)].map((_, i) => {
        const x = P + ((W - 2 * P) * i) / ticksX;
        return <line key={i} x1={x} y1={P} x2={x} y2={H - P} stroke="#000" strokeOpacity={0.08} />;
      })}
      {/* axes */}
      <rect x={P} y={P} width={W - 2 * P} height={H - 2 * P} fill="none" stroke="#000" strokeOpacity={0.2} />
      {/* path */}
      <polyline points={pts} fill="none" stroke="#2563eb" strokeWidth={2} />
      {/* labels */}
      {[...Array(ticksY + 1)].map((_, i) => {
        const val = yMax - ((yMax - yMin) * i) / ticksY;
        const y = P + ((H - 2 * P) * i) / ticksY;
        return (
          <text key={i} x={6} y={y + 4} fontSize={10} fill="#666">{fmt2(val)}</text>
        );
      })}
      {[...Array(ticksX + 1)].map((_, i) => {
        const val = xMin + ((xMax - xMin) * i) / ticksX;
        const x = P + ((W - 2 * P) * i) / ticksX;
        return (
          <text key={i} x={x} y={H - 6} fontSize={10} textAnchor="middle" fill="#666">{fmt2(val)}</text>
        );
      })}
      <text x={8} y={14} fontSize={11} fill="#555">{unitY}</text>
      <text x={W - 12} y={H - 8} fontSize={11} textAnchor="end" fill="#555">{unitX}</text>
    </svg>
  );
};

// ----------------------------- calculators -----------------------------
const EIRPCalc: React.FC = () => {
  const [ptW, setPtW] = useState(1);
  const [gt, setGt] = useState(10);
  const [ltx, setLtx] = useState(1);
  const eirpDbm = wToDbm(ptW) + gt - ltx;
  const eirpW = dbmToW(eirpDbm);
  return (
    <Card>
      <CardHeader>
        <div className="text-lg font-semibold">EIRP</div>
        <div className="text-xs text-neutral-500">EIRP = Pt(dBm) + Gt(dBi) − Ltx(dB)</div>
      </CardHeader>
      <CardContent className="grid sm:grid-cols-3 gap-4">
        <div>
          <Label>Potência TX (W)</Label>
          <Input type="number" value={ptW} onChange={(e) => setPtW(parseFloat(e.target.value || "0"))} />
          <div className="text-[11px] text-neutral-500 mt-1">{fmt2(wToDbm(ptW))} dBm</div>
        </div>
        <div>
          <Label>Ganho da antena (dBi)</Label>
          <Input type="number" value={gt} onChange={(e) => setGt(parseFloat(e.target.value || "0"))} />
        </div>
        <div>
          <Label>Perdas TX (cabos/conectores) (dB)</Label>
          <Input type="number" value={ltx} onChange={(e) => setLtx(parseFloat(e.target.value || "0"))} />
        </div>
        <div className="sm:col-span-3 grid grid-cols-2 gap-4">
          <Stat label="EIRP (dBm)" value={`${fmt2(eirpDbm)} dBm`} />
          <Stat label="EIRP (W)" value={`${fmt2(eirpW)} W`} />
        </div>
      </CardContent>
    </Card>
  );
};

const LinkBudgetCalc: React.FC = () => {
  const [fMHz, setFMhz] = useState(600);
  const [dKm, setDKm] = useState(20);
  const [ptDbm, setPtDbm] = useState(43);
  const [gt, setGt] = useState(12);
  const [gr, setGr] = useState(12);
  const [ltx, setLtx] = useState(1.5);
  const [lrx, setLrx] = useState(1.5);
  const [fade, setFade] = useState(10);

  const fsplDb = fspl(fMHz, dKm);
  const prDbm = ptDbm + gt + gr - (ltx + lrx) - fsplDb;
  const margin = prDbm - (-90) - fade;

  const chartData = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (let d = 1; d <= dKm; d += Math.max(1, Math.floor(dKm / 40))) {
      const rcv = ptDbm + gt + gr - (ltx + lrx) - fspl(fMHz, d);
      pts.push({ x: d, y: rcv });
    }
    return pts;
  }, [fMHz, dKm, ptDbm, gt, gr, ltx, lrx]);

  return (
    <Card>
      <CardHeader>
        <div className="text-lg font-semibold">Enlace ponto‑a‑ponto (FSPL)</div>
        <div className="text-xs text-neutral-500">FSPL = 32.44 + 20·log10(f[MHz]) + 20·log10(d[km])</div>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-3 gap-5">
        <div className="space-y-3">
          <div>
            <Label>Frequência (MHz)</Label>
            <Input type="number" value={fMHz} onChange={(e) => setFMhz(parseFloat(e.target.value || "0"))} />
          </div>
          <div>
            <Label>Distância (km)</Label>
            <Input type="number" value={dKm} onChange={(e) => setDKm(parseFloat(e.target.value || "0"))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Pt (dBm)</Label>
              <Input type="number" value={ptDbm} onChange={(e) => setPtDbm(parseFloat(e.target.value || "0"))} />
              <div className="text-[11px] text-neutral-500 mt-1">{fmt2(dbmToW(ptDbm))} W</div>
            </div>
            <div>
              <Label>Margem de desvanecimento (dB)</Label>
              <Input type="number" value={fade} onChange={(e) => setFade(parseFloat(e.target.value || "0"))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ganho TX (dBi)</Label>
              <Input type="number" value={gt} onChange={(e) => setGt(parseFloat(e.target.value || "0"))} />
            </div>
            <div>
              <Label>Ganho RX (dBi)</Label>
              <Input type="number" value={gr} onChange={(e) => setGr(parseFloat(e.target.value || "0"))} />
            </div>
            <div>
              <Label>Perdas TX (dB)</Label>
              <Input type="number" value={ltx} onChange={(e) => setLtx(parseFloat(e.target.value || "0"))} />
            </div>
            <div>
              <Label>Perdas RX (dB)</Label>
              <Input type="number" value={lrx} onChange={(e) => setLrx(parseFloat(e.target.value || "0"))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <Stat label="FSPL (dB)" value={`${fmt2(fsplDb)} dB`} />
            <Stat label="Prx (dBm)" value={`${fmt2(prDbm)} dBm`} />
            <Stat label="Margem (ref −90 dBm)" value={`${fmt2(margin)} dB`} />
          </div>
        </div>
        <div className="lg:col-span-2">
          <LineChartMini data={chartData} />
          <p className="text-[11px] text-neutral-500 mt-2">Potência recebida (dBm) em função da distância com parâmetros fixos.</p>
        </div>
      </CardContent>
    </Card>
  );
};

const ArrayTiltCalc: React.FC = () => {
  const [N, setN] = useState(8);
  const [d, setD] = useState(0.8);
  const [psi, setPsi] = useState(-25);
  const [nf, setNf] = useState(0.25);
  const data = useMemo(() => arrayPattern(N, d, psi, nf), [N, d, psi, nf]);
  const pts = data.map((p, i) => ({ x: i, y: p.dB }));
  return (
    <Card>
      <CardHeader>
        <div className="text-lg font-semibold">Array Vertical — Tilt & Null‑fill</div>
        <div className="text-xs text-neutral-500">Padrão relativo (dB) vs. ângulo (−90°..+90°) com ponderação cosenoidal.</div>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-3 gap-5">
        <div className="space-y-4">
          <div>
            <Label>Nº de elementos</Label>
            <input type="range" min={2} max={16} step={1} value={N} onChange={(e) => setN(parseInt(e.target.value))} className="w-full" />
            <div className="text-sm mt-1">{N}</div>
          </div>
          <div>
            <Label>Espaçamento (λ)</Label>
            <input type="range" min={0.3} max={1.2} step={0.05} value={d} onChange={(e) => setD(parseFloat(e.target.value))} className="w-full" />
            <div className="text-sm mt-1">{d.toFixed(2)} λ</div>
          </div>
          <div>
            <Label>Fase progressiva (°)</Label>
            <input type="range" min={-180} max={180} step={1} value={psi} onChange={(e) => setPsi(parseInt(e.target.value))} className="w-full" />
            <div className="text-sm mt-1">{psi}°</div>
          </div>
          <div>
            <Label>Preenchimento de nulos</Label>
            <input type="range" min={0} max={0.9} step={0.01} value={nf} onChange={(e) => setNf(parseFloat(e.target.value))} className="w-full" />
            <div className="text-sm mt-1">{(nf * 100).toFixed(0)}%</div>
          </div>
        </div>
        <div className="lg:col-span-2"><LineChartMini data={pts} unitY="dB" unitX="amostras" /></div>
      </CardContent>
    </Card>
  );
};

const FresnelCalc: React.FC = () => {
  const [fGHz, setFGhz] = useState(0.6);
  const [dKm, setDKm] = useState(20);
  const midR = fresnelR1(dKm / 2, dKm / 2, fGHz);
  const data = useMemo(() => {
    const arr: { x: number; y: number }[] = [];
    for (let i = 0; i <= 100; i++) {
      const d1 = (i / 100) * dKm;
      const d2 = dKm - d1;
      arr.push({ x: i, y: fresnelR1(d1, d2, fGHz) });
    }
    return arr;
  }, [fGHz, dKm]);
  return (
    <Card>
      <CardHeader>
        <div className="text-lg font-semibold">Zona de Fresnel (1ª)</div>
        <div className="text-xs text-neutral-500">r₁ = 17.32·√(d₁·d₂/(f[GHz]·d)) — d em km, r em m</div>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-3 gap-5">
        <div className="space-y-3">
          <div>
            <Label>Distância total (km)</Label>
            <Input type="number" value={dKm} onChange={(e) => setDKm(parseFloat(e.target.value || "0"))} />
          </div>
          <div>
            <Label>Frequência (GHz)</Label>
            <Input type="number" value={fGHz} onChange={(e) => setFGhz(parseFloat(e.target.value || "0"))} />
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <Stat label="Raio no meio" value={`${fmt2(midR)} m`} />
            <Stat label="60% livre" value={`${fmt2(0.6 * midR)} m`} />
          </div>
        </div>
        <div className="lg:col-span-2"><LineChartMini data={data} unitY="m" unitX="% percurso" /></div>
      </CardContent>
    </Card>
  );
};

const CalculatorsHub: React.FC = () => {
  const [tab, setTab] = useState<'link' | 'eirp' | 'fresnel' | 'array'>("link");
  const TabButton: React.FC<{ id: typeof tab; children: React.ReactNode }> = ({ id, children }) => (
    <button onClick={() => setTab(id)} className={`px-3 py-2 rounded-xl text-sm border ${tab === id ? "bg-blue-600 text-white" : "hover:bg-black/5 dark:hover:bg-white/10"}`}>{children}</button>
  );
  return (
    <div>
      <div className="flex flex-wrap gap-2"><TabButton id="link">Link Budget</TabButton><TabButton id="eirp">EIRP</TabButton><TabButton id="fresnel">Fresnel</TabButton><TabButton id="array">Array Tilt</TabButton></div>
      <div className="mt-4">
        {tab === "link" && <LinkBudgetCalc />}
        {tab === "eirp" && <EIRPCalc />}
        {tab === "fresnel" && <FresnelCalc />}
        {tab === "array" && <ArrayTiltCalc />}
      </div>
    </div>
  );
};

// ----------------------------- product catalog -----------------------------
const PRODUCT_CATALOG = [
  { id: "uhf-panel", name: "Painel Direcional UHF (TV 3.0)", desc: "Banda larga, alto F/B, VSWR ≤ 1.2, 3 kW por painel.", tags: ["UHF", "TV", "Direcional"] },
  { id: "vhf-panel", name: "Painel Direcional VHF DTV", desc: "Ganho elevado e baixa IMD para 174–230 MHz.", tags: ["VHF", "DTV"] },
  { id: "fm-circular", name: "Antena Circular FM 87.5–108 MHz", desc: "Ganho 2–12 dBd, alto isolamento entre bays.", tags: ["FM", "Circular"] },
  { id: "cavity-filter", name: "Filtro Cavidade UHF/LTE", desc: "Notch/combinado p/ rejeição 4G/5G e harmônicos.", tags: ["Filtro", "UHF", "5G"] },
  { id: "combiner", name: "Combiner FM/TV Alto Q", desc: "Múltiplos TX com baixas perdas e alto isolamento.", tags: ["Combiner"] },
  { id: "rigid-line", name: "Linha Rígida 3-1/8\" a 6-1/8\"", desc: "Seções retas/curvas, baixa PIM, kits completos.", tags: ["Linha de Transmissão"] },
];

const ProductCard: React.FC<{ p: typeof PRODUCT_CATALOG[number] }> = ({ p }) => {
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-blue-600/10 grid place-items-center">📡</div>
          <div className="font-semibold leading-tight">{p.name}</div>
        </div>
        <div className="text-sm text-neutral-600 dark:text-neutral-300">{p.desc}</div>
        <div className="flex flex-wrap gap-2 pt-1">{p.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>
        <div className="pt-3 flex gap-2">
          <Button onClick={() => setOpen(true)}>Detalhes</Button>
          <ButtonSecondary onClick={() => setFormOpen(true)}>Solicitar orçamento</ButtonSecondary>
        </div>
      </CardContent>
      <Modal open={open} onClose={() => setOpen(false)} title={p.name}>
        <div className="space-y-3 text-sm">
          <div>{p.desc}</div>
          <ul className="grid grid-cols-2 gap-3">
            <li>VSWR ≤ 1.2</li>
            <li>Pressurização opcional</li>
            <li>Conectores 7/16–EIA 1-5/8</li>
            <li>PIM &lt; −150 dBc</li>
          </ul>
        </div>
      </Modal>
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={`Solicitar orçamento — ${p.name}`} maxW="max-w-lg">
        <div className="grid gap-3">
          <Label>Nome</Label>
          <Input placeholder="Seu nome" />
          <Label>Email</Label>
          <Input type="email" placeholder="empresa@dominio.com" />
          <Label>Especificações desejadas</Label>
          <Input placeholder="Ganho, banda, potência, conector..." />
          <div className="text-right pt-2"><Button onClick={() => setFormOpen(false)}>Enviar</Button></div>
        </div>
      </Modal>
    </Card>
  );
};

const ProductsGrid: React.FC = () => {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | "">("");
  const tags = useMemo(() => Array.from(new Set(PRODUCT_CATALOG.flatMap((p) => p.tags))), []);
  const filtered = PRODUCT_CATALOG.filter((p) => {
    const matchQ = q.length === 0 || p.name.toLowerCase().includes(q.toLowerCase()) || p.desc.toLowerCase().includes(q.toLowerCase());
    const matchT = !tag || p.tags.includes(tag);
    return matchQ && matchT;
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
        <div className="flex-1">
          <Label>Buscar</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: painel UHF, filtro, linha rígida" />
        </div>
        <div className="w-full sm:w-64">
          <Label>Categoria</Label>
          <select value={tag} onChange={(e) => setTag(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-white/80 dark:bg-neutral-900/80">
            <option value="">Todas</option>
            {tags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
};

// ----------------------------- main app -----------------------------
export default function App() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50/40 dark:from-neutral-950 dark:to-neutral-900 text-neutral-900 dark:text-white">
      {/* top bar */}
      <div className="sticky top-0 z-50 backdrop-blur border-b bg-white/70 dark:bg-neutral-950/70">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-blue-600/15 grid place-items-center font-bold">EF</div>
            <div className="leading-tight">
              <div className="font-semibold">EFTX</div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Broadcast • Telecom Engineering Hub (offline)</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm">
            <a href="#produtos" className="hover:underline">Produtos</a>
            <a href="#calculadoras" className="hover:underline">Calculadoras</a>
            <a href="#galeria" className="hover:underline">Galeria</a>
            <a href="#contato" className="hover:underline">Contato</a>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Tema</span>
            <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
          </div>
        </div>
      </div>

      {/* hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 opacity-30 bg-[radial-gradient(1200px_600px_at_20%_-10%,#3b82f6_0%,transparent_60%),radial-gradient(900px_500px_at_90%_-20%,#8b5cf6_0%,transparent_70%)]" />
        <div className="max-w-7xl mx-auto px-4 py-12 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">Engenharia para <span className="text-blue-600">Broadcast & Telecom</span></h1>
              <p className="mt-4 text-neutral-600 dark:text-neutral-300 max-w-2xl">
                Catálogo técnico, simuladores e ferramentas de projeto em um único lugar. Antenas, filtros, combiners, linhas rígidas e serviços de campo — com calculadoras de enlace, Fresnel, tilt elétrico e muito mais.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href="#produtos"><Button>Ver produtos</Button></a>
                <a href="#calculadoras"><ButtonSecondary>Abrir calculadoras</ButtonSecondary></a>
              </div>
              <div className="grid sm:grid-cols-3 gap-4 mt-8">
                <Stat label="Produtos principais" value="50+" />
                <Stat label="Ferramentas técnicas" value="10+" />
                <Stat label="Projetos implantados" value="200+" />
              </div>
            </div>
            <div className="lg:pl-6">
              <Card className="rounded-3xl shadow-xl">
                <CardHeader>
                  <div className="text-lg font-semibold">Configuração rápida de um enlace</div>
                  <div className="text-xs text-neutral-500">Potência recebida vs. distância</div>
                </CardHeader>
                <CardContent>
                  <LinkBudgetCalc />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <Section id="produtos" title="Produtos para Broadcast & Telecom" subtitle="Painéis direcionais, antenas FM, filtros, combiners e linhas de transmissão.">
        <ProductsGrid />
      </Section>

      <Section id="calculadoras" title="Calculadoras de Engenharia" subtitle="Ferramentas práticas para especificação e pré‑projeto de sistemas irradiantes e enlaces.">
        <CalculatorsHub />
      </Section>

      <Section id="galeria" title="Galeria offline" subtitle="Use as imagens fornecidas (copie para /public/assets) ou visualize os placeholders.">
        <Gallery />
      </Section>

      <Section id="contato" title="Fale com engenharia" subtitle="Solicite orçamento, estudos de cobertura, otimização de sistemas e serviços de campo.">
        <Card className="max-w-3xl">
          <CardContent className="p-6 grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input placeholder="Seu nome" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="empresa@dominio.com" />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Mensagem</Label>
              <Input placeholder="Conte-nos sobre seu projeto (banda, potência, ganho, altura, região...)" />
            </div>
            <div className="sm:col-span-2 text-right">
              <Button>Enviar</Button>
            </div>
          </CardContent>
        </Card>
      </Section>

      <footer className="border-t">
        <div className="max-w-7xl mx-auto px-4 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-blue-600/15 grid place-items-center font-bold">EF</div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">© {new Date().getFullYear()} EFTX — Engenharia & Antenas</div>
          </div>
          <div className="text-sm text-neutral-600 dark:text-neutral-400">Single‑file • React + TypeScript • Offline‑ready</div>
        </div>
      </footer>
    </div>
  );
}
