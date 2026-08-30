const EventEmitter = require('events');

// Consecutive failed API responses before the plugin gives up on its session and
// re-authenticates. At the 120s poll floor that is one forced re-auth per ~6min of
// outage, instead of one per poll.
const FAILURES_BEFORE_REAUTH = 3;

class HomirisAPI extends EventEmitter {
  constructor(log, platform) {
    super();

    this.log = log;
    this.login = platform.login;
    this.password = platform.password;
    this.originSession = platform.originSession;
    this.securitySystem = {};
    this._authPromise = null;
    this._consecutiveApiFailures = 0;

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

  // The WSO2 gateway in front of the Homiris API trips its circuit breaker every so
  // often (5xx with fault code 303001, 'endpoint SUSPENDED'): isolated blips that clear
  // by themselves within a poll or two. Callers that are only polling pass transient so
  // those show up as warnings. Arming never does: a refused askstart leaves the house
  // unarmed, which the user has to see at ERROR level whatever the status code.
  _logHttpFailure(label, status, body, transient) {
    var message = label + ' response (' + status + '): ' + body;
    if (transient && status >= 500) this.log.warn('WARN - ' + message);
    else this.log('ERROR - ' + message);
  }

  // idSession is only ever renewed by dropping the token, and _apiCall() self-heals just
  // two shapes (403 SESSION_EXPIREE, 401 900901). Any other status carrying a session the
  // gateway no longer accepts used to be cleared by disconnecting on every failed poll -
  // but that cost three requests per poll (token + connect + homepage) instead of one for
  // the whole length of an outage. Waiting for a few consecutive failures keeps the
  // recovery automatic while capping the extra auth traffic.
  _noteApiFailure(status) {
    if (status === 401 || status === 403) {
      this._consecutiveApiFailures = 0;
      this.disconnect();
      return;
    }

    this._consecutiveApiFailures++;
    if (this._consecutiveApiFailures >= FAILURES_BEFORE_REAUTH) {
      this.log.debug(
        'INFO - ' +
          this._consecutiveApiFailures +
          ' consecutive API failures, dropping the session to force a re-auth'
      );
      this._consecutiveApiFailures = 0;
      this.disconnect();
    }
  }

  async authenticate() {
    var now = new Date();
    if (this.access_token && this.loginExpires && this.loginExpires >= now) {
      this.log.debug(
        'INFO - already authenticated, expiration: ' + this.loginExpires + ' - ' + now
      );
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
      this._logHttpFailure('token', tokenResponse.status, body, true);
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

    var connectResponse = await fetch(this.apiURL + 'smartphone/production/1.0.0/connect', {
      method: 'POST',
      headers: {
        ...this.baseHeaders,
        Authorization: 'Bearer ' + this.access_token,
      },
      body: JSON.stringify(connectBody),
    });

    if (!connectResponse.ok) {
      var body = await connectResponse.text().catch(function () {
        return '';
      });
      this._logHttpFailure('connect', connectResponse.status, body, true);
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

  async _apiCall(pathFn, options) {
    options = options || {};
    await this.authenticate();

    var that = this;
    var doFetch = function () {
      return fetch(that.apiURL + pathFn(), {
        method: options.method || 'GET',
        headers: that._apiHeaders(),
        body: typeof options.body === 'function' ? options.body() : options.body,
      });
    };

    var response = await doFetch();

    if (response.status === 401 || response.status === 403) {
      var body = await response.text().catch(function () {
        return '';
      });
      var sessionExpired = response.status === 403 && body.indexOf('SESSION_EXPIREE') !== -1;
      var tokenInvalid = response.status === 401 && body.indexOf('900901') !== -1;
      if (sessionExpired || tokenInvalid) {
        this.log.debug(
          'INFO - ' +
            (tokenInvalid ? 'access token invalid' : 'session expired') +
            ', re-authenticating and retrying'
        );
        this.disconnect();
        await this.authenticate();
        return await doFetch();
      }
      return {
        ok: false,
        status: response.status,
        text: async function () {
          return body;
        },
        json: async function () {
          return JSON.parse(body);
        },
      };
    }

    return response;
  }

  getSecuritySystem() {
    this._getSecuritySystem().catch(function () {});
  }

  async _getSecuritySystem() {
    try {
      var that = this;
      var response = await this._apiCall(function () {
        return 'smartphone/production/1.0.0/homepage/' + that.idSession;
      });

      if (!response.ok) {
        var body = await response.text().catch(function () {
          return '';
        });
        this._logHttpFailure('status', response.status, body, true);
        this._noteApiFailure(response.status);
        this.emit('securitySystemRefreshError');
        return;
      }

      this._consecutiveApiFailures = 0;
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
      var that = this;
      var response = await this._apiCall(function () {
        return 'smartphone/production/1.0.0/temperature/followup/last/' + that.idSession;
      });

      if (!response.ok) {
        var body = await response.text().catch(function () {
          return '';
        });
        this._logHttpFailure('getTemperature', response.status, body, true);
        this._noteApiFailure(response.status);
        this.emit('securitySystemTemperatureRefreshError');
        return;
      }

      this._consecutiveApiFailures = 0;
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
    var that = this;
    var response = await this._apiCall(
      function () {
        return 'smartphone/production/1.0.0/system/askstart';
      },
      {
        method: 'POST',
        body: function () {
          return JSON.stringify({
            idSession: that.idSession,
            silentMode: false,
            interventionService: that.securitySystem.procedure === 'INTERVENTION',
            systemMode: mode,
          });
        },
      }
    );

    if (!response.ok) {
      var body = await response.text().catch(function () {
        return '';
      });
      this._logHttpFailure('activateSecuritySystem', response.status, body);
      throw new Error('Activate failed');
    }

    this.log.debug('INFO - activateSecuritySystem success');
  }
}

module.exports = {
  HomirisAPI: HomirisAPI,
};
