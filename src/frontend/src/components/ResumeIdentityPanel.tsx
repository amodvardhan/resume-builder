import type { ResumeContactInfo } from "../types/api";

type Variant = "modern" | "strip";

interface ResumeIdentityPanelProps {
  contact: ResumeContactInfo | null | undefined;
  variant: Variant;
}

/**
 * Name + LinkedIn, country, phone, email — mirrors PDF/DOCX export order.
 */
export default function ResumeIdentityPanel({
  contact,
  variant,
}: ResumeIdentityPanelProps) {
  if (!contact) return null;
  const { full_name, linkedin_url, country, phone, email } = contact;
  if (!full_name?.trim() && !linkedin_url?.trim() && !country?.trim() && !phone?.trim() && !email?.trim()) {
    return null;
  }

  const isModern = variant === "modern";
  const labelCls = isModern
    ? "block text-[0.5rem] font-bold uppercase tracking-wider text-secondary/70"
    : "block text-[0.5625rem] font-semibold uppercase tracking-wider text-secondary/75";
  const lineCls = isModern
    ? "text-[0.72rem] leading-snug text-primary/90 break-words"
    : "text-[0.8125rem] leading-snug text-primary/90 break-words";

  const wrapCls = isModern
    ? "border-b border-[rgba(51,107,135,0.2)] pb-3 mb-1 space-y-1.5 text-center"
    : "border-b border-border-muted pb-4 mb-4 space-y-1.5 text-left";

  return (
    <div className={wrapCls}>
      {full_name?.trim() ? (
        <div
          className={
            isModern
              ? "text-sm font-bold leading-tight text-[#336b87]"
              : "text-base font-bold leading-tight text-primary"
          }
        >
          {full_name.trim()}
        </div>
      ) : null}
      {linkedin_url?.trim() ? (
        <div>
          <span className={labelCls}>LinkedIn</span>
          <div className={lineCls}>
            {linkedin_url.startsWith("http") ? (
              <a
                href={linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                {linkedin_url}
              </a>
            ) : (
              linkedin_url
            )}
          </div>
        </div>
      ) : null}
      {country?.trim() ? (
        <div>
          <span className={labelCls}>Country</span>
          <div className={lineCls}>{country.trim()}</div>
        </div>
      ) : null}
      {phone?.trim() ? (
        <div>
          <span className={labelCls}>Phone</span>
          <div className={lineCls}>{phone.trim()}</div>
        </div>
      ) : null}
      {email?.trim() ? (
        <div>
          <span className={labelCls}>Email</span>
          <div className={lineCls}>
            <a href={`mailto:${email.trim()}`} className="text-brand hover:underline">
              {email.trim()}
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
