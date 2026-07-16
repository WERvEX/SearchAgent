# Frontend Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete English and Simplified Chinese localization with browser-language defaults and a persistent header switch.

**Architecture:** A dependency-free typed i18n module owns locale resolution, persistence, translation resources, interpolation, and React context. Existing components consume the context and keep backend/user-provided data untranslated.

**Tech Stack:** React 18, TypeScript 5, Vitest, Testing Library, Tailwind CSS, Vite

## Global Constraints

- Supported locales are exactly `en` and `zh-CN`.
- A valid `searchagent.locale` value overrides browser detection; otherwise any browser language beginning with `zh` selects `zh-CN`, and all others select `en`.
- Every locale change synchronizes `<html lang>` and manual changes persist to local storage.
- Do not translate `SearchAgent`, user/report content, backend-provided plan/profile/server names, or raw backend error details.
- Do not add a third-party localization dependency.
- Follow test-driven development: add a failing test, confirm the expected failure, implement, and rerun tests.

---

### Task 1: Typed localization runtime

**Files:**
- Create: `frontend/src/i18n/messages.ts`
- Create: `frontend/src/i18n/I18nProvider.tsx`
- Create: `frontend/src/i18n/I18nProvider.test.tsx`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Produces: `type Locale = "en" | "zh-CN"`, `I18nProvider`, and `useI18n()` returning `{ locale, setLocale, t }`.
- `t` accepts only keys present in the English message dictionary plus optional string/number interpolation values.

- [ ] **Step 1: Write failing runtime tests**

Test that `resolveInitialLocale` prefers a valid stored value, detects `zh-*` from the browser language list, falls back to English, persists a manual choice, translates a parameterized message, and synchronizes `document.documentElement.lang`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- frontend/src/i18n/I18nProvider.test.tsx`

Expected: FAIL because the i18n module does not exist.

- [ ] **Step 3: Implement the runtime and resources**

Define the complete English dictionary and a `Record<MessageKey, string>` Chinese dictionary. Read storage defensively, inspect `navigator.languages` followed by `navigator.language`, interpolate `{name}` tokens, and update storage/HTML language in the provider.

- [ ] **Step 4: Mount the provider and verify GREEN**

Wrap `<App />` with `<I18nProvider>` in `main.tsx` and rerun the focused test. Expected: PASS.

### Task 2: Localized shell and language switch

**Files:**
- Modify: `frontend/src/components/AppShell.tsx`
- Modify: `frontend/src/components/AppShell.test.tsx`

**Interfaces:**
- Consumes: `useI18n()` from Task 1.
- Produces: a two-option `中文`/`EN` control with `aria-pressed` state and localized labels.

- [ ] **Step 1: Add failing tests**

Render the shell through `I18nProvider`, assert localized navigation, switch to Chinese, assert Chinese navigation, pressed state, local storage, and `<html lang>`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- frontend/src/components/AppShell.test.tsx`

Expected: FAIL because the language control and translated navigation do not exist.

- [ ] **Step 3: Implement the shell localization**

Translate navigation/ARIA labels and add the compact switch without changing pane ordering or responsive contracts.

- [ ] **Step 4: Rerun the focused test**

Expected: PASS with no warnings.

### Task 3: Localize application screens

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/ConversationPanel.tsx`
- Modify: `frontend/src/components/ResearchWorkspace.tsx`
- Modify: `frontend/src/components/PlanPanel.tsx`
- Modify: `frontend/src/components/ProgressStream.tsx`
- Modify: `frontend/src/components/ReportPanel.tsx`
- Modify: `frontend/src/components/SettingsPanel.tsx`
- Modify: corresponding `*.test.tsx` files

**Interfaces:**
- Consumes: `useI18n()` and typed message keys from Task 1.
- Preserves: component props, backend API payloads, and untranslated backend/user content.

- [ ] **Step 1: Add representative failing Chinese tests**

Cover application status, conversation empty state, research form, plan actions, event status/event labels, report controls, settings labels/validation, and accessible names.

- [ ] **Step 2: Run component tests and verify RED**

Run: `npm.cmd test -- frontend/src/App.test.tsx frontend/src/components`

Expected: FAIL on untranslated copy.

- [ ] **Step 3: Translate all frontend-owned copy**

Replace inline UI strings with typed keys. Map known phases, stream connection states, roles, and lifecycle event names; retain raw values as fallback. Store status as semantic keys where language switching must update already-rendered status text.

- [ ] **Step 4: Run the complete frontend suite**

Run: `npm.cmd test`

Expected: all tests pass with no React warnings.

### Task 4: Build and browser verification

**Files:**
- Modify only files required to correct defects found by verification.

- [ ] **Step 1: Build production assets**

Run: `npm.cmd run build`

Expected: TypeScript and Vite build succeed.

- [ ] **Step 2: Verify browser-language default and persistence**

With local storage cleared, compare the first-rendered language to `navigator.languages`/`navigator.language`. Switch to the other language, reload, and confirm the choice and `<html lang>` persist.

- [ ] **Step 3: Verify desktop and mobile layouts**

Check representative research and settings screens at 1440x900 and 390x844. Confirm no horizontal overflow, clipped labels, overlapping controls, or console errors.

- [ ] **Step 4: Run repository verification before merge**

Run frontend tests/build and backend tests using the project commands documented in `HANDOVER.md` or the Phase 6 plan. Expected: all current suites pass, allowing only the already-known Starlette deprecation warning.
