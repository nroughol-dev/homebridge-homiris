# homebridge-homiris

Homebridge plugin for [Homiris](https://www.homiris.com/), [Sepsad](https://www.sepsad-telesurveillance.fr), and [EPS](https://www.eps.fr/) alarm systems. Exposes your alarm panel, smoke detectors, and temperature sensors to Apple HomeKit.

Forked from [homebridge-sepsadsecurity](https://github.com/nicoduj/homebridge-sepsadSecurity) by Nicolas Dujardin, which is no longer maintained. This version fixes the broken API communication, removes deprecated dependencies, and adds Homebridge v2.0 support.

## What's new

### 0.3.3
- Added disarm support via HomeKit (always allowed, no config needed)
- Fixed activation endpoint (was returning 404)

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

**Disarming** the alarm via HomeKit is always allowed.

**Arming** is **disabled by default** and must be explicitly enabled via `allowActivation`.

## Installation

```
npm install -g @nroughol/homebridge-homiris
```

Or search for `@nroughol/homebridge-homiris` in the Homebridge UI plugins tab.

## Configuration

```json
"platforms": [
  {
    "platform": "SepsadSecurity",
    "login": "123456",
    "password": "your-password",
    "originSession": "HOMIRIS"
  }
]
```

### Fields

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `platform` | Yes | | Must be `"SepsadSecurity"` |
| `login` | Yes | | Your Homiris/Sepsad account login |
| `password` | Yes | | Your Homiris/Sepsad account password |
| `originSession` | No | `"HOMIRIS"` | `"HOMIRIS"`, `"SEPSAD"`, or `"EPS"` depending on your system brand |
| `allowActivation` | No | `false` | Set to `true` to allow arming the system via HomeKit |
| `refreshTimer` | No | disabled | Refresh alarm state every X seconds (120--3600). Leave empty to disable |
| `maxWaitTimeForOperation` | No | `30` | Max seconds to wait for an arm operation to complete (30--90) |
| `refreshTimerDuringOperation` | No | `10` | Polling interval in seconds while an arm operation is in progress (2--15) |
| `cleanCache` | No | `false` | Set to `true` to remove cached accessories on next restart, then remove the option |

### Migrating from homebridge-sepsadsecurity

1. Uninstall the old plugin: `npm uninstall -g homebridge-sepsadsecurity`
2. Install this plugin: `npm install -g @nroughol/homebridge-homiris`
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
