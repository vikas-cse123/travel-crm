# Lead Itinerary — Reference-CRM Analysis

Analysis only. **No application code was modified.** This document compares the
reference CRM's lead-itinerary creation workflow (three training videos) against
the existing Interscale Travel CRM implementation and identifies only genuine
gaps.

**Reference videos inspected** (`references/lead-creation-videos/`):

| File | Duration | Resolution | Topic |
|---|---|---|---|
| `04-single-destination-single-city.mp4` | 222.77 s | 1920×1080 @ 30fps | Single Destination & Single City |
| `05-single-destination-multiple-cities.mp4` | 178.33 s | 1920×1080 @ 30fps | Single Destination & Multiple Cities |
| `06-multiple-destinations-single-city.mp4` | 227.59 s | 1920×1080 @ 30fps | Multiple Destination & Multiple Cities |

Frames extracted every 2 s (scaled ~1440px) to
`references/lead-creation-videos/extracted/<name>/frame-####.jpg`, plus 1 s and
0.5 s detail frames around the itinerary interactions. The clearest reference
frames are `05/frame-0013.jpg` (single destination, multiple cities) and
`06/detail-013.jpg` (multiple destinations, multiple cities).

> **Headline finding:** The lead-itinerary feature is **already fully
> implemented and functionally equivalent to the reference** for all three
> scenarios. It reuses the existing City and Destination masters and the
> `DestinationCity` relationship. **No database change is required.** The only
> findings are two small, self-contained UI issues (dead inline buttons and an
> optional Add/Remove button-styling difference). No parallel itinerary system,
> new master, migration, or new route is warranted.

---

## 1. Current implementation inventory

### Prisma models (`apps/api/prisma/schema.prisma`)

| Item | Location | Fields relevant to itinerary | Classification |
|---|---|---|---|
| `QueryItinerary` | line 2642 | `country VarChar(80)`, `destination VarChar(120)`, `nights Int`, `sequence Int`, `arrivalDate?`, `departureDate?`, `notes?`, `companyId`, `queryId`; `@@unique([queryId, sequence])` | **Already complete** — one row per destination+city+nights, ordered by `sequence`, tenant-scoped |
| `City` | line 1188 | `name`, `countryCode`, `countryName`, `airportCode?`, `status`, `companyId` | **Already complete** master |
| `Destination` | line 1215 | `name`, `countryCode`, `countryName`, `destinationType`, `cities` (via `DestinationCity`), `status`, `companyId` | **Already complete** master |
| `DestinationCity` | line 1259 | `destinationId`, `cityId`, `sequence`; `@@unique([destinationId, cityId])` | **Already complete** — the destination→city relationship the reference relies on |
| `Query` (lead) | line 2274 | `itinerary QueryItinerary[]` relation | **Already complete** |

> **Field-naming note (not a defect):** internally `QueryItinerary.country`
> stores the **Destination-master name** (e.g. "Thailand", "Andaman Island") and
> `QueryItinerary.destination` stores the **City name** (e.g. "Bangkok",
> "Havelock Island"). The UI labels these correctly as *Destination N* / *City
> N*. This is a legacy internal naming quirk, **functionally correct**, and a
> rename is out of scope (risky, no functional benefit).

### Shared validation (`packages/shared/src/queries.ts`)

| Item | Location | Notes | Classification |
|---|---|---|---|
| `itineraryInputSchema` | line 80 | `country 1..80`, `destination 1..120`, `nights int 0..365`, `sequence int 1..100`, optional `arrivalDate`/`departureDate`/`notes`; refine: arrival ≤ departure | **Already complete** |
| `queryInputSchema.itinerary` | line 139 | `z.array(itineraryInputSchema).max(100).default([])` | **Already complete** |
| itinerary sequence-uniqueness + trip-date refinements | lines 156–173 | Enforces unique `sequence` and that dates fit the trip | **Already complete** |
| `queryUpdateSchema` | (same file) | Reuses `itineraryInputSchema` for edit | **Already complete** |

### Backend (`apps/api/src/modules/queries/`)

| Item | Location | Notes | Classification |
|---|---|---|---|
| `queries.service.ts` create | line 832 | `itinerary: { create: input.itinerary.map(row => ({ companyId: auth.companyId, ...row })) }` — tenant-scoped nested create | **Already complete** |
| `queries.service.ts` update | line 900 | Replaces itinerary rows (delete-and-recreate with `companyId`) | **Already complete** |
| `queries.service.ts` present | line 55/61 | Strips `companyId`/`queryId`, orders by `sequence` (include line 48) | **Already complete** |
| `queries.service.ts` search | lines 324, 334 | Filters leads by `itinerary.some.destination contains …` | **Already complete** |
| Activity logging | lines 875 (`QUERY_CREATED`), 928 (`QUERY_UPDATED`) | Fires inside the same transaction | **Already complete** |
| RBAC (`queries.routes.ts`) | `QUERIES_CREATE` (105), `QUERIES_UPDATE` (131/149/…) | `requirePermission` guards | **Already complete** |
| Tenant isolation | every itinerary row carries `companyId`; queries scoped by company | | **Already complete** |

### Frontend (`apps/web/src/`)

| Item | Location | Notes | Classification |
|---|---|---|---|
| Lead create/edit form `LeadForm.tsx` | itinerary block lines 731–822 | Single shared form for create + edit (`lead ? 'Save changes' : 'Create Lead'`, line 825) | **Already complete** |
| Itinerary field-array | `useFieldArray({ name: 'itinerary' })` line 293; `emptyRow()` line 78 | Add/remove rows | **Already complete** |
| Destination select | lines 738–754 | `register('itinerary.N.country')`; options from Destinations master; `aria-label="Destination N"`; on change clears the row's city | **Already complete** |
| City select | lines 763–783 | `register('itinerary.N.destination')`; **disabled until destination chosen**; options from `destinationCityMap.get(country)`; `aria-label="City N"` | **Already complete** |
| Nights input | lines 792–799 | `register('itinerary.N.nights', valueAsNumber)`; `min=0` | **Already complete** |
| Add More button | lines 802–807 | `append(emptyRow(...))` | **Already complete** (renders on every row — see §3) |
| Remove control | lines 808–817 | Trash icon, shown when `fields.length > 1`; `aria-label="Remove itinerary"` | **Already complete** (icon vs reference's red button — see §3) |
| Inline "+ Add" buttons | lines 755–760 and 784–789 | `<button type="button">` with **no `onClick`** — dead/no-op | **Different from reference (defect)** — see §3 |
| Destinations-with-cities API | `masters.api.ts` `useDestinations` (list includes `cities: [{id,name,airportCode,countryCode}]`, line 76/103) | `ITINERARY_DESTINATIONS_PARAMS = pageSize=100&status=ACTIVE` (LeadForm line 26) | **Already complete** |
| `destinationCityMap` | LeadForm lines 328–340 | Maps Destination name → its linked city names, using `destination.cities` | **Already complete** |
| Required-itinerary guard | LeadForm lines 361–386 | Filters rows with both destination+city; blocks submit if none ("At least one destination and city must be selected.") | **Already complete** |

### Tests

| Item | Location | Coverage | Classification |
|---|---|---|---|
| Backend lead create | `apps/api/tests/queries.test.ts` line 72–94 | Creates lead with itinerary `[{country:'Thailand',destination:'Bangkok',nights:3,seq:1},{...'Phuket',nights:4,seq:2}]` (a single-destination/multiple-cities case); asserts order + `companyId`/`queryId` stripped | **Already complete** |
| Frontend itinerary controls | `apps/web/src/pages/queries/LeadsPage.test.tsx` line 172–182 | "supports service selection and itinerary add, remove and reorder controls"; clicks `Remove itinerary` | **Already complete** (would need one small assertion added if §3 UI is polished) |

---

## 2. Reference-video behaviour

Layout (identical across all three videos): a blue **`Itinerary *`** section header
(red asterisk = required). Each itinerary row is a horizontal group:

**`[ Destination N ▾ ]  [ City N ▾ ]  [ Nights ]  [ Add More | Remove ]`**

Above the itinerary sits a services group ("Select at least one service required
for this lead, or check Add-on Service": Cruise / Flight / Hotel / Vehicle
(disposal) / Sightseeing, plus an "Add-on Service (Visa, Passport, etc.)"
checkbox). Below: **Create Lead** / **Cancel**.

1. **Single destination, one city** — one row: Destination = a single value, City
   = one value, Nights, `Add More`. (Video 04.)
2. **Single destination, multiple cities** — multiple rows where **the same
   Destination repeats** and the City differs each row. Confirmed in
   `05/frame-0013.jpg`: Destination 1/2/3 all = "Andaman Island"; City 1 =
   "Havelock Island", City 2 = "Neil Island", City 3 = "Port Blair (IXZ)";
   Nights 2/2/2.
3. **Multiple destinations, one city each** (video 06 also demonstrates multiple
   cities) — rows with **different Destinations**. Confirmed in
   `06/detail-013.jpg`: Destination 1 = "Thailand" / City 1 = "Bangkok (BKK)" /
   3N; Destination 2 = "Malaysia" / City 2 = "Kuala Lumpur (KUL)" / 2N;
   Destination 3 = "Singapore" / City 3 = "Singapore (SIN)" / 4N.
4. **Every visible itinerary field** — Destination (select), City (select),
   Nights (number). No other per-row field is visible (no country field, no
   per-row date/notes shown in the videos).
5. **Destination numbering** — `Destination 1`, `Destination 2`, … per row, top
   to bottom.
6. **City numbering** — `City 1`, `City 2`, … matching the row's destination
   number.
7. **Add More** — a green button that appends a new empty row at the bottom.
   Appears on the **first row**.
8. **Remove** — a red `Remove` button on the **2nd and subsequent rows**; removes
   that row.
9. **Nights** — a numeric field per row (values seen: 2, 3, 4). Right-aligned
   spinner arrows visible.
10. **Nights validation** — *uncertain.* No min/max/error state is demonstrated
    in the videos.
11. **City depends on destination** — strongly implied: each row's City belongs
    to that row's Destination (Bangkok↔Thailand, KL↔Malaysia, SIN↔Singapore;
    Havelock/Neil/Port Blair↔Andaman Island). The native `<select>` option list
    is never captured open, so filtering is inferred from the data, not directly
    observed.
12. **Destinations can repeat** — **confirmed.** Video 05 uses the same
    Destination ("Andaman Island") on all three rows.
13. **Cities can repeat** — *uncertain.* Not demonstrated; no repeated city shown.
14. **Row ordering** — rows are entered/read top-to-bottom; `Add More` appends at
    the end. No drag/reorder control is shown.
15. **Required fields** — Itinerary is marked required (`*`). At least one
    destination+city row is expected. Services group states at least one service
    (or Add-on) is required for the lead.
16. **Create-lead behaviour** — the primary button is **Create Lead**; the shown
    workflow is creating a new lead with its itinerary, then proceeding to a
    quotation.
17. **Edit-lead behaviour** — *uncertain.* The videos only show creation; editing
    an existing lead's itinerary is not demonstrated.
18. **Edge cases** — none explicitly demonstrated (no empty-row submit, no
    zero-nights, no removing the last row).
19. **Behaviour that cannot be confirmed** — nights min/validation (10); whether
    cities may repeat (13); edit-lead flow (17); whether the City list is
    truly server-filtered vs. client-filtered (11); presence/absence of any
    per-row date or notes field (not shown); exact "at least one service"
    enforcement.

---

## 3. Gap analysis

| # | Reference behaviour | Current Interscale behaviour | Status | Change required | Existing code to reuse | Risk | DB change |
|---|---|---|---|---|---|---|---|
| 1 | Repeatable itinerary rows: Destination + City + Nights | Same — `useFieldArray` rows of Destination(`country`)/City(`destination`)/Nights | **Already complete** | None | `LeadForm.tsx` 731–822 | — | No |
| 2 | Destination N / City N numbering | Same (`Destination ${index+1}` / `City ${index+1}`) | **Already complete** | None | `LeadForm.tsx` 738/763 | — | No |
| 3 | City options depend on chosen Destination; disabled until a destination is picked | Same — city select `disabled` until `country` set, options from `destinationCityMap` | **Already complete** | None | `LeadForm.tsx` 763–783; `masters.api` `useDestinations` | — | No |
| 4 | Same destination may repeat across rows | Allowed (no uniqueness rule on destination value) | **Already complete** | None | schema/service | — | No |
| 5 | Nights per row (numeric) | Same (`number`, `min=0`) | **Already complete** | None | `LeadForm.tsx` 792 | — | No |
| 6 | Add row / Remove row | `Add More` appends; trash icon removes when >1 row | **Already complete (functional)** | None functional | `LeadForm.tsx` 802–817 | — | No |
| 7 | `Add More` on first row only; red `Remove` button on rows 2+ | `Add More` on **every** row; `Remove` is a **trash icon** (rows 2+) | **Different but functionally acceptable** | Optional cosmetic polish only | `LeadForm.tsx` 802–817 | Low | No |
| 8 | No inline "+ Add" buttons beside the selects | Two green **`+ Add`** buttons inside Destination and City fields with **no handler** (dead UI) | **Defect (extra, broken UI)** | Remove the two dead buttons | `LeadForm.tsx` 755–760, 784–789 | Very low | No |
| 9 | Blue "Itinerary *" required section | Same (`<Section title="Itinerary *" tone="blue">`) | **Already complete** | None | `LeadForm.tsx` 731 | — | No |
| 10 | Create Lead / Cancel | Same (`Create Lead` / `Save changes` + Cancel) | **Already complete** | None | `LeadForm.tsx` 823–830 | — | No |
| 11 | Itinerary persisted, ordered, tenant-scoped | Same (nested create with `companyId`, ordered by `sequence`) | **Already complete** | None | `queries.service.ts` 832/900/48 | — | No |
| 12 | Cities shown with airport code (e.g. "Bangkok (BKK)") | City options show name only (airport code intentionally de-emphasised per earlier product decision) | **Different but acceptable** | None (matches prior user preference) | `City.airportCode` exists if ever wanted | Low | No |
| 13 | Nights min/validation | `nights int 0..365` (min 0) | **Different / unconfirmed** | None unless a minimum is confirmed required | `itineraryInputSchema` | Low | No |

Only rows **#7** and **#8** represent any actionable difference, and only **#8**
is a genuine defect (dead, non-functional buttons). Everything else is already
complete or an acceptable, intentional difference. **No behaviour is missing that
requires new data, new APIs, or a migration.**

---

## 4. Reuse plan

There is **no new-file work** and **no new feature** required. If the two
cosmetic items (#7, #8) are approved as polish, all of it is edits to **one
existing component**:

| Task | Existing component to extend | Existing API/service | Existing model/field | Existing schema | Existing tests to update | Styling |
|---|---|---|---|---|---|---|
| Remove dead inline "+ Add" buttons (#8) | `apps/web/src/features/queries/LeadForm.tsx` (delete lines 755–760, 784–789) | none | none | none | `LeadsPage.test.tsx` (no change needed; optionally assert the buttons are gone) | existing Interscale classes |
| (Optional) Match reference Add/Remove layout (#7): `Add More` on first row, red `Remove` button on rows 2+ | `apps/web/src/features/queries/LeadForm.tsx` 802–817 | none | none | none | `LeadsPage.test.tsx` line 172 — keep `aria-label="Remove itinerary"` so the existing test still passes | existing `Button` variants |

Explicitly **reused, not rebuilt**: `QueryItinerary`, `City`, `Destination`,
`DestinationCity`, `itineraryInputSchema`, `queryInputSchema`/`queryUpdateSchema`,
`queries.service.ts` create/update/present, `queries.routes.ts` RBAC, the
`QUERY_CREATED`/`QUERY_UPDATED` activity logs, `useDestinations`,
`destinationCityMap`, and the existing frontend/backend tests.

---

## 5. Data-model decision

**The current Prisma schema already supports every confirmed reference
behaviour.** A `QueryItinerary` row already models exactly one
Destination + City + Nights entry, ordered by `sequence`, tenant-scoped, and
repeatable (including repeated destinations). Destination→City filtering is
served by the existing `DestinationCity` join and `City`/`Destination` masters.

**No schema change is recommended or necessary.** Specifically:

- No new table/model — `QueryItinerary` is the single itinerary structure; adding
  another would create a parallel system (prohibited).
- No new column — Destination, City, Nights, ordering and tenant scoping already
  exist. The `country`/`destination` column names are internal and functionally
  correct; renaming them would be a breaking, data-touching change for cosmetic
  reasons only (prohibited).
- Existing records remain readable — nothing changes at the data layer, so all
  current leads and their itineraries are unaffected.
- Rollback — not applicable (no migration proposed).
- Duplicate-structure avoidance — by reusing `QueryItinerary` and the existing
  masters, no second itinerary format or master is introduced.

If, later, a **confirmed** requirement emerges (e.g., store the City FK id or the
airport code on the itinerary row), the smallest change would be adding a
**nullable** `cityId`/`destinationId` reference to `QueryItinerary` while keeping
the existing snapshot columns for backward-readability — but this is **not**
justified by anything in the videos and is out of scope now.

---

## 6. Proposed implementation plan

Scope is limited to the two cosmetic items in §3; **all itinerary behaviour is
already complete**, so there is no database/backend/validation work.

### Database
- **Reuse existing** — `QueryItinerary`, `City`, `Destination`, `DestinationCity`.
  No new/changed tables or columns. No migration.

### Backend
- **Reuse existing** — `queries.service.ts` create/update/present, RBAC,
  activity logging, tenant isolation. No change.

### Frontend
- **Extend existing** (only if polish is approved): in
  `apps/web/src/features/queries/LeadForm.tsx`
  - Remove the two dead `+ Add` buttons inside the Destination and City fields
    (#8) — a genuine defect cleanup.
  - Optionally restyle the row action to match the reference (#7): `Add More`
    green button on the first row, red `Remove` button on rows 2+, preserving
    `aria-label="Remove itinerary"`.
- No new pages/components.

### Validation
- **Reuse existing** — `itineraryInputSchema` and `queryInputSchema`. No change.
  (A `nights` minimum would only be added if the reference is later confirmed to
  require it — currently unconfirmed.)

### Backward compatibility
- No data or contract changes; existing leads, itineraries, API responses and the
  `country`/`destination` snapshot semantics are untouched. The only edits are
  presentational in one form component.

### Testing
- **Reuse existing** — `apps/api/tests/queries.test.ts` (itinerary create) and
  `apps/web/src/pages/queries/LeadsPage.test.tsx` (add/remove controls) already
  cover the behaviour and must keep passing.
- **Update existing** (only if §3 polish is done): keep the `Remove itinerary`
  accessible label so the current web test still passes; optionally add one
  assertion that the dead inline buttons no longer render.

---

## Task labels summary

| Task | Label |
|---|---|
| Itinerary model, masters, relationship, validation, persistence, RBAC, activity log, tenant isolation | **Reuse existing** (already complete) |
| Remove dead inline "+ Add" buttons (defect) | **Extend existing** (one component) |
| Reference-style Add More / Remove button layout (optional polish) | **Extend existing** (one component) |
| Any new model/table/column/route/service/master/migration | **Not required** |

**Nothing in this plan is new implementation.** The lead-itinerary feature is
already present and correct; at most, two small presentational edits to
`LeadForm.tsx` would bring the visuals closer to the reference without touching
data, APIs, schemas, or architecture.
