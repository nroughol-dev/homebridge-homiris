# Changelog

All notable changes to this project will be documented in this file.

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
