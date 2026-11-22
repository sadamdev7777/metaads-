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
    <section className={`flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-white p-3.5 sm:gap-2.5 sm:p-5 ${className}`}>
      {(title || right) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="m-0 text-base font-bold sm:text-lg">{title}</h2>}
          {right}
        </div>
      )}
      {sub && <p className="m-0 text-[13px] leading-snug text-muted sm:text-sm">{sub}</p>}
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
      className={`min-h-[36px] sm:min-h-[44px] whitespace-nowrap rounded-lg ${small ? "px-2.5 text-[13px]" : "px-3 text-[13px] sm:px-4 sm:text-sm"} ${BTN[kind]} disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

/** Table that scrolls sideways inside its own box on narrow screens. */
/**
 * A table on wide screens. On a phone each row becomes a small card (first cell as the title, the rest as
 * label and value), so no figure is hidden off to the right.
 */
export function T({ heads, rows, right = [], minW = 640 }: { heads: ReactNode[]; rows: ReactNode[][]; right?: number[]; minW?: number }) {
  const empty = (c: ReactNode) => c === "" || c === null || c === undefined || c === false;
  return (
    <>
      <ul className="m-0 flex list-none flex-col divide-y divide-line p-0 sm:hidden">
        {rows.map((r, ri) => (
          <li key={ri} className="flex flex-col gap-1 px-1 py-2">
            <div className="text-sm">{r[0]}</div>
            <dl className="m-0 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {r.slice(1).map((c, i) =>
                empty(c) ? null : empty(heads[i + 1]) ? (
                  <div key={i} className="basis-full pt-0.5">{c}</div>
                ) : (
                  <div key={i} className="flex min-w-0 items-center gap-1">
                    <dt className="text-[11px] text-muted">{heads[i + 1]}</dt>
                    <dd className="m-0 break-words text-[13px] font-semibold">{c}</dd>
                  </div>
                ),
              )}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
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
    </>
  );
}

/** A line of key figures shown under a row's name on a phone, where the other columns are off-screen. */
export const Mini = ({ children }: { children: ReactNode }) => <div className="mt-1 min-w-[210px] text-[12px] font-normal leading-snug text-muted sm:hidden">{children}</div>;

export function Stat({ label, value, sub, extra }: { label: string; value: ReactNode; sub?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 basis-[calc(50%-0.5rem)] flex-col gap-1 rounded-xl border border-line bg-white p-3 sm:min-w-[180px] sm:basis-0 sm:gap-1.5 sm:p-5">
      <div className="text-[12px] font-semibold text-muted sm:text-[13px]">{label}</div>
      <div className="text-[19px] font-bold leading-tight sm:text-[28px]">{value}</div>
      {sub && <div className="text-[12px] leading-snug text-muted sm:text-[13px]">{sub}</div>}
      {extra}
    </div>
  );
}

const INPUT = "min-h-[40px] sm:min-h-[44px] w-full rounded-lg border border-[#9AA39E] bg-white px-3 text-[15px] text-ink";

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
    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:min-w-[200px] sm:gap-1.5">
      <label htmlFor={id} className="flex min-h-[30px] items-end text-[12px] font-semibold leading-tight sm:min-h-0 sm:text-[13px]">
        {label}
      </label>
      {onChange ? (
        <input id={id} type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={INPUT} />
      ) : (
        <input id={id} type={type} defaultValue={value} placeholder={placeholder} className={INPUT} />
      )}
      {note && <div className="text-[11px] leading-snug text-muted sm:text-xs">{note}</div>}
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

export type AgentKey = "data" | "plan" | "ads" | "ana" | "cre" | "bud" | "sch";
export type AgentState = "work" | "wait" | "idle";

const AV: Record<AgentKey, [string, string]> = {
  data: ["#DCEBFA", "#1B4F8A"],
  plan: ["#D9F0E4", "#17663F"],
  ads: ["#FBE9D7", "#8A4A0B"],
  ana: ["#E7E1F7", "#4B3591"],
  cre: ["#FBEFD5", "#8A5300"],
  bud: ["#DDEFE9", "#0F5C4D"],
  sch: ["#E3ECF9", "#274C8A"],
};

export const AGENT_STATE: Record<AgentState, { dot: string; tone: Tone; label: string }> = {
  work: { dot: "#1E9E5A", tone: "g", label: "Working" },
  wait: { dot: "#D08A00", tone: "a", label: "Waiting for approval" },
  idle: { dot: "#8A938E", tone: "n", label: "Idle" },
};

/** What makes each AI staff member's face their own. Drawn here, not photos of real people. */
const FACE: Record<AgentKey, { skin: string; cover: "hijab" | "hair"; coverColor: string; shirt: string; glasses?: boolean; beard?: boolean }> = {
  data: { skin: "#E9B98F", cover: "hijab", coverColor: "#1B6E8A", shirt: "#12506A", glasses: true },
  ana: { skin: "#C98F62", cover: "hair", coverColor: "#221A16", shirt: "#4B3591", glasses: true, beard: true },
  ads: { skin: "#DDA67A", cover: "hair", coverColor: "#3A2A20", shirt: "#B5651D" },
  plan: { skin: "#F0C4A0", cover: "hijab", coverColor: "#B4567A", shirt: "#7E3355" },
  cre: { skin: "#E3AE84", cover: "hijab", coverColor: "#C28A1B", shirt: "#7A5410" },
  bud: { skin: "#B9794F", cover: "hair", coverColor: "#4A4A4A", shirt: "#0F5C4D", glasses: true },
  sch: { skin: "#EBC09A", cover: "hijab", coverColor: "#2F5FA8", shirt: "#1F3F73" },
};

/** Face of an AI staff member, with a status dot that pulses while working. */
export function Avatar({ who, state, size = 48 }: { who: AgentKey; state: AgentState; size?: number }) {
  const [bg] = AV[who];
  const f = FACE[who];
  const d = Math.max(12, Math.round(size / 4));
  const line = "#2A1D16";
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48" className="block rounded-full">
        <circle cx="24" cy="24" r="24" fill={bg} />
        {/* shoulders */}
        <path d="M6 50c0-10 8-15 18-15s18 5 18 15z" fill={f.shirt} />
        {f.cover === "hijab" ? (
          <>
            {/* scarf wraps the head and drapes over the shoulders */}
            <path d="M24 5c-9.5 0-15 7-15 16 0 8 2 13-1 21h32c-3-8-1-13-1-21 0-9-5.500-16-15-16z" fill={f.coverColor} />
            <ellipse cx="24" cy="22.500" rx="9.200" ry="10.800" fill={f.skin} />
            <path d="M14.500 19c2-6 6-8.500 9.500-8.500s7.500 2.500 9.500 8.500c-3-2.500-6-3.500-9.500-3.500s-6.500 1-9.500 3.500z" fill={f.coverColor} opacity="0.550" />
          </>
        ) : (
          <>
            <rect x="20.500" y="29" width="7" height="8" rx="2.500" fill={f.skin} />
            <ellipse cx="24" cy="21.500" rx="10" ry="11.500" fill={f.skin} />
            <ellipse cx="13.800" cy="22.500" rx="1.600" ry="2.600" fill={f.skin} />
            <ellipse cx="34.200" cy="22.500" rx="1.600" ry="2.600" fill={f.skin} />
            <path d="M13.500 20c-1-8 4-12.500 10.500-12.500s11.500 4.500 10.500 12.500c-1.500-4-3.500-6-6-6.500-3 1.500-9 1.500-11.500 0.500-1.500 1-2.700 3-3.500 6z" fill={f.coverColor} />
            {f.beard && <path d="M14.800 24c0.500 7 4.200 10.500 9.200 10.500s8.700-3.500 9.200-10.500c-1.500 3.500-3 5-5 5.200-1.200-1.200-7.200-1.200-8.400 0-2-0.200-3.500-1.700-5-5.200z" fill={f.coverColor} opacity="0.900" />}
          </>
        )}
        {/* eyes, brows and a small smile */}
        <circle cx="20" cy="22.500" r="1.250" fill={line} />
        <circle cx="28" cy="22.500" r="1.250" fill={line} />
        <path d="M17.800 19.600q2.200-1.300 4.400 0M25.800 19.600q2.200-1.300 4.400 0" stroke={line} strokeWidth="0.900" strokeLinecap="round" fill="none" />
        <path d="M20.500 27.600q3.500 2.800 7 0" stroke={f.beard ? "#F4E3D6" : "#8A3B2E"} strokeWidth="1.200" strokeLinecap="round" fill="none" />
        {f.glasses && (
          <g stroke={line} strokeWidth="0.900" fill="none">
            <rect x="16.300" y="20" width="7" height="5.200" rx="2.200" />
            <rect x="24.700" y="20" width="7" height="5.200" rx="2.200" />
            <path d="M23.300 22h1.400" />
          </g>
        )}
      </svg>
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
        <h1 className="m-0 text-[21px] font-bold leading-tight sm:text-[28px]">{title}</h1>
        {sub && <div className="mt-0.5 text-[13px] leading-snug text-muted sm:mt-1 sm:text-sm">{sub}</div>}
      </div>
      {right}
    </div>
  );
}
