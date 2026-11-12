// Tape chart spike: rooms (rows, frozen left) × days (columns, horizontally virtualized), sticky date header,
// absolutely positioned stay bars with per-night colours, day-use split cells, blocks. Not product code.
import { StrictMode, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ROOMS, DAYS, dayIso, TODAY, generate, overlapping } from "./data.js";
import "./style.css";

const T0 = performance.now();
const DAY_W = 112, ROW_H = 36, LEFT_W = 180, HEAD_H = 44;
const WD = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cts"];
const { stays, total } = generate();
const GEN_MS = performance.now() - T0;

function Chart() {
  const ref = useRef(null);
  const cols = useVirtualizer({
    horizontal: true,
    count: DAYS,
    getScrollElement: () => ref.current,
    estimateSize: () => DAY_W,
    overscan: 6,
    paddingStart: LEFT_W,
    initialOffset: Math.max(0, (TODAY - 3) * DAY_W),
  });
  const items = cols.getVirtualItems();
  const d0 = items.length ? items[0].index : 0;
  const d1 = items.length ? items[items.length - 1].index + 1 : 0;

  useEffect(() => {
    window.__scroller = ref.current;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.__perf = { ready: true, firstPaintMs: Math.round(performance.now() - T0), genMs: Math.round(GEN_MS), stays: total };
      }),
    );
  }, []);

  const bars = useMemo(() => {
    const out = [];
    for (let room = 0; room < ROOMS.length; room++) {
      for (const s of overlapping(stays[room], d0, d1)) out.push([room, s]);
    }
    return out;
  }, [d0, d1]);

  return (
    <div ref={ref} className="scroller" data-testid="scroller">
      <div style={{ width: LEFT_W + DAYS * DAY_W, height: HEAD_H + ROOMS.length * ROW_H, position: "relative" }}>
        {/* sticky date header */}
        <div className="head" style={{ height: HEAD_H, width: LEFT_W + DAYS * DAY_W }}>
          {items.map((c) => {
            const iso = dayIso(c.index);
            const wd = new Date(iso + "T00:00:00Z").getUTCDay();
            return (
              <div key={c.key} className={"hcell" + (wd === 6 ? " sat" : "") + (c.index === TODAY ? " today" : "")} style={{ left: c.start, width: DAY_W }}>
                <b>{iso.slice(8, 10)}.{iso.slice(5, 7)}.{iso.slice(0, 4)}</b> <span>{WD[wd]}</span>
              </div>
            );
          })}
          <div className="corner" style={{ width: LEFT_W, height: HEAD_H }}>ODA · TİP</div>
        </div>
        {/* day background columns (only visible) */}
        {items.map((c) => (
          <div key={"bg" + c.key} className={"col" + (c.index < TODAY ? " past" : "") + (c.index === TODAY ? " todaycol" : "")} style={{ left: c.start, top: HEAD_H, width: DAY_W, height: ROOMS.length * ROW_H }} />
        ))}
        {/* stay bars */}
        {bars.map(([room, s]) => {
          const top = HEAD_H + room * ROW_H + 3;
          const left = LEFT_W + s.start * DAY_W;
          if (s.kind === "block") return <div key={room + ":" + s.start + "b"} className="bar block" style={{ top, left, width: s.nights * DAY_W - 2 }}>SATILMAZ</div>;
          if (s.kind === "dayuse") return <div key={room + ":" + s.start + "d"} className="bar dayuse" style={{ top, left, width: DAY_W / 2 - 2 }} title={`${s.name} (${s.price} TL) — aynı gün`}>{s.name.split(" ")[0]}</div>;
          const segs = [];
          for (let n = 0; n < s.nights; n++) segs.push(<i key={n} className={n < s.paidNights ? "paid" : "unpaid"} style={{ width: DAY_W }} />);
          return (
            <div key={room + ":" + s.start} className="bar stay" style={{ top, left, width: s.nights * DAY_W - 2 }} title={`${s.name} (${s.price} TL)`}>
              <span className="segs">{segs}</span>
              <span className="label">{s.name} ({s.price} TL)</span>
            </div>
          );
        })}
        {/* frozen left columns */}
        <div className="left" style={{ top: HEAD_H, width: LEFT_W }}>
          {ROOMS.map(([no, type]) => (
            <div key={no} className="rcell" style={{ height: ROW_H }}><b>{no}</b><span>{type}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><Chart /></StrictMode>);
