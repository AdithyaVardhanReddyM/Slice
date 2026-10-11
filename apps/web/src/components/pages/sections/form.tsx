"use client";

import { useState, type FormEvent } from "react";
import type { FormField, FormSection } from "@slice/backend/convex/pagesTypes";
import { useTracking } from "../tracking-context";
import { getSessionId, getVisitorId } from "../track-ids";
import type { FormBody } from "../types";
import { Arrow, Eyebrow, Shell } from "./ui";

function Field({ field }: { field: FormField }) {
  const id = `pg-f-${field.name}`;
  const label = (
    <label htmlFor={id}>
      {field.label}
      {field.required ? null : <span>(optional)</span>}
    </label>
  );
  const common = { id, name: field.name, required: field.required, placeholder: field.placeholder, className: "pg-input" };
  return (
    <div className="pg-field" style={field.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
      {label}
      {field.type === "textarea" ? (
        <textarea {...common} rows={4} />
      ) : field.type === "select" ? (
        <select {...common} defaultValue="">
          <option value="" disabled>
            {field.placeholder ?? "Choose one"}
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input {...common} type={field.type} autoComplete={field.type === "email" ? "email" : field.type === "tel" ? "tel" : undefined} />
      )}
    </div>
  );
}

export function Form({ section }: { section: FormSection }) {
  const tracking = useTracking();
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;
    const fd = new FormData(e.currentTarget);
    const fields: Record<string, string> = {};
    fd.forEach((v, k) => {
      if (typeof v === "string") fields[k] = v.slice(0, 2000);
    });
    setState("sending");
    try {
      if (tracking && !tracking.disabled) {
        const body: FormBody = {
          pageId: tracking.pageId,
          variantId: tracking.variantId,
          visitorId: getVisitorId(),
          sessionId: getSessionId(),
          resolvedBy: tracking.resolvedBy,
          path: location.pathname,
          sectionId: section.id,
          fields,
          overrides: tracking.overrides,
        };
        const res = await fetch("/api/pages/form", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`form ${res.status}`);
      } else {
        await new Promise((r) => setTimeout(r, 500));
      }
      setState("done");
    } catch {
      setState("error");
    }
  }

  // Short text fields pair up on one row; long ones take the full width.
  const short = section.fields.filter((f) => f.type !== "textarea");
  const long = section.fields.filter((f) => f.type === "textarea");

  return (
    <Shell section={section}>
      <div className="pg-container">
        <div className="pg-form-grid">
          <div>
            {section.eyebrow ? <Eyebrow>{section.eyebrow}</Eyebrow> : null}
            <h2 className="pg-h2" style={{ marginTop: section.eyebrow ? 14 : 0 }}>
              {section.headline}
            </h2>
            {section.body ? (
              <p className="pg-lead" style={{ marginTop: 20 }}>
                {section.body}
              </p>
            ) : null}
          </div>
          {state === "done" ? (
            <div className="pg-form-success" role="status">
              <span className="pg-check" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <p className="pg-h3" style={{ margin: 0 }}>
                {section.success}
              </p>
            </div>
          ) : (
            <form className="pg-form" onSubmit={onSubmit} noValidate={false} data-form={section.id}>
              <div className="pg-form-row">
                {short.map((f) => (
                  <Field key={f.name} field={f} />
                ))}
              </div>
              {long.map((f) => (
                <Field key={f.name} field={f} />
              ))}
              <div className="pg-form-foot">
                <button type="submit" className="pg-btn" disabled={state === "sending"} data-cta={`form:${section.submitLabel}`}>
                  {state === "sending" ? "Sending" : section.submitLabel}
                  <Arrow />
                </button>
                {state === "error" ? (
                  <span className="pg-form-error">Something went wrong. Please try again.</span>
                ) : (
                  <span className="pg-form-note">We only use this to get back to you.</span>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </Shell>
  );
}
