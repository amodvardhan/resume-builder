import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../api/client";
import {
  useAdminCrawlSourcesList,
  useAdminCrawlSourceMutations,
} from "../hooks/useAdminCrawlSources";
import type { CrawlSource } from "../types/api";

function parseJsonObject(raw: string, label: string): Record<string, string> {
  const t = raw.trim();
  if (!t) return {};
  try {
    const v = JSON.parse(t) as unknown;
    if (v === null || typeof v !== "object" || Array.isArray(v)) {
      throw new Error(`${label} must be a JSON object`);
    }
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = String(val);
    }
    return out;
  } catch (e) {
    throw new Error(
      e instanceof Error ? e.message : `Invalid JSON for ${label}`,
    );
  }
}

export default function AdminCrawlSourcesPage() {
  const { data: sources, isLoading, error } = useAdminCrawlSourcesList();
  const { create, patch, remove } = useAdminCrawlSourceMutations();
  const { data: catalog = {} } = useQuery({
    queryKey: ["preferences", "catalog"],
    queryFn: async () => {
      const { data } = await api.get<Record<string, string[]>>(
        "/api/v1/preferences/catalog",
      );
      return data;
    },
  });
  const industryOptions = useMemo(() => Object.keys(catalog), [catalog]);

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<CrawlSource | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [sourceKey, setSourceKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sourceType, setSourceType] = useState<"api" | "html_scraper" | "rss">(
    "html_scraper",
  );
  const [urlTemplate, setUrlTemplate] = useState("");
  const [rateLimit, setRateLimit] = useState("2");
  const [headersJson, setHeadersJson] = useState("{}");
  const [selectorsJson, setSelectorsJson] = useState("{}");
  const [sortOrder, setSortOrder] = useState("0");
  const [enabled, setEnabled] = useState(true);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);

  const openCreate = () => {
    setModal("create");
    setEditing(null);
    setFormError(null);
    setSourceKey("");
    setDisplayName("");
    setSourceType("html_scraper");
    setUrlTemplate("");
    setRateLimit("2");
    setHeadersJson("{}");
    setSelectorsJson("{}");
    setSortOrder("0");
    setEnabled(true);
    setSelectedIndustries([]);
  };

  const openEdit = (s: CrawlSource) => {
    setModal("edit");
    setEditing(s);
    setFormError(null);
    setSourceKey(s.source_key);
    setDisplayName(s.display_name);
    setSourceType(s.source_type);
    setUrlTemplate(s.url_template);
    setRateLimit(String(s.rate_limit_seconds));
    setHeadersJson(JSON.stringify(s.headers ?? {}, null, 2));
    setSelectorsJson(JSON.stringify(s.selectors ?? {}, null, 2));
    setSortOrder(String(s.sort_order));
    setEnabled(s.enabled);
    setSelectedIndustries([...(s.industries ?? [])]);
  };

  const toggleIndustry = (name: string) => {
    setSelectedIndustries((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    );
  };

  const submit = useCallback(async () => {
    setFormError(null);
    let headers: Record<string, string>;
    let selectors: Record<string, string>;
    try {
      headers = parseJsonObject(headersJson, "Headers");
      selectors = parseJsonObject(selectorsJson, "Selectors");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Invalid JSON");
      return;
    }
    const rl = parseFloat(rateLimit);
    if (Number.isNaN(rl) || rl < 0.5) {
      setFormError("Rate limit must be ≥ 0.5");
      return;
    }
    const so = parseInt(sortOrder, 10);
    if (Number.isNaN(so)) {
      setFormError("Sort order must be an integer");
      return;
    }
    const industries =
      selectedIndustries.length === 0 ? [] : [...selectedIndustries];

    try {
      if (modal === "create") {
        if (!sourceKey.trim() || !displayName.trim() || !urlTemplate.trim()) {
          setFormError("source_key, display name, and URL template are required");
          return;
        }
        await create.mutateAsync({
          source_key: sourceKey.trim(),
          display_name: displayName.trim(),
          source_type: sourceType,
          url_template: urlTemplate.trim(),
          headers,
          selectors,
          rate_limit_seconds: rl,
          industries,
          enabled,
          sort_order: so,
        });
      } else if (modal === "edit" && editing) {
        await patch.mutateAsync({
          id: editing.id,
          payload: {
            display_name: displayName.trim(),
            source_type: sourceType,
            url_template: urlTemplate.trim(),
            headers,
            selectors,
            rate_limit_seconds: rl,
            industries,
            enabled,
            sort_order: so,
          },
        });
      }
      setModal(null);
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === "object" &&
        "response" in err &&
        err.response &&
        typeof err.response === "object" &&
        "data" in err.response &&
        err.response.data &&
        typeof err.response.data === "object" &&
        "detail" in err.response.data
          ? String((err.response.data as { detail: unknown }).detail)
          : "Request failed";
      setFormError(msg);
    }
  }, [
    modal,
    editing,
    sourceKey,
    displayName,
    sourceType,
    urlTemplate,
    headersJson,
    selectorsJson,
    rateLimit,
    sortOrder,
    enabled,
    selectedIndustries,
    create,
    patch,
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">
            Crawl sources
          </h1>
          <p className="mt-1 text-sm text-secondary">
            Configure job boards and feeds the crawler uses. Empty industry
            scope = all industries. Placeholders:{" "}
            <code className="rounded bg-muted px-1">{"{role}"}</code>,{" "}
            <code className="rounded bg-muted px-1">{"{location}"}</code>,{" "}
            <code className="rounded bg-muted px-1">{"{keywords}"}</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        >
          Add source
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger-light/30 px-4 py-3 text-sm text-danger">
          {(error as Error).message || "Failed to load sources"}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-border-light bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border-light bg-muted/40 text-xs font-medium uppercase tracking-wide text-secondary">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Industries</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">On</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-secondary">
                  Loading…
                </td>
              </tr>
            ) : !sources?.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-secondary">
                  No sources. Add one or wait for server seed.
                </td>
              </tr>
            ) : (
              sources.map((s) => (
                <tr key={s.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium text-primary">
                    {s.display_name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-secondary">
                    {s.source_key}
                  </td>
                  <td className="px-4 py-3 text-secondary">{s.source_type}</td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-secondary">
                    {s.industries?.length
                      ? s.industries.join(", ")
                      : "All industries"}
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {s.rate_limit_seconds}s
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        s.enabled
                          ? "rounded-full bg-success/15 px-2 py-0.5 text-xs text-success"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs text-secondary"
                      }
                    >
                      {s.enabled ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      className="mr-2 text-brand hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete crawl source "${s.display_name}"? This cannot be undone.`,
                          )
                        )
                          remove.mutate(s.id);
                      }}
                      className="text-danger hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border-light bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-primary">
              {modal === "create" ? "Add crawl source" : "Edit crawl source"}
            </h2>
            {formError && (
              <p className="mt-2 text-sm text-danger">{formError}</p>
            )}
            <div className="mt-4 flex flex-col gap-3">
              {modal === "create" && (
                <label className="block">
                  <span className="text-xs font-medium text-secondary">
                    Source key (slug)
                  </span>
                  <input
                    value={sourceKey}
                    onChange={(e) => setSourceKey(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border-light bg-background px-3 py-2 text-sm"
                    placeholder="e.g. my_board"
                  />
                </label>
              )}
              <label className="block">
                <span className="text-xs font-medium text-secondary">
                  Display name
                </span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border-light bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-secondary">Type</span>
                <select
                  value={sourceType}
                  onChange={(e) =>
                    setSourceType(e.target.value as typeof sourceType)
                  }
                  className="mt-1 w-full rounded-lg border border-border-light bg-background px-3 py-2 text-sm"
                >
                  <option value="html_scraper">HTML scraper</option>
                  <option value="api">API (JSON)</option>
                  <option value="rss">RSS</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-secondary">
                  URL template
                </span>
                <textarea
                  value={urlTemplate}
                  onChange={(e) => setUrlTemplate(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-border-light bg-background px-3 py-2 font-mono text-xs"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-secondary">
                    Rate limit (s)
                  </span>
                  <input
                    value={rateLimit}
                    onChange={(e) => setRateLimit(e.target.value)}
                    type="number"
                    step="0.5"
                    min="0.5"
                    className="mt-1 w-full rounded-lg border border-border-light bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-secondary">
                    Sort order
                  </span>
                  <input
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    type="number"
                    className="mt-1 w-full rounded-lg border border-border-light bg-background px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-secondary">
                  Headers (JSON)
                </span>
                <textarea
                  value={headersJson}
                  onChange={(e) => setHeadersJson(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-border-light bg-background px-3 py-2 font-mono text-xs"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-secondary">
                  Selectors (JSON, html_scraper)
                </span>
                <textarea
                  value={selectorsJson}
                  onChange={(e) => setSelectorsJson(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-border-light bg-background px-3 py-2 font-mono text-xs"
                />
              </label>
              <div>
                <span className="text-xs font-medium text-secondary">
                  Industries (empty = all)
                </span>
                <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border-light p-2">
                  {industryOptions.map((name) => (
                    <label
                      key={name}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIndustries.includes(name)}
                        onChange={() => toggleIndustry(name)}
                      />
                      {name}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                Enabled
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={create.isPending || patch.isPending}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
