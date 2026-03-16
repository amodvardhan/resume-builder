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
      <div className="flex flex-wrap gap-2">
        {SENTIMENTS.map((s) => {
          const isActive = s.value === value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange(s.value)}
              className={`
                rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-150
                ${isActive
                  ? "border-brand bg-brand-subtle text-brand"
                  : "border-border-muted bg-surface text-secondary hover:border-border-hover hover:text-primary"
                }
              `}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-secondary italic">
        {activeHint}
      </p>
    </div>
  );
}
