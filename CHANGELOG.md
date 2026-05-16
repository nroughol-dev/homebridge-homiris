# Changelog

All notable changes to this project will be documented in this file.

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
