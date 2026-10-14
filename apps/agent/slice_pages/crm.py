"""CRM connections for Pages audiences (HubSpot, Salesforce), through Composio.

Composio holds the OAuth. A brand connects its CRM from the Audiences sheet
through Composio's hosted connect link, with Composio's own HubSpot and
Salesforce apps, so Slice needs no developer app or keys of its own per CRM.
Every CRM call then goes through `proxy_execute` on the brand's session:
Slice never sees a token. Each brand is its own Composio user
(`pages-brand:<brandId>`), so one brand's CRM is never another's.

What the CRM data is used for:
- import: a HubSpot list or a Salesforce campaign becomes rows shaped like a
  customer CSV, and the upload pipeline takes over from there (Qloo reads each
  person, kept one by one or clustered; see pagesUploads.ts). The upload keeps
  `source: {crm, listId}` and each row its `crm_id`.
- the builder's `crm_record` tool: the live record of the one contact a
  personal page is for (stage, company, open deals).
- write-back: a published personal page's link goes back on the contact
  (HubSpot: the `slice_page_url` property; Salesforce: a completed Task).

The Composio SDK is synchronous; every call runs in a worker thread.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import os
import re
from pathlib import Path
from typing import Any

from slice_agent import convex_client as convex

CRMS = {"hubspot": "HubSpot", "salesforce": "Salesforce"}
SF = "/services/data/v60.0"
# Enough for clusters; a list kept one by one is capped lower by the upload (MAX_LIST_PEOPLE).
MAX_CONTACTS = 500
ALL = "all"

_ID = re.compile(r"^[A-Za-z0-9]{1,40}$")


class CrmError(Exception):
    pass


_composio: Any = None
_composio_key = ""
_sessions: dict[str, Any] = {}
_ENV = Path(__file__).resolve().parents[1] / ".env"


def _key() -> str:
    """The key in .env wins over the process env, so a new key works without restarting the server."""
    from dotenv import dotenv_values

    try:
        from_file = (dotenv_values(_ENV).get("COMPOSIO_API_KEY") or "").strip()
    except OSError:
        from_file = ""
    return from_file or os.environ.get("COMPOSIO_API_KEY", "").strip()


def _client() -> Any:
    global _composio, _composio_key
    key = _key()
    if not key:
        raise CrmError("Set COMPOSIO_API_KEY in apps/agent/.env to connect a CRM.")
    if _composio is None or key != _composio_key:
        from composio import Composio

        _composio, _composio_key = Composio(api_key=key), key
        _sessions.clear()  # sessions belong to the old key's project
    return _composio


def explain(err: Exception) -> str:
    """Composio and CRM failures in a sentence the merchant can act on."""
    text = str(err)
    if "APIKey_InsufficientPermissions" in text or "PermissionDenied" in type(err).__name__:
        return "The Composio API key is read-only. Create a key with Write All ticked and put it in apps/agent/.env as COMPOSIO_API_KEY."
    if isinstance(err, CrmError):
        return text
    return f"{type(err).__name__}: {text[:300]}"


def user_id(brand_id: str) -> str:
    return f"pages-brand:{brand_id}"


def _session(brand_id: str, fresh: bool = False) -> Any:
    if fresh or brand_id not in _sessions:
        # manage_connections=False: connecting happens in the console, never mid-chat.
        _sessions[brand_id] = _client().create(user_id=user_id(brand_id), toolkits=list(CRMS), manage_connections=False)
    return _sessions[brand_id]


def _with_session(brand_id: str, fn: Any) -> Any:
    try:
        return fn(_session(brand_id))
    except CrmError:
        raise
    except Exception:
        # Sessions expire; one retry on a new one before giving up.
        return fn(_session(brand_id, fresh=True))


def _check(crm: str) -> str:
    if crm not in CRMS:
        raise CrmError(f"Unknown CRM {crm!r}; expected one of {', '.join(CRMS)}")
    return crm


def _safe_id(value: str) -> str:
    if not _ID.match(value or ""):
        raise CrmError(f"Not a CRM record id: {value!r}")
    return value


# --- Connections ---------------------------------------------------------------


async def status(brand_id: str) -> dict[str, dict[str, Any]]:
    """Which CRMs this brand has connected."""

    def run(s: Any) -> dict[str, dict[str, Any]]:
        out: dict[str, dict[str, Any]] = {crm: {"connected": False} for crm in CRMS}
        for item in s.toolkits(toolkits=list(CRMS)).items:
            conn = item.connection
            if item.slug in out and conn:
                out[item.slug] = {
                    "connected": bool(conn.is_active),
                    "accountId": conn.connected_account.id if conn.connected_account else None,
                    "status": conn.connected_account.status if conn.connected_account else None,
                }
        return out

    return await asyncio.to_thread(_with_session, brand_id, run)


async def connect(brand_id: str, crm: str, callback_url: str | None = None) -> dict[str, str]:
    """Start the OAuth flow: the console opens `url`, Composio redirects to `callback_url` when done."""
    _check(crm)
    req = await asyncio.to_thread(_with_session, brand_id, lambda s: s.authorize(crm, callback_url=callback_url))
    return {"url": req.redirect_url, "id": req.id}


# --- Raw calls ------------------------------------------------------------------


def _call(brand_id: str, crm: str, endpoint: str, method: str = "GET", body: Any = None, query: dict[str, Any] | None = None) -> Any:
    params = [{"name": k, "value": str(v), "in": "query"} for k, v in (query or {}).items() if v is not None]
    res = _with_session(
        brand_id,
        lambda s: s.proxy_execute(toolkit=crm, endpoint=endpoint, method=method, body=body, parameters=params or None),
    )
    code = int(res.get("status") or 0)
    data = res.get("data")
    if code >= 400:
        raise CrmError(f"{CRMS[crm]} answered {code} on {method} {endpoint}: {str(data)[:300]}")
    return data or {}


async def _acall(brand_id: str, crm: str, endpoint: str, method: str = "GET", body: Any = None, query: dict[str, Any] | None = None) -> Any:
    return await asyncio.to_thread(_call, brand_id, crm, endpoint, method, body, query)


def _age(birthdate: str | None) -> str:
    """'1994-03-07' → '32'; the upload buckets it."""
    if not birthdate:
        return ""
    try:
        born = dt.date.fromisoformat(str(birthdate)[:10])
    except ValueError:
        return ""
    today = dt.date.today()
    return str(today.year - born.year - ((today.month, today.day) < (born.month, born.day)))


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\r", " ").strip()


# --- HubSpot --------------------------------------------------------------------

HS_STANDARD = [
    "firstname", "lastname", "email", "city", "state", "country", "date_of_birth",
    "company", "jobtitle", "lifecyclestage", "hs_lead_status",
]


async def _hs_custom_props(brand_id: str) -> list[dict[str, str]]:
    """The portal's own contact properties: where merchants keep things like favourite artists."""
    data = await _acall(brand_id, "hubspot", "/crm/v3/properties/contacts")
    out = []
    for p in data.get("results") or []:
        if p.get("hubspotDefined") or p.get("hidden") or p.get("type") not in ("string", "enumeration"):
            continue
        if p.get("name") == "slice_page_url":
            continue
        out.append({"name": p["name"], "label": p.get("label") or p["name"]})
    return out[:30]


def _hs_row(rec: dict[str, Any], custom: list[dict[str, str]]) -> dict[str, str]:
    p = rec.get("properties") or {}
    row = {
        "crm_id": _text(rec.get("id")),
        "name": " ".join(x for x in (_text(p.get("firstname")), _text(p.get("lastname"))) if x) or _text(p.get("email")),
        "email": _text(p.get("email")),
        "city": _text(p.get("city")),
        "country": _text(p.get("country")),
        "age": _age(p.get("date_of_birth")),
        "company": _text(p.get("company")),
        "job_title": _text(p.get("jobtitle")),
        "stage": _text(p.get("lifecyclestage")),
    }
    for c in custom:
        row[c["label"]] = _text(p.get(c["name"])).replace(";", "; ")
    return row


async def _hs_lists(brand_id: str) -> list[dict[str, Any]]:
    data = await _acall(
        brand_id, "hubspot", "/crm/v3/lists/search", "POST",
        {"query": "", "count": 100, "offset": 0, "additionalProperties": ["hs_list_size"]},
    )
    out = []
    for lst in data.get("lists") or []:
        if lst.get("objectTypeId") not in (None, "0-1"):  # contact lists only
            continue
        size = (lst.get("additionalProperties") or {}).get("hs_list_size")
        out.append({"id": str(lst.get("listId")), "name": lst.get("name") or "Untitled list", "size": int(size) if str(size or "").isdigit() else None})
    return out


async def _hs_contacts(brand_id: str, list_id: str, limit: int) -> list[dict[str, str]]:
    custom = await _hs_custom_props(brand_id)
    props = HS_STANDARD + [c["name"] for c in custom]
    records: list[dict[str, Any]] = []
    if list_id == ALL:
        after: str | None = None
        while len(records) < limit:
            data = await _acall(brand_id, "hubspot", "/crm/v3/objects/contacts", query={"limit": 100, "properties": ",".join(props), "after": after})
            records += data.get("results") or []
            after = ((data.get("paging") or {}).get("next") or {}).get("after")
            if not after:
                break
    else:
        ids: list[str] = []
        after = None
        while len(ids) < limit:
            data = await _acall(brand_id, "hubspot", f"/crm/v3/lists/{_safe_id(list_id)}/memberships", query={"limit": 250, "after": after})
            for r in data.get("results") or []:
                ids.append(str(r.get("recordId") if isinstance(r, dict) else r))
            after = ((data.get("paging") or {}).get("next") or {}).get("after")
            if not after:
                break
        ids = ids[:limit]
        for i in range(0, len(ids), 100):
            data = await _acall(
                brand_id, "hubspot", "/crm/v3/objects/contacts/batch/read", "POST",
                {"properties": props, "inputs": [{"id": x} for x in ids[i : i + 100]]},
            )
            records += data.get("results") or []
    return [_hs_row(r, custom) for r in records[:limit]]


async def _hs_record(brand_id: str, contact_id: str) -> dict[str, Any]:
    cid = _safe_id(contact_id)
    custom = await _hs_custom_props(brand_id)
    data = await _acall(
        brand_id, "hubspot", f"/crm/v3/objects/contacts/{cid}",
        query={"properties": ",".join(HS_STANDARD + ["hs_analytics_source", "num_associated_deals", "notes_last_contacted"] + [c["name"] for c in custom]), "associations": "deals"},
    )
    labels = {c["name"]: c["label"] for c in custom}
    fields = {labels.get(k, k): v for k, v in (data.get("properties") or {}).items() if v not in (None, "") and k not in ("hs_object_id", "createdate", "lastmodifieddate")}
    deal_ids = [str(d.get("id")) for d in (((data.get("associations") or {}).get("deals") or {}).get("results") or [])][:10]
    deals = []
    if deal_ids:
        got = await _acall(
            brand_id, "hubspot", "/crm/v3/objects/deals/batch/read", "POST",
            {"properties": ["dealname", "dealstage", "amount", "closedate"], "inputs": [{"id": d} for d in deal_ids]},
        )
        deals = [{k: v for k, v in (d.get("properties") or {}).items() if k in ("dealname", "dealstage", "amount", "closedate") and v} for d in got.get("results") or []]
    return {"crm": "hubspot", "id": cid, "fields": fields, "deals": deals}


async def _hs_push_link(brand_id: str, contact_id: str, url: str, title: str) -> str:
    cid = _safe_id(contact_id)
    try:
        await _acall(
            brand_id, "hubspot", "/crm/v3/properties/contacts", "POST",
            {"name": "slice_page_url", "label": "Slice page", "type": "string", "fieldType": "text", "groupName": "contactinformation", "description": "The personal landing page Slice built for this contact."},
        )
    except CrmError as err:
        if " 409 " not in str(err):  # 409: the property is already there
            raise
    await _acall(brand_id, "hubspot", f"/crm/v3/objects/contacts/{cid}", "PATCH", {"properties": {"slice_page_url": url}})
    return f"Set Slice page on the HubSpot contact to {url}"


# --- Salesforce -----------------------------------------------------------------

SF_STANDARD = [
    "Id", "FirstName", "LastName", "Email", "MailingCity", "MailingCountry", "Birthdate",
    "Title", "LeadSource", "Account.Name",
]


async def _sf_query(brand_id: str, soql: str, limit: int) -> list[dict[str, Any]]:
    data = await _acall(brand_id, "salesforce", f"{SF}/query", query={"q": soql})
    records = list(data.get("records") or [])
    while not data.get("done", True) and data.get("nextRecordsUrl") and len(records) < limit:
        data = await _acall(brand_id, "salesforce", data["nextRecordsUrl"])
        records += data.get("records") or []
    return records[:limit]


async def _sf_custom_fields(brand_id: str) -> list[dict[str, str]]:
    data = await _acall(brand_id, "salesforce", f"{SF}/sobjects/Contact/describe")
    return [
        {"name": f["name"], "label": f.get("label") or f["name"]}
        for f in data.get("fields") or []
        if f.get("custom") and f.get("type") in ("string", "picklist", "multipicklist", "textarea")
    ][:30]


def _sf_row(rec: dict[str, Any], custom: list[dict[str, str]]) -> dict[str, str]:
    row = {
        "crm_id": _text(rec.get("Id")),
        "name": " ".join(x for x in (_text(rec.get("FirstName")), _text(rec.get("LastName"))) if x) or _text(rec.get("Email")),
        "email": _text(rec.get("Email")),
        "city": _text(rec.get("MailingCity")),
        "country": _text(rec.get("MailingCountry")),
        "age": _age(rec.get("Birthdate")),
        "company": _text((rec.get("Account") or {}).get("Name")),
        "job_title": _text(rec.get("Title")),
        "lead_source": _text(rec.get("LeadSource")),
    }
    for c in custom:
        row[c["label"]] = _text(rec.get(c["name"]))
    return row


async def _sf_lists(brand_id: str) -> list[dict[str, Any]]:
    records = await _sf_query(brand_id, "SELECT Id, Name, NumberOfContacts FROM Campaign ORDER BY LastModifiedDate DESC LIMIT 100", 100)
    return [{"id": r["Id"], "name": r.get("Name") or "Untitled campaign", "size": r.get("NumberOfContacts")} for r in records]


async def _sf_contacts(brand_id: str, list_id: str, limit: int) -> list[dict[str, str]]:
    custom = await _sf_custom_fields(brand_id)
    fields = ", ".join(SF_STANDARD + [c["name"] for c in custom])
    where = "" if list_id == ALL else f" WHERE Id IN (SELECT ContactId FROM CampaignMember WHERE CampaignId = '{_safe_id(list_id)}')"
    records = await _sf_query(brand_id, f"SELECT {fields} FROM Contact{where} ORDER BY LastModifiedDate DESC LIMIT {int(limit)}", limit)
    return [_sf_row(r, custom) for r in records]


async def _sf_record(brand_id: str, contact_id: str) -> dict[str, Any]:
    cid = _safe_id(contact_id)
    data = await _acall(brand_id, "salesforce", f"{SF}/sobjects/Contact/{cid}")
    skip = {"attributes", "Id", "OwnerId", "CreatedById", "LastModifiedById", "MasterRecordId", "PhotoUrl", "IsDeleted", "SystemModstamp", "CreatedDate", "LastModifiedDate"}
    fields = {k: v for k, v in data.items() if k not in skip and v not in (None, "", False)}
    opps = await _sf_query(
        brand_id,
        f"SELECT Opportunity.Name, Opportunity.StageName, Opportunity.Amount, Opportunity.CloseDate FROM OpportunityContactRole WHERE ContactId = '{cid}' LIMIT 10",
        10,
    )
    deals = [
        {k: v for k, v in (o.get("Opportunity") or {}).items() if k != "attributes" and v is not None}
        for o in opps
    ]
    return {"crm": "salesforce", "id": cid, "fields": fields, "deals": deals}


async def _sf_push_link(brand_id: str, contact_id: str, url: str, title: str) -> str:
    cid = _safe_id(contact_id)
    await _acall(
        brand_id, "salesforce", f"{SF}/sobjects/Task", "POST",
        {"WhoId": cid, "Subject": f"Slice page: {title}"[:255], "Description": url, "Status": "Completed", "ActivityDate": dt.date.today().isoformat()},
    )
    return f"Logged a Salesforce task with the link {url}"


# --- Public ---------------------------------------------------------------------


async def lead_contact(audience: dict[str, Any]) -> dict[str, str] | None:
    """For a one-person audience imported from a CRM: {brandId, crm, contactId}. Else None."""
    sources = audience.get("sources") or {}
    if audience.get("kind") != "lead" or not sources.get("memberId") or not sources.get("uploadId"):
        return None
    upload = await convex.query("pagesUploads:get", {"id": sources["uploadId"]})
    crm = ((upload or {}).get("source") or {}).get("crm")
    if crm not in CRMS:
        return None
    member = await convex.query("pagesUploads:member", {"id": sources["memberId"]})
    contact_id = ((member or {}).get("row") or {}).get("crm_id")
    if not contact_id:
        return None
    return {"brandId": audience["brandId"], "crm": crm, "contactId": contact_id}


async def lists(brand_id: str, crm: str) -> list[dict[str, Any]]:
    """The lists an import can start from, with "All contacts" first."""
    found = await (_hs_lists if _check(crm) == "hubspot" else _sf_lists)(brand_id)
    return [{"id": ALL, "name": "All contacts", "size": None}, *found]


async def contacts(brand_id: str, crm: str, list_id: str = ALL, limit: int = MAX_CONTACTS) -> dict[str, Any]:
    """A list's contacts as CSV-shaped rows (strings only), plus the column order."""
    limit = max(1, min(int(limit), MAX_CONTACTS))
    rows = await (_hs_contacts if _check(crm) == "hubspot" else _sf_contacts)(brand_id, list_id or ALL, limit)
    columns: list[str] = []
    for r in rows:
        for k in r:
            if k not in columns:
                columns.append(k)
    # Columns nobody filled in only clutter the mapping.
    columns = [c for c in columns if c == "crm_id" or any(r.get(c) for r in rows)]
    return {"columns": columns, "rows": [{c: r.get(c, "") for c in columns} for r in rows]}


async def record(brand_id: str, crm: str, contact_id: str) -> dict[str, Any]:
    """One contact's live record: its fields and its open deals or opportunities."""
    return await (_hs_record if _check(crm) == "hubspot" else _sf_record)(brand_id, contact_id)


async def push_link(brand_id: str, crm: str, contact_id: str, url: str, title: str) -> str:
    """Put a personal page's link on the contact, for the merchant's emails and sequences."""
    return await (_hs_push_link if _check(crm) == "hubspot" else _sf_push_link)(brand_id, contact_id, url, title)
