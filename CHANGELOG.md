# Changelog

All notable changes to this project will be documented in this file.

## 0.4.4 — Eve temperature history

Published as 0.4.4: versions 0.4.0 through 0.4.3 were published to npm by accident on 2026-05-09 and unpublished the same day, and npm permanently reserves published version numbers.

- [NEW] Optional Eve history for temperature sensors (`eveHistory`, off by default) — temperature sensors expose a [fakegato-history](https://github.com/simont77/fakegato-history) service (`custom` type, signature derived from the sensor's own characteristics, so no foreign characteristic is added and Apple's strict HAP validation stays happy). The Eve app renders graphs, min/max and weekly summaries; Apple Home is unaffected. One history entry is recorded every 10 minutes (fakegato's averaging timer), regardless of the API polling interval.
- [NEW] Dedicated background refresh timer for temperature sensors (`refreshTimerTemperature`, default 7200s, 0 to disable) — the official Homiris app only samples temperature every 2 hours, so temperature polls on its own much slower timer instead of the main `refreshTimer`.
- [FIX] Temperature sensors are re-registered under a fresh HomeKit identity (one-time). Eve keys its history database on the accessory identity, and identities created with the old slashed serial numbers (`system/sensor`) were permanently ignored by Eve's graphing engine — Eve fetched the history data but never plotted it (verified live: complete E863F116/11C/117 handshake with valid records, empty graph; re-registering the accessory fixed it instantly). **Existing installs: temperature sensors will reappear as new accessories in HomeKit and must be re-assigned to their rooms once.**
- [FIX] fakegato history files are keyed on the sensor serial number instead of the display name — several Homiris detectors can share a label (e.g. two doors named "Entrée"), which made their history files overwrite each other.
- [CHANGE] Information Service cleanup on temperature sensors: slash-free serial number and manufacturer (`/` breaks Eve history rendering, per the fakegato documentation), and `FirmwareRevision` now reports the plugin version instead of `0`.
- [CHANGE] Config schema: numeric fields use `type: number` instead of `integer` (the Homebridge UI rendered `integer` + min/max as an imprecise slider), `refreshTimer` and `refreshTimerTemperature` document the 0-to-disable behavior.
- [NEW] Runtime dependency on `fakegato-history` (^0.6.7) — the plugin's only dependency.

## 0.3.11

- [FIX] Transparent re-authentication on `401 Invalid Credentials` (WSO2 code `900901`) — when the OAuth `access_token` is invalidated server-side before its expected expiration (e.g. `getTemperature` failing with `<ams:code>900901</ams:code>`), `_apiCall()` now refreshes the token and replays the request once, in addition to the existing `403 SESSION_EXPIREE` handling.
- [CHANGE] Hard error responses returned by `_apiCall()` now preserve the actual HTTP status instead of always reporting `403`.

## 0.3.10 — Verified by Homebridge

- [DOCS] Added the `verified-by-homebridge` badge to the README, following verification of the plugin in [homebridge/plugins#1031](https://github.com/homebridge/plugins/pull/1031).
- [CHANGE] Added a PayPal funding link (`https://paypal.me/nroughol`) to `package.json`. The Homebridge UI now shows a ❤️ Donate button on the plugin's tile.

No runtime code changes — this release is documentation and metadata only.

## 0.3.9

- [CHANGE] Default `name` in the config schema is now `Homiris` instead of `SepsadSecurity`. This is the log-prefix label shown in Homebridge output (`[Homiris] INFO - …`) — display only. The platform identifier (`"platform": "SepsadSecurity"`) is unchanged for backward compatibility, so existing configs keep working untouched.
- [DOCS] Readme config example now includes `"name": "Homiris"` and clarifies the `platform` vs `name` distinction.

Existing users who want the new prefix in their logs need to add `"name": "Homiris"` to their platform block in `config.json` (or set it via the Homebridge UI). The schema default only takes effect for fresh installs.

## 0.3.8

- [FIX] Transparent re-authentication on `403 SESSION_EXPIREE` — the `idSession` returned by `/connect` expires before the OAuth `access_token`, so requests now detect session expiration, refresh the session, and retry once instead of failing and waiting for the 1-minute retry timer

## 0.3.4

- [REVERT] Removed disarm support — Homiris API requires biometric device authentication for sensitive actions, which cannot be replicated outside the official app

## 0.3.2

- [FIX] Activation endpoint path corrected (missing API version prefix)

## 0.3.1

- [FIX] Accessory registration used old plugin name `homebridge-sepsadsecurity`, causing "no loaded plugin could be found" warnings

## 0.3.0 — Forked as homebridge-homiris

Forked from [homebridge-sepsadsecurity](https://github.com/nicoduj/homebridge-sepsadSecurity) by Nicolas Dujardin.

- [FIX] Add missing `User-Agent`, `Eps-Ctx-Source`, `Eps-Ctx-Username` headers to all API calls (fixes broken communication since mid-2024)
- [FIX] Export `UNKNOWN` constant (was silently breaking operation timeout logic)
- [FIX] Smoke sensor refresh now compares `.value` instead of Characteristic objects
- [FIX] Remove reference to undefined `result` variable in error log
- [FIX] Align `maxWaitTimeForOperation` default with schema (30s, was 20s)
- [NEW] Homebridge v2.0 and v1.11 support (`getServiceById` replaces removed `getServiceByUUIDAndSubType`)
- [NEW] `originSession` defaults to `HOMIRIS` with dropdown for `HOMIRIS` / `SEPSAD` / `EPS`
- [NEW] Zero runtime dependencies — replaced deprecated `request` with native `fetch()`, removed `locks`
- [CHANGE] Background refresh disabled by default, minimum raised to 120s to avoid Homiris rate limiting
- [CHANGE] Requires Node.js >= 18, Homebridge >= 1.6.0

## 0.2.1

- [FIX] no more id in result, so system status was wrong.

## 0.2.0

- [FIX] new sepsad api auth method #5

## 0.1.1

- [FIX] handling more errors
- [NEW] funding

## 0.1.0

- [NEW] smoke and temp sensors
- [NEW] activation (optionnal)
- [NEW] cleaning lost devices from cache
- [FIX] fixes

## 0.0.3

- [NEW] config schema

## 0.0.2

- [NEW] Log for mode / config schema

## 0.0.1

- [NEW] First Version
