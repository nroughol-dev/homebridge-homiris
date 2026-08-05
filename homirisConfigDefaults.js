// Single source of truth for every numeric option's default and bounds.
//
// config.schema.json (the Homebridge UI form) and the readme.md field table both
// restate these numbers, and nothing in HomeKit or Homebridge notices when they
// drift — 0.4.4 shipped `maxWaitTimeForOperation` out of sync, Unreleased shipped
// `refreshTimerDuringOperation` out of sync. `npm test` now runs
// checkConfigSchema.js, which walks this table against both files and fails on
// divergence, so this file is the only place a default is edited.
//
// zeroDisables: the option accepts the sentinel 0 (polling off) in addition to the
// min..max range, which is why its schema `minimum` is 0 and not `min`.
module.exports = {
  refreshTimer: {min: 120, max: 3600, def: 300, zeroDisables: true},
  refreshTimerTemperature: {min: 1800, max: 86400, def: 7200, zeroDisables: true},
  refreshTimerDuringOperation: {min: 2, max: 15, def: 10},
  maxWaitTimeForOperation: {min: 30, max: 90, def: 30},
};
