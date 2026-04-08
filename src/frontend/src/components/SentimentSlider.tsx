const SENTIMENTS = [
  { value: "formal", label: "Formal & Direct", hint: "Polished register suitable for government and intergovernmental organizations" },
  { value: "conversational", label: "Conversational", hint: "Warm yet professional tone that feels personable while staying appropriate" },
  { value: "mission-driven", label: "Mission-Driven & Empathetic", hint: "Shows alignment between your values and the organization's mission" },
] as const;

type SentimentValue = (typeof SENTIMENTS)[number]["value"];

interface SentimentSliderProps {
  value: SentimentValue;
  onChange: (value: SentimentValue) => void;
}

export type { SentimentValue };

export default function SentimentSlider({ value, onChange }: SentimentSliderProps) {
  const activeHint = SENTIMENTS.find((s) => s.value === value)?.hint ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
        <div className="flex w-full flex-col gap-1 rounded-xl border border-border-muted/70 bg-linear-to-b from-surface to-surface-raised p-1 shadow-inner shadow-black/5 sm:inline-flex sm:w-auto sm:flex-row sm:flex-wrap">
        {SENTIMENTS.map((s) => {
          const isActive = s.value === value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange(s.value)}
              className={`
                rounded-lg px-3.5 py-2.5 text-left text-sm font-medium transition-all duration-150
                ${isActive
                  ? "bg-surface text-brand shadow-sm ring-1 ring-black/6"
                  : "text-secondary hover:bg-surface/80 hover:text-primary"
                }
              `}
            >
              {s.label}
            </button>
          );
        })}
        </div>
      </div>
      <p className="text-xs text-secondary italic">
        {activeHint}
      </p>
    </div>
  );
}
