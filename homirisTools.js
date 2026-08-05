module.exports = {
  checkParameter: function (parameter, min, max, def) {
    if (parameter == undefined || parameter < min || parameter > max) return def;
    else return parameter;
  },

  // Returns a reader bound to a defaults table (homirisConfigDefaults.js): reads the
  // option from config, clamps it to the table's bounds, and LOGS when a value is
  // discarded. config.schema.json cannot express "0 or 120..3600", so the UI form
  // happily accepts an out-of-band value the plugin then replaces by the default -
  // without this warning the user sees their number in config.json and different
  // behavior in practice, with nothing to explain it.
  boundsChecker: function (defaults, log) {
    return function (name, config) {
      let spec = defaults[name];
      let value = config[name];
      if (value != undefined && (value < spec.min || value > spec.max)) {
        log(
          'WARNING - ' +
            name +
            ' : ' +
            value +
            ' is out of range (' +
            spec.min +
            '-' +
            spec.max +
            (spec.zeroDisables ? ', or 0 to disable' : '') +
            '), using the default of ' +
            spec.def
        );
      }
      return module.exports.checkParameter(value, spec.min, spec.max, spec.def);
    };
  },

  checkBoolParameter: function (parameter, def) {
    if (parameter == undefined) {
      return def;
    } else {
      if (typeof parameter === 'string') {
        switch (parameter.toLowerCase().trim()) {
          case 'true':
          case 'yes':
            return true;
          case 'false':
          case 'no':
          case null:
            return false;
          default:
            return parameter;
        }
      } else {
        return parameter;
      }
    }
  },
};
