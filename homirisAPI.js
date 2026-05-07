const EventEmitter = require('events');

class HomirisAPI extends EventEmitter {
  constructor(log, platform) {
    super();

    this.log = log;
    this.login = platform.login;
    this.password = platform.password;
    this.originSession = platform.originSession;
    this.securitySystem = {};
    this._authPromise = null;

    this.apiURL = 'https://y41hsspp-mobile.eps-api.com/';

    this.tokenHeaders = {
      Accept: '*/*',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic NHhSOG1LZFk5OFBRalpkNU1NUzJRNWZYWl9RYTpEajkwbF9IOGs3WGJvZ1pTbzl3MUxTemxOZ01h',
    };

    this.baseHeaders = {
      Accept: '*/*',
      'Content-Type': 'application/json',
      'User-Agent': 'Homiris/4.35.3',
      'Eps-Ctx-Username': this.login,
      'Eps-Ctx-Source': 'MOB-ABO',
    };
  }

  getStateString(state) {
    if (state == 0) return 'STAY_ARM';
    else if (state == 1) return 'AWAY_ARM';
    else if (state == 2) return 'NIGHT_ARM';
    else if (state == 3) return 'DISARMED';
    else if (state == 4) return 'ALARM_TRIGGERED';
    else return 'UNKNOWN(' + state + ')';
  }

  disconnect() {
    this.access_token = undefined;
    this.loginExpires = undefined;
  }

  async authenticate() {
    var now = new Date();
    if (this.access_token && this.loginExpires && this.loginExpires >= now) {
      this.log.debug('INFO - already authenticated, expiration: ' + this.loginExpires + ' - ' + now);
      return;
    }

    if (this._authPromise) return this._authPromise;

    this._authPromise = this._doAuthenticate();
    try {
      await this._authPromise;
    } finally {
      this._authPromise = null;
    }
  }

  async _doAuthenticate() {
    this.log.debug('INFO - authenticating');

    var tokenResponse = await fetch(this.apiURL + 'token', {
      method: 'POST',
      headers: this.tokenHeaders,
      body: 'grant_type=client_credentials&scope=PRODUCTION',
    });

    if (!tokenResponse.ok) {
      var body = await tokenResponse.text().catch(function () {
        return '';
      });
      this.log('ERROR - token response (' + tokenResponse.status + '): ' + body);
      throw new Error('Token request failed');
    }

    var tokenResult = await tokenResponse.json();
    this.log.debug('INFO - token received, expires_in: ' + tokenResult.expires_in);

    this.access_token = tokenResult.access_token;
    this.loginExpires = new Date();
    this.loginExpires.setMilliseconds(
      this.loginExpires.getMilliseconds() + tokenResult.expires_in * 1000 - 30000
    );

    var connectBody = {
      application: 'SMARTPHONE',
      login: this.login,
      pwd: this.password,
      typeDevice: 'SMARTPHONE',
      originSession: this.originSession,
      phoneType: '',
      codeLanguage: 'FR',
      version: '',
      timestamp: '0',
      system: '',
    };

    var connectResponse = await fetch(
      this.apiURL + 'smartphone/production/1.0.0/connect',
      {
        method: 'POST',
        headers: {
          ...this.baseHeaders,
          Authorization: 'Bearer ' + this.access_token,
        },
        body: JSON.stringify(connectBody),
      }
    );

    if (!connectResponse.ok) {
      var body = await connectResponse.text().catch(function () {
        return '';
      });
      this.log('ERROR - connect response (' + connectResponse.status + '): ' + body);
      this.disconnect();
      throw new Error('Connect request failed');
    }

    var connectResult = await connectResponse.json();
    this.log.debug('INFO - connected, idSession: ' + connectResult.idSession);

    this.idSession = connectResult.idSession;
    this.securitySystem.name = connectResult.sites[0].title;
    this.securitySystem.procedure = connectResult.sites[0].procedure;
    this.securitySystem.model = this.originSession;
    this.securitySystem.id = connectResult.sites[0].title;
  }

  _apiHeaders() {
    return {
      ...this.baseHeaders,
      Authorization: 'Bearer ' + this.access_token,
    };
  }

  getSecuritySystem() {
    this._getSecuritySystem().catch(function () {});
  }

  async _getSecuritySystem() {
    try {
      await this.authenticate();

      var response = await fetch(
        this.apiURL + 'smartphone/production/1.0.0/homepage/' + this.idSession,
        {method: 'GET', headers: this._apiHeaders()}
      );

      if (!response.ok) {
        var body = await response.text().catch(function () {
          return '';
        });
        this.log('ERROR - status response (' + response.status + '): ' + body);
        this.disconnect();
        this.emit('securitySystemRefreshError');
        return;
      }

      var body = await response.json();
      this.log.debug('INFO - status body: ' + JSON.stringify(body));

      this.securitySystem.security = body.security;
      this.securitySystem.fire = body.fire;
      this.securitySystem.temperature = body.temperature;
      this.securitySystem.systemLastState = body.systemLastState;
      this.emit('securitySystemRefreshed');
    } catch (err) {
      this.log('ERROR - getSecuritySystem: ' + err.message);
      this.emit('securitySystemRefreshError');
    }
  }

  getTemperature() {
    this._getTemperature().catch(function () {});
  }

  async _getTemperature() {
    try {
      await this.authenticate();

      var response = await fetch(
        this.apiURL +
          'smartphone/production/1.0.0/temperature/followup/last/' +
          this.idSession,
        {method: 'GET', headers: this._apiHeaders()}
      );

      if (!response.ok) {
        var body = await response.text().catch(function () {
          return '';
        });
        this.log('ERROR - getTemperature response (' + response.status + '): ' + body);
        this.disconnect();
        this.emit('securitySystemTemperatureRefreshError');
        return;
      }

      var body = await response.json();
      this.log.debug('INFO - temperature body: ' + JSON.stringify(body));

      this.securitySystem.temperatureInfo = body.statements;
      this.emit('securitySystemTemperatureRefreshed');
    } catch (err) {
      this.log('ERROR - getTemperature: ' + err.message);
      this.emit('securitySystemTemperatureRefreshError');
    }
  }

  activateSecuritySystem(mode, callback) {
    this._activateSecuritySystem(mode)
      .then(function () {
        callback(false);
      })
      .catch(function () {
        callback(true);
      });
  }

  async _activateSecuritySystem(mode) {
    await this.authenticate();

    var jsonBody = {
      idSession: this.idSession,
      silentMode: false,
      interventionService: this.securitySystem.procedure === 'INTERVENTION',
      systemMode: mode,
    };

    var response = await fetch(this.apiURL + 'smartphone/production/1.0.0/system/askstart', {
      method: 'POST',
      headers: this._apiHeaders(),
      body: JSON.stringify(jsonBody),
    });

    if (!response.ok) {
      var body = await response.text().catch(function () {
        return '';
      });
      this.log('ERROR - activateSecuritySystem response (' + response.status + '): ' + body);
      throw new Error('Activate failed');
    }

    this.log.debug('INFO - activateSecuritySystem success');
  }
}

module.exports = {
  HomirisAPI: HomirisAPI,
};
