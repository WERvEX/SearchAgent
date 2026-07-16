# Frontend Localization Design

## Goal

Add complete Simplified Chinese and English localization to the React frontend. The first visit follows the browser language, and an explicit language choice persists across reloads.

## Scope

- Localize all frontend-owned visible text, accessibility labels, validation messages, status labels, and known lifecycle event labels.
- Keep the `SearchAgent` product name, user content, report content, profile/server names, plan content returned by the backend, and raw backend error details unchanged.
- Support `zh-CN` and `en`. Any browser language beginning with `zh` selects `zh-CN`; all other languages select `en`.
- Store an explicit user choice under `searchagent.locale`. Browser detection applies only when no valid stored choice exists.
- Keep `<html lang>` synchronized with the active locale.

## Architecture

Create a dependency-free `i18n` module with typed message keys, locale resolution helpers, interpolation, and an `I18nProvider`/`useI18n` React API. Mount the provider in `main.tsx` so every screen uses the same locale state.

Add a compact two-option language control to the application header. It exposes pressed state and localized accessibility text, and it must fit the existing responsive header without changing the three-pane layout.

Components consume `useI18n()` and translate only frontend-owned copy. Known run phases, event stream connection states, message roles, and lifecycle event names use explicit mappings with a readable raw-value fallback.

## Error Handling

Invalid or unavailable local storage is non-fatal: locale resolution falls back to the browser language. Translation lookup is compile-time constrained by the English dictionary, and interpolation leaves no UI-visible placeholders in normal use.

## Testing

- Unit-test locale resolution, stored overrides, switching persistence, interpolation, and `<html lang>` synchronization.
- Add representative component tests for English and Chinese text plus the header switch.
- Keep existing component behavior tests passing by rendering through the provider where needed.
- Run the complete frontend test suite and production build.
- Browser-smoke both languages, reload persistence, browser-default behavior, desktop/mobile layout, overflow, and console errors.

## Acceptance Criteria

1. A fresh visit renders Chinese when the browser language starts with `zh`, otherwise English.
2. Users can switch between `中文` and `EN` from the header.
3. The selected language survives reload and updates `<html lang>`.
4. All frontend-owned visible and accessible copy is localized.
5. Existing workflows remain functional and all automated/browser checks pass before merge.
