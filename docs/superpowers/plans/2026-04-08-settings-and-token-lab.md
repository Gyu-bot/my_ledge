# Settings And Token Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated settings surface in the left sidebar that manages backend-tunable analytics parameters and a temporary frontend design-token tuning lab for live visual review.

**Architecture:** Split the feature into two settings domains behind one `설정` shell page. Backend analytics parameters are persisted through a typed settings API and become the source of truth for endpoint defaults. Frontend design-token tuning is explicitly a preview/debug surface that mutates runtime CSS variables live in the browser, can be reset/exported, and does not silently persist to production defaults until a later approved workflow is added.

**Tech Stack:** React Router, existing app shell/navigation, Tailwind + CSS variables, FastAPI, SQLAlchemy async, Pydantic v2, pytest + httpx, Vitest + Testing Library

---

## Scope Boundaries

- In scope:
  - left sidebar lower `설정` entry
  - settings route/page
  - persisted analytics settings API for backend parameters
  - live token tuning panel for font colors and chart/category palettes
  - reset/export/import behavior for the token tuning panel
- Out of scope:
  - multi-user roles/permissions
  - full design-system editor
  - arbitrary CSS editing
  - automatic write-back from token tuning directly into repo files
  - production theming system beyond current dark shell

## Feature Model

### 1. Analytics Settings

- Purpose: tune backend heuristics without code deploys
- Persistence: backend DB-backed settings store
- First parameters:
  - `spending_anomalies.min_delta_amount`
  - `spending_anomalies.anomaly_threshold`
  - `spending_anomalies.baseline_months`
- Read precedence:
  - explicit request override
  - persisted settings value
  - code default

### 2. Token Lab

- Purpose: temporarily tweak visual tokens while looking at the actual app
- Persistence v1:
  - runtime-only preview in the current browser session
  - optional `localStorage` restore for convenience
  - explicit `Export JSON` for handoff/review
- First editable token groups:
  - font colors
    - `text-primary`
    - `text-secondary`
    - `text-muted`
    - `text-faint/ghost` grouping policy
  - chart/category palette
    - top-level category colors used by stacked area / treemap
    - tooltip shell colors only if already tokenized
- Safety:
  - only allow editing whitelisted CSS variables
  - reset back to source-of-truth defaults in one action

## File Structure

**Create**
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/components/settings/AnalyticsSettingsPanel.tsx`
- `frontend/src/components/settings/TokenLabPanel.tsx`
- `frontend/src/components/settings/TokenPreviewSwatches.tsx`
- `frontend/src/components/settings/TokenRangeField.tsx` or `TokenColorField.tsx`
- `frontend/src/hooks/useAnalyticsSettings.ts`
- `frontend/src/hooks/useTokenLab.ts`
- `frontend/src/api/settings.ts`
- `frontend/src/types/settings.ts`
- `frontend/src/lib/tokenLab.ts`
- `frontend/src/test/pages/SettingsPage.test.tsx`
- `frontend/src/test/components/settings/AnalyticsSettingsPanel.test.tsx`
- `frontend/src/test/components/settings/TokenLabPanel.test.tsx`
- `backend/app/api/v1/endpoints/settings.py`
- `backend/app/services/settings_service.py`
- `backend/app/schemas/settings.py`
- `backend/app/models/app_setting.py`
- `backend/tests/api/test_settings_api.py`
- `backend/tests/services/test_settings_service.py`
- `backend/alembic/versions/<timestamp>_add_app_settings_table.py`

**Modify**
- `frontend/src/navigation.ts`
- `frontend/src/router.tsx`
- `frontend/src/components/layout/AppSidebar.tsx`
- `frontend/src/components/layout/AppTopbar.tsx`
- `frontend/src/index.css`
- `frontend/src/lib/apiClient.ts` if settings route needs any runtime-config nuance
- `backend/app/api/v1/router.py`
- `backend/app/services/analytics_service.py`
- `backend/app/services/schema_service.py` if settings endpoints should appear in schema docs
- `docs/frontend-design-tokens.md`
- `docs/backend-api-ssot.md`
- `docs/STATUS.md`

## Task 1: Shell-Level Settings Entry

**Files:**
- Modify: `frontend/src/navigation.ts`
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/layout/AppSidebar.tsx`
- Test: `frontend/src/test/pages/SettingsPage.test.tsx`

- [ ] Add a dedicated navigation item in the left sidebar lower section.
- [ ] Keep it out of the main analysis/operations cluster so it reads as shell-level configuration.
- [ ] Route it to `/settings`.
- [ ] Add a render test proving the route appears in desktop nav and loads the settings page.

## Task 2: Settings Page Skeleton

**Files:**
- Create: `frontend/src/pages/SettingsPage.tsx`
- Create: `frontend/src/components/settings/AnalyticsSettingsPanel.tsx`
- Create: `frontend/src/components/settings/TokenLabPanel.tsx`
- Test: `frontend/src/test/pages/SettingsPage.test.tsx`

- [ ] Build a single settings page with two first-class sections:
  - `분석/진단 설정`
  - `디자인 토큰 실험실`
- [ ] Reuse existing `SectionCard` and shell tokens instead of inventing a new layout pattern.
- [ ] Add concise descriptions that distinguish persisted backend settings from temporary frontend preview controls.
- [ ] Add tests that both panels render and carry the correct labels.

## Task 3: Backend Analytics Settings Contract

**Files:**
- Create: `backend/app/models/app_setting.py`
- Create: `backend/alembic/versions/<timestamp>_add_app_settings_table.py`
- Create: `backend/app/schemas/settings.py`
- Create: `backend/app/services/settings_service.py`
- Create: `backend/app/api/v1/endpoints/settings.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/services/test_settings_service.py`
- Test: `backend/tests/api/test_settings_api.py`

- [ ] Add a typed settings store for analytics parameters.
- [ ] Prefer one generic table over one column per setting:
  - key
  - scope/group
  - value_type
  - numeric/string/bool value slot
  - updated_at
- [ ] Expose:
  - `GET /api/v1/settings/analytics`
  - `PATCH /api/v1/settings/analytics`
- [ ] Enforce server-side validation:
  - `min_delta_amount >= 0`
  - `anomaly_threshold >= 0`
  - `1 <= baseline_months <= 12`
- [ ] Add tests for:
  - default fallback when DB has no rows
  - persisted override readback
  - invalid value rejection

## Task 4: Analytics Service Settings Consumption

**Files:**
- Modify: `backend/app/services/analytics_service.py`
- Modify: `backend/tests/services/test_analytics_service.py`
- Modify: `backend/tests/api/test_analytics_api.py`

- [ ] Change analytics services so endpoint defaults come from persisted settings when request params are omitted.
- [ ] Keep explicit request params highest priority.
- [ ] Start with `spending-anomalies`.
- [ ] Add tests showing:
  - no request param + persisted setting => persisted setting wins
  - request param present => request param wins
  - `assumptions` continues to show effective values

## Task 5: Frontend Analytics Settings Panel

**Files:**
- Create: `frontend/src/api/settings.ts`
- Create: `frontend/src/types/settings.ts`
- Create: `frontend/src/hooks/useAnalyticsSettings.ts`
- Modify: `frontend/src/components/settings/AnalyticsSettingsPanel.tsx`
- Test: `frontend/src/test/components/settings/AnalyticsSettingsPanel.test.tsx`

- [ ] Load analytics settings from the backend and show three states clearly:
  - system default
  - current saved value
  - edited unsaved draft
- [ ] Provide fields for:
  - anomaly minimum absolute delta amount
  - anomaly score threshold
  - anomaly baseline months
- [ ] Include save and reset-to-default actions.
- [ ] Show inline explanatory text for each parameter so the user can reason about impact without reading backend docs.
- [ ] Add tests for:
  - initial load
  - change tracking
  - save call payload
  - reset behavior

## Task 6: Token Lab Runtime Model

**Files:**
- Create: `frontend/src/lib/tokenLab.ts`
- Create: `frontend/src/hooks/useTokenLab.ts`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/test/components/settings/TokenLabPanel.test.tsx`

- [ ] Define a whitelist of editable CSS variables instead of free-form editing.
- [ ] Implement helpers to:
  - read default token values
  - apply runtime overrides to `document.documentElement`
  - reset overrides
  - export/import a compact JSON preset
- [ ] Support optional `localStorage` restore with an explicit feature flag in the hook so the behavior is easy to remove later.
- [ ] Add unit tests for token read/apply/reset/export behavior.

## Task 7: Token Lab UI

**Files:**
- Modify: `frontend/src/components/settings/TokenLabPanel.tsx`
- Create: `frontend/src/components/settings/TokenPreviewSwatches.tsx`
- Create: `frontend/src/components/settings/TokenColorField.tsx`
- Test: `frontend/src/test/components/settings/TokenLabPanel.test.tsx`

- [ ] Build the token lab around a few grouped controls instead of a giant flat list.
- [ ] First groups:
  - `폰트 색상`
  - `차트 카테고리 팔레트`
  - optional `tooltip/popover surface`
- [ ] For each token:
  - label
  - current color chip
  - editable color input
  - reset button
- [ ] Add small preview blocks showing the effect of the selected token group.
- [ ] Add export/import and full reset actions.
- [ ] Add tests for:
  - runtime preview application
  - per-token reset
  - export/import roundtrip

## Task 8: Preview Coupling To Real Surfaces

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/components/settings/TokenLabPanel.tsx`
- Modify: `docs/frontend-design-tokens.md`

- [ ] Make the token lab explain which current surfaces are affected:
  - sidebar/topbar text
  - chart category palette
  - tooltip shell
- [ ] Document which tokens are source-of-truth vs temporary preview-only.
- [ ] Add a handoff note in the docs: exported presets are review artifacts, not automatically merged into code.

## Task 9: Documentation And Contracts

**Files:**
- Modify: `docs/backend-api-ssot.md`
- Modify: `docs/frontend-design-tokens.md`
- Modify: `docs/STATUS.md`

- [ ] Document the settings API contract.
- [ ] Document the token lab scope and limitations.
- [ ] Call out that analytics settings are persisted while token lab changes are temporary unless explicitly exported/applied in code later.

## Acceptance Criteria

- The sidebar shows a lower `설정` entry that routes to a dedicated settings page.
- The settings page contains:
  - a persisted analytics-settings panel
  - a temporary token-lab panel
- `spending-anomalies` defaults can be tuned through persisted settings without code changes.
- Font colors and chart palettes can be previewed live in the browser through whitelisted token edits.
- Token lab can reset and export its temporary state.
- Backend tests, frontend tests, lint, and typecheck all pass.

## Risks And Guardrails

- Do not let token lab become a generic style editor. Keep the editable token list small and explicit.
- Do not silently persist token-lab edits to backend or repo files.
- Do not couple analytics settings writes to unrelated frontend token state.
- Keep settings page shell-compatible with current app patterns; this should not become a second admin UI design system.
