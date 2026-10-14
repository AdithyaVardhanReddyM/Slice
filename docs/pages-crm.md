# Pages: CRM audiences (HubSpot, Salesforce via Composio)

A brand connects its CRM in the Audiences sheet ("Connect a CRM"). Contacts from a
list come in through the same pipeline as a customer CSV, and personal pages can
read the contact's live record and write their link back to the CRM.

```
Console (new-audience-sheet.tsx: CrmTab)
  │ /api/pages/crm/{status,connect,lists,contacts,push-link}   (Next proxy)
  ▼
Agent (slice_pages/crm.py + routes.py)  ──  Composio session per brand (user "pages-brand:<id>")
  │                                            session.authorize(crm)   → hosted OAuth link (popup → /crm-connected)
  │                                            session.proxy_execute()  → HubSpot / Salesforce REST, no tokens held by Slice
  ▼
Rows shaped like a CSV (crm_id, name, email, city, country, age, company, job_title, stage, custom properties)
  │ pagesUploads.create({ ..., source: { crm, listId, listName } })
  ▼
pagesUploads.process: Qloo per row → one by one (lead audiences, @Name in the builder) or k-means clusters
```

## What the CRM data does

| Where | What |
| --- | --- |
| Import | HubSpot list (or all contacts) / Salesforce campaign (or all contacts) → rows. The portal's custom properties come along; those are where taste lives (favourite artists, brands, interests). The merchant picks the taste properties in the same mapping UI as a CSV. |
| Builder | `crm_record` tool (builder.py): for a page built for one imported contact, the live record (lifecycle stage, company, deals or opportunities). The instruction tells the agent to let stage and deals decide the offer and CTA, taste the look, and never print private fields. |
| Write-back | Publish dialog → "Send to HubSpot / Salesforce": HubSpot sets the `slice_page_url` contact property (created on first use) so emails can merge it; Salesforce logs a completed Task with the link. |

## Setup

`COMPOSIO_API_KEY` in `apps/agent/.env`. Composio's managed HubSpot and Salesforce apps
handle the OAuth, so no CRM developer app is needed. The project key needs **write**
on session management, session tool execution, connected accounts and auth configs.

## Not built

No scheduled re-sync (an import is a snapshot; read the list again to refresh), no
CRM webhooks, Salesforce leads (contacts only), and no brand-owned OAuth apps
(Composio's consent screen shows Composio until custom auth configs are added).
