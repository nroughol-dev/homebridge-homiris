# homebridge-homiris

[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=for-the-badge&logoColor=%23FFFFFF&logo=homebridge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin for [Homiris](https://www.homiris.com/), [Sepsad](https://www.sepsad-telesurveillance.fr), and [EPS](https://www.eps.fr/) alarm systems. Exposes your alarm panel, smoke detectors, and temperature sensors to Apple HomeKit.

Forked from [homebridge-sepsadsecurity](https://github.com/nicoduj/homebridge-sepsadSecurity) by Nicolas Dujardin, which is no longer maintained. This version fixes the broken API communication, removes deprecated dependencies, and adds Homebridge v2.0 support.

## What's new

### 0.4.4

- **Eve temperature history** (optional, `eveHistory`) — temperature sensors get a `fakegato-history` service so the Eve app renders graphs, min/max and weekly summaries. One entry every 10 minutes. Apple Home is unaffected.
- **Dedicated temperature polling** (`refreshTimerTemperature`, default 2h) — matches the official app's sampling rate instead of hammering the API on the main refresh timer.
- ⚠️ **Temperature sensors are re-created once** under a fresh HomeKit identity (required for Eve to plot history — identities with the old slashed serial numbers are permanently ignored by Eve's graphing engine). Re-assign them to their rooms after updating.

### 0.3.10

- Verified by Homebridge
- Added a donation link (PayPal) — shown as a ❤️ Donate button on the Homebridge UI tile

### 0.3.9

- Default `name` (the log-prefix label) is now `Homiris` instead of `SepsadSecurity`. Display only — `platform` stays `SepsadSecurity` for backward compatibility. To get the new prefix in your existing install's logs, add `"name": "Homiris"` to your `config.json` platform block.

### 0.3.4

- Reverted disarm support — Homiris API requires biometric device auth for sensitive actions

### 0.3.2

- Fixed activation endpoint: was missing `smartphone/production/1.0.0/` prefix

### 0.3.1

- Fixed accessory registration using the old plugin name, which caused "no loaded plugin could be found" warnings

### 0.3.0

- **Fixed API compatibility** -- the Homiris/EPS API started requiring `User-Agent` and other headers on all requests; the original plugin only sent them on login
- **Homebridge v2.0 + v1.11 support** -- replaced removed `getServiceByUUIDAndSubType()` API
- **Zero runtime dependencies** -- replaced deprecated `request` library with native `fetch()`, removed `locks`
- **HOMIRIS origin** -- `originSession` now defaults to `HOMIRIS` (was `SEPSAD`), matching what most current installations use
- **Safer polling** -- background refresh is disabled by default and minimum interval raised to 120s (Homiris monitors and contacts users who poll too frequently)

## Important

**Disarming the alarm via this plugin is not possible.** The Homiris API requires biometric device authentication for disarming, which cannot be replicated outside the official app. Attempting to disarm via HomeKit will be silently ignored.

**Arming** is **disabled by default** and must be explicitly enabled via `allowActivation`.

## Installation

```
npm install -g homebridge-homiris
```

Or search for `homebridge-homiris` in the Homebridge UI plugins tab.

## Configuration

```json
"platforms": [
  {
    "platform": "SepsadSecurity",
    "name": "Homiris",
    "login": "123456",
    "password": "your-password",
    "originSession": "HOMIRIS"
  }
]
```

`platform` must remain `"SepsadSecurity"` (the plugin's stable identifier — kept for backward compatibility with existing installs); `name` is just the log-prefix label and can be set freely.

### Fields

| Field                         | Required | Default     | Description                                                                                                                                   |
| ----------------------------- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform`                    | Yes      |             | Must be `"SepsadSecurity"`                                                                                                                    |
| `login`                       | Yes      |             | Your Homiris/Sepsad account login                                                                                                             |
| `password`                    | Yes      |             | Your Homiris/Sepsad account password                                                                                                          |
| `originSession`               | No       | `"HOMIRIS"` | `"HOMIRIS"`, `"SEPSAD"`, or `"EPS"` depending on your system brand                                                                            |
| `allowActivation`             | No       | `false`     | Set to `true` to allow arming the system via HomeKit                                                                                          |
| `refreshTimer`                | No       | `300`       | Refresh alarm and smoke sensor states every X seconds (120--3600). Set to `0` to disable                                                      |
| `refreshTimerTemperature`     | No       | `7200`      | Refresh temperature sensors every X seconds (1800--86400). Homiris only samples every 2h. Set to `0` to disable                               |
| `eveHistory`                  | No       | `false`     | Expose temperature sensors with a `fakegato-history` service so the Eve app shows graphs and min/max (experimental). Apple Home is unaffected |
| `maxWaitTimeForOperation`     | No       | `30`        | Max seconds to wait for an arm operation to complete (30--90)                                                                                 |
| `refreshTimerDuringOperation` | No       | `5`         | Polling interval in seconds while an arm operation is in progress (2--15)                                                                     |
| `cleanCache`                  | No       | `false`     | Set to `true` to remove cached accessories on next restart, then remove the option                                                            |

### Migrating from homebridge-sepsadsecurity

1. Uninstall the old plugin: `npm uninstall -g homebridge-sepsadsecurity`
2. Install this plugin: `npm install -g homebridge-homiris`
3. The `platform` name in your config stays `"SepsadSecurity"` -- no config change needed
4. If you had `"originSession": "SEPSAD"` and have a Homiris system, change it to `"HOMIRIS"`

## Exposed accessories

- **Security System** -- arm state (Away/Home/Night/Off), mapped from Homiris TOTAL/PARTIAL/OFF modes
- **Smoke Sensors** -- one per smoke detector reported by your system
- **Temperature Sensors** -- one per temperature probe (if your system has any)

## Requirements

- Homebridge >= 1.6.0 (including v2.0)
- Node.js >= 18

## Credits

Original plugin by [Nicolas Dujardin](https://github.com/nicoduj/).

## License

[UNLICENSE](LICENSE)
