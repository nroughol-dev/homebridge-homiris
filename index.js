var Service, Characteristic, Accessory, UUIDGen, FakeGatoHistoryService;

var HomirisAPI = require('./homirisAPI.js').HomirisAPI;
const HomirisTools = require('./homirisTools.js');
const HomirisConst = require('./homirisConst');
const CONFIG_DEFAULTS = require('./homirisConfigDefaults.js');
const os = require('os');
const PLUGIN_VERSION = require('./package.json').version;

function myHomirisPlatform(log, config, api) {
  if (!config) {
    log('No configuration found for homebridge-homiris');
    return;
  }

  this.api = api;
  this.log = log;
  this.login = config['login'];
  this.password = config['password'];

  //every default and bound below comes from homirisConfigDefaults.js - never inline a
  //number here, config.schema.json and the readme restate them and npm test compares
  let bounds = HomirisTools.boundsChecker(CONFIG_DEFAULTS, log);

  //background polling enabled by default (300s), set refreshTimer to 0 to disable
  this.refreshTimer = config['refreshTimer'] === 0 ? 0 : bounds('refreshTimer', config);

  //temperature sensors background polling - the official Homiris app only samples
  //every 2 hours, so poll on a dedicated, much slower timer (default 7200s, 0 to disable)
  this.refreshTimerTemperature =
    config['refreshTimerTemperature'] === 0 ? 0 : bounds('refreshTimerTemperature', config);

  this.refreshTimerDuringOperation = bounds('refreshTimerDuringOperation', config);
  this.maxWaitTimeForOperation = bounds('maxWaitTimeForOperation', config);
  this.originSession = config['originSession'] || 'HOMIRIS';

  this.allowActivation = HomirisTools.checkBoolParameter(config['allowActivation'], false);

  this.eveHistory = HomirisTools.checkBoolParameter(config['eveHistory'], false);

  this.cleanCache = config['cleanCache'];

  this.foundAccessories = [];
  this.homirisAPI = new HomirisAPI(log, this);

  this.loaded = false;
  this.tempLoaded = false;

  this._confirmedAccessories = [];
  this._confirmedServices = [];

  this.api
    .on(
      'shutdown',
      function () {
        this.end();
      }.bind(this)
    )
    .on(
      'didFinishLaunching',
      function () {
        this.log('DidFinishLaunching');

        if (this.cleanCache) {
          this.log('WARNING - Removing Accessories');
          this.api.unregisterPlatformAccessories(
            'homebridge-homiris',
            'SepsadSecurity',
            this.foundAccessories
          );
          this.foundAccessories = [];
        }
        this.discoverSecuritySystem();
      }.bind(this)
    );
}

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  Accessory = homebridge.platformAccessory;
  UUIDGen = homebridge.hap.uuid;
  FakeGatoHistoryService = require('fakegato-history')(homebridge);
  homebridge.registerPlatform('SepsadSecurity', myHomirisPlatform);
};

myHomirisPlatform.prototype = {
  configureAccessory: function (accessory) {
    this.log.debug(accessory.displayName, 'Got cached Accessory ' + accessory.UUID);

    this.foundAccessories.push(accessory);
  },

  end() {
    this.log('INFO - shutdown');
    if (this.timerID) {
      clearInterval(this.timerID);
      this.timerID = undefined;
    }
    if (this.tempTimerID) {
      clearInterval(this.tempTimerID);
      this.tempTimerID = undefined;
    }
    // disconnecting ?
  },

  //Cleaning methods
  cleanPlatform: function () {
    this.cleanAccessories();
    this.cleanServices();
  },

  cleanAccessories: function () {
    //cleaning accessories
    let accstoRemove = [];
    for (let acc of this.foundAccessories) {
      if (!this._confirmedAccessories.find((x) => x.UUID == acc.UUID)) {
        accstoRemove.push(acc);
        this.log('WARNING - Accessory will be Removed ' + acc.UUID + '/' + acc.displayName);
      }
    }

    if (accstoRemove.length > 0)
      this.api.unregisterPlatformAccessories('homebridge-homiris', 'SepsadSecurity', accstoRemove);
  },

  cleanServices: function () {
    //cleaning services
    for (let acc of this.foundAccessories) {
      let servicestoRemove = [];
      for (let serv of acc.services) {
        if (
          serv.subtype !== undefined &&
          !this._confirmedServices.find((x) => x.UUID == serv.UUID && x.subtype == serv.subtype)
        ) {
          servicestoRemove.push(serv);
        }
      }
      for (let servToDel of servicestoRemove) {
        this.log(
          'WARNING - Service Removed' +
            servToDel.UUID +
            '/' +
            servToDel.subtype +
            '/' +
            servToDel.displayName
        );
        acc.removeService(servToDel);
      }
    }
  },

  discoverSecuritySystem: function () {
    this.homirisAPI.on('securitySystemRefreshError', () => {
      if (this.timerID == undefined) {
        this.log('ERROR - securitySystemRefreshError - will retry in 1 minute');
        setTimeout(() => {
          this.homirisAPI.getSecuritySystem();
        }, 60000);
      }
    });

    this.homirisAPI.on('securitySystemRefreshed', () => {
      this.log.debug('INFO - securitySystemRefreshed event');
      this.log.debug('INFO - SecuritySystem : ' + JSON.stringify(this.homirisAPI.securitySystem));

      if (!this.loaded) {
        this.loadSecuritySystem();
      } else {
        this.updateSecuritySystem();
      }
    });

    this.homirisAPI.on('securitySystemTemperatureRefreshError', () => {
      if (this.timerID == undefined) {
        this.log('ERROR - securitySystemTemperatureRefreshError - will retry in 1 minute');
        setTimeout(() => {
          this.homirisAPI.getSecuritySystem();
        }, 60000);
      }
    });

    this.homirisAPI.on('securitySystemTemperatureRefreshed', () => {
      this.log.debug('INFO - securitySystemTemperatureRefreshed event');
      this.log.debug(
        'INFO - securitySystemTemperature : ' +
          JSON.stringify(this.homirisAPI.securitySystem.temperatureInfo)
      );

      if (!this.tempLoaded) {
        this.createTemperatureSensorsAccessories();
      } else {
        this.updateTemperature();
      }
    });

    this.homirisAPI.getSecuritySystem();
  },

  createSecuritySystemAccessory() {
    if (this.homirisAPI.securitySystem.security) {
      let securitySystemName = this.homirisAPI.securitySystem.name;
      let securitySystemModel = this.homirisAPI.securitySystem.model;
      let securitySystemSeriaNumber = this.homirisAPI.securitySystem.id;

      this.log('INFO - Discovered SecuritySystem : ' + securitySystemName);

      let uuid = UUIDGen.generate(securitySystemName + securitySystemSeriaNumber);
      let mySecuritySystemAccessory = this.foundAccessories.find((x) => x.UUID == uuid);

      if (!mySecuritySystemAccessory) {
        mySecuritySystemAccessory = new Accessory(securitySystemName, uuid);
        mySecuritySystemAccessory.name = securitySystemName;
        mySecuritySystemAccessory.model = securitySystemModel;
        mySecuritySystemAccessory.manufacturer = 'Homiris/Sepsad/EPS';
        mySecuritySystemAccessory.serialNumber = securitySystemSeriaNumber;
        mySecuritySystemAccessory.securitySystemID = securitySystemSeriaNumber;

        mySecuritySystemAccessory
          .getService(Service.AccessoryInformation)
          .setCharacteristic(Characteristic.Manufacturer, mySecuritySystemAccessory.manufacturer)
          .setCharacteristic(Characteristic.Model, mySecuritySystemAccessory.model)
          .setCharacteristic(Characteristic.SerialNumber, mySecuritySystemAccessory.serialNumber);

        this.api.registerPlatformAccessories('homebridge-homiris', 'SepsadSecurity', [
          mySecuritySystemAccessory,
        ]);

        this.foundAccessories.push(mySecuritySystemAccessory);
      }

      mySecuritySystemAccessory.securitySystemID = securitySystemSeriaNumber;
      mySecuritySystemAccessory.name = securitySystemName;

      let HKSecurityService = mySecuritySystemAccessory.getServiceById(
        Service.SecuritySystem,
        'SecuritySystemService' + securitySystemName
      );

      if (!HKSecurityService) {
        this.log('INFO - Creating SecurityService Service ' + securitySystemName);
        HKSecurityService = new Service.SecuritySystem(
          securitySystemName,
          'SecuritySystemService' + securitySystemName
        );
        HKSecurityService.subtype = 'SecuritySystemService' + securitySystemName;
        mySecuritySystemAccessory.addService(HKSecurityService);
      }

      this.bindSecuritySystemCurrentStateCharacteristic(HKSecurityService);
      this.bindSecuritySystemTargetStateCharacteristic(HKSecurityService);

      this._confirmedAccessories.push(mySecuritySystemAccessory);
      this._confirmedServices.push(HKSecurityService);

      // Required Characteristics
      //this.addCharacteristic(Characteristic.SecuritySystemCurrentState);
      //this.addCharacteristic(Characteristic.SecuritySystemTargetState);
      // Optional Characteristics
      //this.addOptionalCharacteristic(Characteristic.StatusFault);
      //this.addOptionalCharacteristic(Characteristic.StatusTampered);
      //this.addOptionalCharacteristic(Characteristic.SecuritySystemAlarmType);
      //this.addOptionalCharacteristic(Characteristic.Name);
    }
  },

  createSmokeSensorsAccessories() {
    if (this.homirisAPI.securitySystem.fire) {
      // The API returns null, not [], when the system has no smoke detector (issue #1).
      let smokeDetectors = this.homirisAPI.securitySystem.fire.smokeDetectors || [];

      for (let a = 0; a < smokeDetectors.length; a++) {
        let smokeSensorName = smokeDetectors[a].label;
        let smokeSensorModel = this.homirisAPI.securitySystem.model;
        let smokeSensorSeriaNumber = this.homirisAPI.securitySystem.id + '/' + smokeDetectors[a].id;

        this.log('INFO - Discovered SmokeSensor : ' + smokeSensorName);

        let uuid = UUIDGen.generate(smokeSensorName + smokeSensorSeriaNumber);

        let mySmokeSensorAccessory = this.foundAccessories.find((x) => x.UUID == uuid);

        if (!mySmokeSensorAccessory) {
          mySmokeSensorAccessory = new Accessory(smokeSensorName, uuid);
          mySmokeSensorAccessory.name = smokeSensorName;
          mySmokeSensorAccessory.model = smokeSensorModel;
          mySmokeSensorAccessory.manufacturer = 'Homiris/Sepsad/EPS';
          mySmokeSensorAccessory.serialNumber = smokeSensorSeriaNumber;
          mySmokeSensorAccessory.smokeSensorID = smokeDetectors[a].id;

          mySmokeSensorAccessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, mySmokeSensorAccessory.manufacturer)
            .setCharacteristic(Characteristic.Model, mySmokeSensorAccessory.model)
            .setCharacteristic(Characteristic.SerialNumber, mySmokeSensorAccessory.serialNumber);

          this.api.registerPlatformAccessories('homebridge-homiris', 'SepsadSecurity', [
            mySmokeSensorAccessory,
          ]);

          this.foundAccessories.push(mySmokeSensorAccessory);
        }

        mySmokeSensorAccessory.smokeSensorID = smokeDetectors[a].id;
        mySmokeSensorAccessory.name = smokeSensorName;

        let HKSmokeSensorService = mySmokeSensorAccessory.getServiceById(
          Service.SmokeSensor,
          'SmokeSensorService' + smokeSensorName
        );

        if (!HKSmokeSensorService) {
          this.log('INFO - Creating SmokeSensor Service ' + smokeSensorName);
          HKSmokeSensorService = new Service.SmokeSensor(
            smokeSensorName,
            'SmokeSensorService' + smokeSensorName
          );
          HKSmokeSensorService.subtype = 'SmokeSensorService' + smokeSensorName;
          mySmokeSensorAccessory.addService(HKSmokeSensorService);
        }

        this.bindSmokeDetectedCharacteristic(HKSmokeSensorService);
        this.bindSmokeStatusActiveCharacteristic(HKSmokeSensorService);

        this._confirmedAccessories.push(mySmokeSensorAccessory);
        this._confirmedServices.push(HKSmokeSensorService);
        //this.bindSmokeStatusLowBatteryCharacteristic(HKSmokeSensorService);
        //this.bindSmokeStatusFaultCharacteristic(HKSmokeSensorService);

        // Required Characteristics
        //this.addCharacteristic(Characteristic.SmokeDetected);

        // Optional Characteristics
        //this.addOptionalCharacteristic(Characteristic.StatusActive);
        //this.addOptionalCharacteristic(Characteristic.StatusFault);
        //this.addOptionalCharacteristic(Characteristic.StatusTampered);
        //this.addOptionalCharacteristic(Characteristic.StatusLowBattery);
        //this.addOptionalCharacteristic(Characteristic.Name);
      }
    }
  },

  createTemperatureSensorsAccessories() {
    // The API returns statements: null, not [], when it has nothing to report - the same
    // shape as fire.smokeDetectors. Normalise it instead of guarding the whole function:
    // the tail below owns tempLoaded, the cleanPlatform() that loadSecuritySystem()
    // delegates on this branch, and the background timer, and nothing else ever
    // re-triggers a temperature poll if they are skipped.
    let tempSensors = this.homirisAPI.securitySystem.temperatureInfo || [];
    for (let a = 0; a < tempSensors.length; a++) {
      let tempSensorName = tempSensors[a].label;
      let tempSensorModel = this.homirisAPI.securitySystem.model;
      let tempSensorSeriaNumber = this.homirisAPI.securitySystem.id + '/' + tempSensors[a].id;

      this.log('INFO - Discovered TemperatureSensor : ' + tempSensorName);

      // ':eve2' bumps the accessory UUID so existing installs re-register the
      // sensor under a fresh HomeKit aid. Eve keys its history database on the
      // accessory identity, and identities created before v0.4.0 (slashed
      // serial numbers) are permanently ignored by Eve's graphing engine even
      // though it fetches the data (verified live: full E863F116/11C/117
      // handshake with valid records, yet empty graph; re-registering the
      // accessory under a new aid fixed it instantly).
      // One-time cost: the sensor reappears in HomeKit and must be re-assigned
      // to its room.
      let uuid = UUIDGen.generate(tempSensorName + tempSensorSeriaNumber + ':eve2');

      let myTempSensorAccessory = this.foundAccessories.find((x) => x.UUID == uuid);

      // fakegato-history docs warn that '/' in any Information Service characteristic
      // (manufacturer, model, serial) can prevent Eve from rendering history. Keep the
      // original tempSensorSeriaNumber for UUID stability (existing installs), but
      // expose slash-free variants on the Information Service characteristics.
      let tempSensorSerialDisplay = tempSensorSeriaNumber.replace(/\//g, '-');
      let tempSensorManufacturerDisplay = 'Homiris-Sepsad-EPS';

      if (!myTempSensorAccessory) {
        myTempSensorAccessory = new Accessory(tempSensorName, uuid);
        myTempSensorAccessory.name = tempSensorName;
        myTempSensorAccessory.model = tempSensorModel;
        myTempSensorAccessory.manufacturer = tempSensorManufacturerDisplay;
        myTempSensorAccessory.serialNumber = tempSensorSerialDisplay;
        myTempSensorAccessory.tempSensorID = tempSensors[a].id;

        myTempSensorAccessory
          .getService(Service.AccessoryInformation)
          .setCharacteristic(Characteristic.Manufacturer, myTempSensorAccessory.manufacturer)
          .setCharacteristic(Characteristic.Model, myTempSensorAccessory.model)
          .setCharacteristic(Characteristic.SerialNumber, myTempSensorAccessory.serialNumber)
          .setCharacteristic(Characteristic.FirmwareRevision, PLUGIN_VERSION);

        this.api.registerPlatformAccessories('homebridge-homiris', 'SepsadSecurity', [
          myTempSensorAccessory,
        ]);

        this.foundAccessories.push(myTempSensorAccessory);
      } else {
        // Refresh cached info service in case a previous version wrote slashed values.
        myTempSensorAccessory.manufacturer = tempSensorManufacturerDisplay;
        myTempSensorAccessory.serialNumber = tempSensorSerialDisplay;
        myTempSensorAccessory
          .getService(Service.AccessoryInformation)
          .setCharacteristic(Characteristic.Manufacturer, tempSensorManufacturerDisplay)
          .setCharacteristic(Characteristic.SerialNumber, tempSensorSerialDisplay)
          .setCharacteristic(Characteristic.FirmwareRevision, PLUGIN_VERSION);
      }

      myTempSensorAccessory.tempSensorID = tempSensors[a].id;
      myTempSensorAccessory.name = tempSensorName;
      myTempSensorAccessory.log = this.log;

      let HKTempSensorService = myTempSensorAccessory.getServiceById(
        Service.TemperatureSensor,
        'TempSensorService' + tempSensorName
      );

      if (!HKTempSensorService) {
        this.log('INFO - Creating TempSensor Service ' + tempSensorName);
        HKTempSensorService = new Service.TemperatureSensor(
          tempSensorName,
          'TempSensorService' + tempSensorName
        );
        HKTempSensorService.subtype = 'TempSensorService' + tempSensorName;
        myTempSensorAccessory.addService(HKTempSensorService);
      }

      this.bindCurrentTemperatureCharacteristic(HKTempSensorService);

      if (this.eveHistory) {
        // Eve history via fakegato-history, modeled after homebridge-weather-plus:
        // - type 'custom' derives the history signature from the characteristics
        //   actually present on the accessory (here CurrentTemperature only), so no
        //   foreign characteristic has to be added to the standard TemperatureSensor
        //   service. Apple's strict HAP validation rejected the whole bridge when a
        //   previous attempt added TemperatureDisplayUnits (type 'weather' requirement).
        // - the embedded fakegato timer stays ENABLED: it posts an (averaged or
        //   repeated) entry every 10 minutes, which Eve requires to draw a continuous
        //   curve, even though we only poll the Homiris API every refreshTimerTemperature.
        // The history service must be created AFTER the TemperatureSensor service
        // exists, since 'custom' scans the accessory services at construction time.
        if (!myTempSensorAccessory.loggingService) {
          myTempSensorAccessory.loggingService = new FakeGatoHistoryService(
            'custom',
            myTempSensorAccessory,
            {
              storage: 'fs',
              // fakegato's default filename is <hostname>_<displayName>: several
              // Homiris detectors can share a label (e.g. multiple 'Entrée'),
              // which made their histories overwrite each other. Key the file on
              // the unique serial instead, keeping the hostname prefix so test
              // and production environments don't clash.
              filename:
                os.hostname().split('.')[0] + '_' + tempSensorSerialDisplay + '_persist.json',
            }
          );
        }
        // fakegato attaches its own service onto the platform accessory: confirm THAT
        // service, otherwise cleanServices strips it at startup and addEntry writes
        // into a detached object Eve never sees.
        if (myTempSensorAccessory.loggingService.service) {
          this._confirmedServices.push(myTempSensorAccessory.loggingService.service);
        }
      }

      this._confirmedAccessories.push(myTempSensorAccessory);
      this._confirmedServices.push(HKTempSensorService);

      //this.bindTempStatusActiveCharacteristic(HKTempSensorService);
      //this.bindTempStatusLowBatteryCharacteristic(HKTempSensorService);
      //this.bindTempStatusFaultCharacteristic(HKTempSensorService);

      // Required Characteristics
      //this.addCharacteristic(Characteristic.CurrentTemperature);

      // Optional Characteristics
      //this.addOptionalCharacteristic(Characteristic.StatusActive);
      //this.addOptionalCharacteristic(Characteristic.StatusFault);
      //this.addOptionalCharacteristic(Characteristic.StatusLowBattery);
      //this.addOptionalCharacteristic(Characteristic.StatusTampered);
      //this.addOptionalCharacteristic(Characteristic.Name);
    }

    this.tempLoaded = true;

    this.cleanPlatform();
    this.updateTemperature();

    //timer for temperature background refresh
    this.refreshTemperatureBackground();
  },

  loadSecuritySystem() {
    if (this.homirisAPI.securitySystem.systemLastState) {
      this.createSecuritySystemAccessory();
      this.createSmokeSensorsAccessories();
      if (
        this.homirisAPI.securitySystem.temperature &&
        this.homirisAPI.securitySystem.temperature.nbActiveDevices > 0
      ) {
        this.homirisAPI.getTemperature();
      } else {
        this.cleanPlatform();
      }

      this.updateSecuritySystem();
      this.loaded = true;

      //timer for background refresh
      this.refreshBackground();
    } else {
      this.log('ERROR - discoverSecuritySystem - no security system found, will retry in 1 minute');

      setTimeout(() => {
        this.homirisAPI.getSecuritySystem();
      }, 60000);
    }
  },

  updateSecuritySystem() {
    for (let a = 0; a < this.foundAccessories.length; a++) {
      if (
        this.foundAccessories[a].securitySystemID &&
        this.homirisAPI.securitySystem.systemLastState
      ) {
        this.log.debug('INFO - refreshing securit System- ' + this.foundAccessories[a].name);

        let securitySystemResult = undefined;
        if (
          this.homirisAPI.securitySystem &&
          this.homirisAPI.securitySystem.id == this.foundAccessories[a].securitySystemID
        ) {
          securitySystemResult = this.homirisAPI.securitySystem.systemLastState;
        }

        if (securitySystemResult !== undefined) {
          this.refreshSecuritySystem(this.foundAccessories[a], securitySystemResult);
        } else {
          this.log(
            'ERROR - updateSecuritySystem - no result for securitySystem - ' +
              this.foundAccessories[a].name
          );
        }
      } else if (this.foundAccessories[a].smokeSensorID) {
        this.log.debug('INFO - refreshing smokeSensor - ' + this.foundAccessories[a].name);

        let smokeResults = this.homirisAPI.securitySystem.fire;
        if (smokeResults) {
          this.refreshSmokeSensor(this.foundAccessories[a], smokeResults);
        } else {
          this.log(
            'ERROR - updateSecuritySystem - no result for smokeSensor - ' +
              this.foundAccessories[a].name
          );
        }
      }
    }
  },

  updateTemperature() {
    for (let a = 0; a < this.foundAccessories.length; a++) {
      if (this.foundAccessories[a].tempSensorID && this.homirisAPI.securitySystem.temperatureInfo) {
        this.log.debug('INFO - refreshing temp Sensor - ' + this.foundAccessories[a].name);

        let tempResults = this.homirisAPI.securitySystem.temperatureInfo;
        var tempSensorResult = undefined;

        for (let b = 0; b < tempResults.length; b++) {
          if (tempResults[b].id == this.foundAccessories[a].tempSensorID) {
            tempSensorResult = tempResults[b];
            break;
          }
        }

        if (tempSensorResult !== undefined) {
          this.refreshTempSensor(this.foundAccessories[a], tempSensorResult);
        } else {
          this.log(
            'ERROR - updateSecuritySystem - no result for tempSensor - ' +
              this.foundAccessories[a].name
          );
        }
      }
    }
  },

  getCurrentSecuritySystemStateCharacteristic: function (service, callback) {
    callback(undefined, service.getCharacteristic(Characteristic.SecuritySystemCurrentState).value);
    //no operationInProgress, refresh current state
    if (service.TargetSecuritySystemStateOperationStart == undefined) {
      this.homirisAPI.getSecuritySystem();
    }

    // Characteristic.SecuritySystemCurrentState.STAY_ARM = 0;
    // Characteristic.SecuritySystemCurrentState.AWAY_ARM = 1;
    // Characteristic.SecuritySystemCurrentState.NIGHT_ARM = 2;
    // Characteristic.SecuritySystemCurrentState.DISARMED = 3;
    // Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED = 4;
  },

  getTargetSecuritySystemStateCharacteristic: function (service, callback) {
    callback(undefined, service.getCharacteristic(Characteristic.SecuritySystemTargetState).value);
    //handled through currentState

    // Characteristic.SecuritySystemTargetState.STAY_ARM = 0;
    // Characteristic.SecuritySystemTargetState.AWAY_ARM = 1;
    // Characteristic.SecuritySystemTargetState.NIGHT_ARM = 2;
    // Characteristic.SecuritySystemTargetState.DISARM = 3;
  },
  setTargetSecuritySystemtateCharacteristic: function (service, value, callback) {
    var currentValue = service.getCharacteristic(Characteristic.SecuritySystemTargetState).value;
    var currentState = service.getCharacteristic(Characteristic.SecuritySystemCurrentState).value;
    var that = this;

    callback();

    if (currentState != value) {
      if (value < Characteristic.SecuritySystemTargetState.DISARM && this.allowActivation) {
        this.log.debug(
          'INFO - SET Characteristic.SecuritySystemTargetState - ' +
            service.subtype +
            ' - SecuritySystemCurrentState is ' +
            this.homirisAPI.getStateString(currentState)
        );

        let mode = HomirisConst.DISABLED;
        if (value == Characteristic.SecuritySystemTargetState.AWAY_ARM)
          mode = HomirisConst.ACTIVATED;
        else if (
          value == Characteristic.SecuritySystemTargetState.STAY_ARM ||
          value == Characteristic.SecuritySystemTargetState.NIGHT_ARM
        )
          mode = HomirisConst.PARTIAL;

        this.homirisAPI.activateSecuritySystem(mode, function (error) {
          if (error) {
            that.endSecuritySystemOperation(service);
            that.log.debug(
              'ERROR - SET Characteristic.SecuritySystemTargetState - ' +
                service.subtype +
                ' error activating '
            );

            setTimeout(() => {
              service
                .getCharacteristic(Characteristic.SecuritySystemTargetState)
                .updateValue(currentValue);
              service
                .getCharacteristic(Characteristic.SecuritySystemCurrentState)
                .updateValue(currentState);
            }, 500);
          } else {
            that.beginSecuritySystemOperation(service, value);
            that.log.debug(
              'INFO - SET Characteristic.SecuritySystemTargetState - ' +
                service.subtype +
                ' success activating '
            );
          }
        });
      } else {
        //CANCEL - activation not allowed
        setTimeout(() => {
          service
            .getCharacteristic(Characteristic.SecuritySystemTargetState)
            .updateValue(currentValue);
          service
            .getCharacteristic(Characteristic.SecuritySystemCurrentState)
            .updateValue(currentState);
        }, 500);
      }
    }
  },

  getCurrentTemperatureCharacteristic: function (service, callback) {
    callback(undefined, service.getCharacteristic(Characteristic.CurrentTemperature).value);
    this.homirisAPI.getTemperature();
  },

  getSmokeDetectedCharacteristic: function (service, callback) {
    callback(undefined, service.getCharacteristic(Characteristic.SmokeDetected).value);

    //no operationInProgress, refresh current state
    if (service.TargetSecuritySystemStateOperationStart == undefined) {
      this.homirisAPI.getSecuritySystem();
    }
  },

  getSmokeStatusActiveCharacteristic: function (service, callback) {
    callback(undefined, service.getCharacteristic(Characteristic.StatusActive).value);
  },

  bindCurrentTemperatureCharacteristic: function (service) {
    service.getCharacteristic(Characteristic.CurrentTemperature).on(
      'get',
      function (callback) {
        this.getCurrentTemperatureCharacteristic(service, callback);
      }.bind(this)
    );
  },

  bindSmokeDetectedCharacteristic(service) {
    service.getCharacteristic(Characteristic.SmokeDetected).on(
      'get',
      function (callback) {
        this.getSmokeDetectedCharacteristic(service, callback);
      }.bind(this)
    );
  },

  bindSmokeStatusActiveCharacteristic(service) {
    service.getCharacteristic(Characteristic.StatusActive).on(
      'get',
      function (callback) {
        this.getSmokeStatusActiveCharacteristic(service, callback);
      }.bind(this)
    );
  },

  bindSecuritySystemCurrentStateCharacteristic: function (service) {
    service.getCharacteristic(Characteristic.SecuritySystemCurrentState).on(
      'get',
      function (callback) {
        this.getCurrentSecuritySystemStateCharacteristic(service, callback);
      }.bind(this)
    );
  },

  bindSecuritySystemTargetStateCharacteristic: function (service) {
    //at startup, set to currentstate to reset
    service
      .getCharacteristic(Characteristic.SecuritySystemTargetState)
      .updateValue(service.getCharacteristic(Characteristic.SecuritySystemCurrentState).value);

    service
      .getCharacteristic(Characteristic.SecuritySystemTargetState)
      .on(
        'get',
        function (callback) {
          this.getTargetSecuritySystemStateCharacteristic(service, callback);
        }.bind(this)
      )
      .on(
        'set',
        function (value, callback) {
          this.setTargetSecuritySystemtateCharacteristic(service, value, callback);
        }.bind(this)
      );
  },

  beginSecuritySystemOperation(service, state) {
    //stop timer if one exists.

    if (this.timerID !== undefined) {
      clearInterval(this.timerID);
      this.timerID = undefined;
    }

    service.TargetSecuritySystemState = state;
    service.TargetSecuritySystemStateOperationStart = Date.now();

    //start operating timer
    this.log.debug(
      'INFO - beginSecuritySystemOperation - ' + service.subtype + ' - Setting Timer for operation'
    );

    this.timerID = setInterval(() => {
      this.homirisAPI.getSecuritySystem();
    }, this.refreshTimerDuringOperation * 1000);
  },

  endSecuritySystemOperation(service) {
    //stop timer for this operation
    this.log.debug(
      'INFO - endSecuritySystemOperation - ' + service.subtype + ' - Stopping operation'
    );

    service.TargetSecuritySystemState = undefined;
    service.TargetSecuritySystemStateOperationStart = undefined;

    this.checkEndOperation();
  },

  checkEndOperation() {
    //clear timer and set background again if no other operation in progress

    if (this.timerID !== undefined) {
      let operationInProgress = false;
      for (let a = 0; a < this.foundAccessories.length; a++) {
        let mySecuritySystemAccessory = this.foundAccessories[a];
        for (let s = 0; s < mySecuritySystemAccessory.services.length; s++) {
          let service = mySecuritySystemAccessory.services[s];
          if (service.TargetSecuritySystemState !== undefined) {
            operationInProgress = true;
            break;
          }
        }
        if (operationInProgress) break;
      }

      if (!operationInProgress) {
        this.log.debug('Stopping Operation Timer ');
        clearInterval(this.timerID);
        this.timerID = undefined;
        this.refreshBackground();
      }
    }
  },

  operationMode(result) {
    if (result.securityMode == HomirisConst.DISABLED) {
      return Characteristic.SecuritySystemCurrentState.DISARMED;
    } else if (result.securityMode == HomirisConst.ACTIVATED) {
      return Characteristic.SecuritySystemCurrentState.AWAY_ARM;
    } else if (result.securityMode == HomirisConst.PARTIAL) {
      return Characteristic.SecuritySystemCurrentState.NIGHT_ARM;
    } else {
      return -1;
    }
  },

  refreshTemperatureBackground() {
    //dedicated timer for temperature sensors background refresh, independent from
    //the security system timer (not stopped/restarted around arm/disarm operations)
    if (this.refreshTimerTemperature > 0 && this.tempTimerID == undefined) {
      this.log.debug(
        'INFO - Setting Timer for temperature background refresh every : ' +
          this.refreshTimerTemperature +
          's'
      );
      this.tempTimerID = setInterval(
        () => this.homirisAPI.getTemperature(),
        this.refreshTimerTemperature * 1000
      );
    }
  },

  refreshBackground() {
    //timer for background refresh
    if (this.refreshTimer !== undefined && this.refreshTimer > 0) {
      this.log.debug(
        'INFO - Setting Timer for background refresh every  : ' + this.refreshTimer + 's'
      );
      this.timerID = setInterval(
        () => this.homirisAPI.getSecuritySystem(),
        this.refreshTimer * 1000
      );
    }
  },

  refreshSecuritySystem: function (myHomirisAccessory, result) {
    let securitySystemName = myHomirisAccessory.name;

    let HKSecurityService = myHomirisAccessory.getServiceById(
      Service.SecuritySystem,
      'SecuritySystemService' + securitySystemName
    );

    if (!HKSecurityService) {
      this.log('Error - refreshSecuritySystem - ' + securitySystemName + ' - no service found');
      return;
    }

    let currentSecurityServiceState = this.operationMode(result);

    let operationInProgress =
      HKSecurityService.TargetSecuritySystemStateOperationStart !== undefined;
    let operationInProgressIsFinished =
      operationInProgress &&
      HKSecurityService.TargetSecuritySystemState == currentSecurityServiceState;

    let oldSecurityServiceState = HKSecurityService.getCharacteristic(
      Characteristic.SecuritySystemCurrentState
    ).value;
    let oldTargetState = HKSecurityService.getCharacteristic(
      Characteristic.SecuritySystemTargetState
    ).value;

    this.log.debug(
      'INFO - refreshSecuritySystem - Got Status for : ' +
        HKSecurityService.subtype +
        ' - (currentState/operationInProgress/operationInProgressIsFinished/oldState/oldTargetState) : (' +
        currentSecurityServiceState +
        '/' +
        operationInProgress +
        '/' +
        operationInProgressIsFinished +
        '/' +
        oldSecurityServiceState +
        '/' +
        oldTargetState +
        ')'
    );

    var newSecurityServiceState = oldSecurityServiceState;
    var newTargetState = oldTargetState;

    //operation has finished or timed out
    if (operationInProgressIsFinished || this.endOperation(HKSecurityService, result)) {
      this.endSecuritySystemOperation(HKSecurityService);
      if (!operationInProgressIsFinished) {
        this.log(
          'WARNING - refreshSecuritySystem - ' +
            HKSecurityService.subtype +
            ' - operation was in progress and has timedout or no status retrieval'
        );
      }
      newSecurityServiceState = currentSecurityServiceState;
      newTargetState = currentSecurityServiceState;
    } else if (!operationInProgress && currentSecurityServiceState != oldSecurityServiceState) {
      newSecurityServiceState = currentSecurityServiceState;
      newTargetState = currentSecurityServiceState;
    }

    if (newTargetState != oldTargetState) {
      this.log.debug(
        'INFO - refreshSecuritySystem - ' +
          HKSecurityService.subtype +
          ' updating TargetState to : ' +
          newTargetState +
          '-' +
          this.homirisAPI.getStateString(newTargetState)
      );
      //TargetState before CurrentState

      setImmediate(() => {
        HKSecurityService.getCharacteristic(Characteristic.SecuritySystemTargetState).updateValue(
          newTargetState
        );
      });
    }

    if (newSecurityServiceState != oldSecurityServiceState) {
      this.log.debug(
        'INFO - refreshSecuritySystem - ' +
          HKSecurityService.subtype +
          ' updating CurrenState to : ' +
          this.homirisAPI.getStateString(newSecurityServiceState)
      );
      setImmediate(() => {
        HKSecurityService.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(
          newSecurityServiceState
        );
      });
    }
  },

  refreshTempSensor: function (myTempAccessory, result) {
    let tempSensorName = myTempAccessory.name;

    let HKTempSensorService = myTempAccessory.getServiceById(
      Service.TemperatureSensor,
      'TempSensorService' + tempSensorName
    );

    if (!HKTempSensorService) {
      this.log('Error - refreshTempSensor - ' + tempSensorName + ' - no service found');
      return;
    }

    let currentTemp = HKTempSensorService.getCharacteristic(Characteristic.CurrentTemperature)
      .value;
    let newTemp = result.temperature;

    if (newTemp != currentTemp)
      HKTempSensorService.getCharacteristic(Characteristic.CurrentTemperature).updateValue(newTemp);

    //log every refresh result (even unchanged) so the fakegato timer always has fresh data
    if (this.eveHistory && myTempAccessory.loggingService && newTemp != undefined) {
      myTempAccessory.loggingService.addEntry({
        time: Math.round(Date.now() / 1000),
        temp: newTemp,
      });
    }
  },

  refreshSmokeSensor: function (mySmokeAccessory, result) {
    let smokeSensorName = mySmokeAccessory.name;
    let HKSmokeSensorService = mySmokeAccessory.getServiceById(
      Service.SmokeSensor,
      'SmokeSensorService' + smokeSensorName
    );

    if (!HKSmokeSensorService) {
      this.log('Error - refreshSmokeSensor - ' + smokeSensorName + ' - no service found');
      return;
    }

    let currentStatus = HKSmokeSensorService.getCharacteristic(Characteristic.StatusActive).value;
    let newStatus = result.fireStatus == 'ON';

    if (currentStatus != newStatus)
      HKSmokeSensorService.getCharacteristic(Characteristic.StatusActive).updateValue(newStatus);

    var newSmokeStatus = undefined;

    let smokeDetectors = result.smokeDetectors || [];

    for (let a = 0; a < smokeDetectors.length; a++) {
      if (smokeDetectors[a].id == mySmokeAccessory.smokeSensorID) {
        newSmokeStatus = smokeDetectors[a].status != null;
        break;
      }
    }

    if (newSmokeStatus == undefined) {
      this.log(
        'Error - refreshSmokeSensor - ' +
          smokeSensorName +
          '/' +
          mySmokeAccessory.smokeSensorID +
          ' - no data found for smoke detection Status'
      );
      return;
    } else {
      let currentSmokeStatus = HKSmokeSensorService.getCharacteristic(Characteristic.SmokeDetected)
        .value;
      if (currentSmokeStatus != newSmokeStatus)
        HKSmokeSensorService.getCharacteristic(Characteristic.SmokeDetected).updateValue(
          newSmokeStatus
        );
    }
  },

  endOperation(service, result) {
    // TODO CHECK CHECK
    if (this.operationMode(result) == HomirisConst.UNKNOWN) return true;

    //timeout

    if (
      service.TargetSecuritySystemState !== undefined &&
      service.TargetSecuritySystemStateOperationStart !== undefined
    ) {
      let elapsedTime = Date.now() - service.TargetSecuritySystemStateOperationStart;
      this.log.debug(
        'INFO - CheckTimeout / result : ' +
          JSON.stringify(result) +
          ' - elapsedTime : ' +
          elapsedTime
      );
      if (elapsedTime > this.maxWaitTimeForOperation * 1000) {
        return true;
      }
    }

    return false;
  },
};
