import type { ReactNode } from "react";

export type Tone = "g" | "a" | "r" | "n" | "t";

const TONES: Record<Tone, string> = {
  g: "text-[#17663F] bg-[#E3F2E9]",
  a: "text-[#8A5300] bg-[#FBEFD5]",
  r: "text-[#A3231B] bg-[#FBE6E3]",
  n: "text-[#3F4A45] bg-[#ECEFEC]",
  t: "text-white bg-brand",
};

export function Pill({ tone = "n", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/** Status pill for a cost-per-pax band. */
export function CostStatus({ st }: { st?: Tone | null }) {
  if (!st) return null;
  const label = { g: "Under RM50", a: "RM50–80", r: "Over RM80", n: "Not enough data", t: "" }[st];
  return <Pill tone={st}>{label}</Pill>;
}

export function RunBy({ k }: { k: string }) {
  return <Pill tone={k === "AI" ? "t" : "n"}>{k}</Pill>;
}

export const SampleTag = () => <Pill tone="a">Sample data</Pill>;

export function Card({
  title,
  right,
  sub,
  children,
  className = "",
}: {
  title?: ReactNode;
  right?: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-2.5 rounded-xl border border-line bg-white p-5 ${className}`}>
      {(title || right) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="m-0 text-lg font-bold">{title}</h2>}
          {right}
        </div>
      )}
      {sub && <p className="m-0 text-sm text-muted">{sub}</p>}
      {children}
    </section>
  );
}

const BTN: Record<string, string> = {
  p: "bg-brand text-white font-bold border border-brand",
  s: "bg-white text-ink font-semibold border border-[#9AA39E]",
  d: "bg-ink text-white font-bold border border-ink",
  x: "bg-[#A3231B] text-white font-bold border border-[#A3231B]",
};

export function Btn({
  kind = "p",
  small = false,
  children,
  onClick,
  type = "button",
  disabled = false,
  className = "",
}: {
  kind?: "p" | "s" | "d" | "x";
  small?: boolean;
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[44px] whitespace-nowrap rounded-lg ${small ? "px-2.5 text-[13px]" : "px-4 text-sm"} ${BTN[kind]} disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

/** Table that scrolls sideways inside its own box on narrow screens. */
export function T({ heads, rows, right = [], minW = 640 }: { heads: ReactNode[]; rows: ReactNode[][]; right?: number[]; minW?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: minW }}>
        <thead>
          <tr>
            {heads.map((h, i) => (
              <th
                key={i}
                className={`whitespace-nowrap border-b border-line px-3 py-2.5 text-xs font-semibold text-muted ${right.includes(i) ? "text-right" : "text-left"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, i) => (
                <td key={i} className={`border-b border-line px-3 py-3 align-top text-sm ${right.includes(i) ? "text-right" : "text-left"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value, sub, extra }: { label: string; value: ReactNode; sub?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex min-w-[180px] flex-1 flex-col gap-1.5 rounded-xl border border-line bg-white p-5">
      <div className="text-[13px] font-semibold text-muted">{label}</div>
      <div className="text-[28px] font-bold leading-tight">{value}</div>
      {sub && <div className="text-[13px] text-muted">{sub}</div>}
      {extra}
    </div>
  );
}

const INPUT = "min-h-[44px] w-full rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";

export function Sel({ id, label, options }: { id: string; label: string; options: string[] }) {
  return (
    <div className="flex min-w-[170px] flex-1 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      <select id={id} className={INPUT}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

export function Field({
  id,
  label,
  value,
  note,
  type = "text",
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value?: string;
  note?: string;
  type?: string;
  placeholder?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      {onChange ? (
        <input id={id} type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={INPUT} />
      ) : (
        <input id={id} type={type} defaultValue={value} placeholder={placeholder} className={INPUT} />
      )}
      {note && <div className="text-xs text-muted">{note}</div>}
    </div>
  );
}

export function Seat({ n, of = 40 }: { n: number; of?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div role="img" aria-label={`${n} of ${of} seats filled`} className="h-2 w-20 overflow-hidden rounded-full bg-[#ECEFEC]">
        <div className="h-2 bg-brand" style={{ width: `${Math.round((n * 100) / of)}%` }} />
      </div>
      <span>
        {n}/{of}
      </span>
    </div>
  );
}

export function Bar({ pct, label }: { pct: number; label: string }) {
  return (
    <div role="img" aria-label={label} className="h-3 overflow-hidden rounded-full bg-[#ECEFEC]">
      <div className="h-3 bg-brand" style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export type AgentKey = "data" | "plan" | "ads" | "ana";
export type AgentState = "work" | "wait" | "idle";

const AV: Record<AgentKey, [string, string]> = {
  data: ["#DCEBFA", "#1B4F8A"],
  plan: ["#D9F0E4", "#17663F"],
  ads: ["#FBE9D7", "#8A4A0B"],
  ana: ["#E7E1F7", "#4B3591"],
};

export const AGENT_STATE: Record<AgentState, { dot: string; tone: Tone; label: string }> = {
  work: { dot: "#1E9E5A", tone: "g", label: "Working" },
  wait: { dot: "#D08A00", tone: "a", label: "Waiting for approval" },
  idle: { dot: "#8A938E", tone: "n", label: "Idle" },
};

/** Person avatar for an AI staff member, with a status dot that pulses while working. */
export function Avatar({ who, state, size = 48 }: { who: AgentKey; state: AgentState; size?: number }) {
  const [bg, fg] = AV[who];
  const d = Math.max(12, Math.round(size / 4));
  const icon = Math.round(size * 0.56);
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <div className="flex items-center justify-center rounded-full" style={{ width: size, height: size, background: bg }}>
        <svg aria-hidden="true" width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
      </div>
      <span
        role="img"
        aria-label={AGENT_STATE[state].label}
        className={`absolute bottom-0 right-0 box-border rounded-full border-2 border-white ${state === "work" ? "dot-working" : ""}`}
        style={{ width: d, height: d, background: AGENT_STATE[state].dot }}
      />
    </div>
  );
}

export function Typing() {
  return (
    <span aria-hidden="true" className="typing ml-1.5 inline-flex items-center gap-[3px]">
      <span className="h-[5px] w-[5px] rounded-full bg-[#1E9E5A]" />
      <span className="h-[5px] w-[5px] rounded-full bg-[#1E9E5A]" />
      <span className="h-[5px] w-[5px] rounded-full bg-[#1E9E5A]" />
    </span>
  );
}

export const B = ({ children }: { children: ReactNode }) => <span className="font-semibold">{children}</span>;

export function PageHead({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="m-0 text-[28px] font-bold leading-tight">{title}</h1>
        {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
      </div>
      {right}
    </div>
  );
}
