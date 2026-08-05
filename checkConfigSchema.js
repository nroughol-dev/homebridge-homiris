// Guards the three-way duplication of every option: homirisConfigDefaults.js (the
// source of truth), config.schema.json (the Homebridge UI form) and the readme.md
// field table. Run by `npm test`; no dependencies, no node_modules required.
//
// Two classes of drift are caught here because nothing else can catch them - there
// is no lint, no build and no test suite:
//   1. a default or bound edited in one file and not the others (0.4.4 shipped
//      maxWaitTimeForOperation out of sync, Unreleased shipped
//      refreshTimerDuringOperation out of sync)
//   2. an option index.js reads from config but that has no field in the UI form,
//      which makes it unreachable for anyone who is not editing config.json by hand
//      (cleanCache was in that state from the fork until 0.4.5)

const fs = require('fs');
const path = require('path');

const DEFAULTS = require('./homirisConfigDefaults.js');
const SCHEMA = require('./config.schema.json').schema.properties;

const readme = fs.readFileSync(path.join(__dirname, 'readme.md'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');

const errors = [];

for (const name of Object.keys(DEFAULTS)) {
  const spec = DEFAULTS[name];
  const field = SCHEMA[name];

  if (!field) {
    errors.push(name + ' : missing from config.schema.json');
    continue;
  }

  // the sentinel 0 (polling off) lives outside min..max, so the form has to accept it
  const expectedMinimum = spec.zeroDisables ? 0 : spec.min;

  if (field.default !== spec.def) {
    errors.push(
      name + ' : config.schema.json default is ' + field.default + ', expected ' + spec.def
    );
  }
  if (field.minimum !== expectedMinimum) {
    errors.push(
      name + ' : config.schema.json minimum is ' + field.minimum + ', expected ' + expectedMinimum
    );
  }
  if (field.maximum !== spec.max) {
    errors.push(
      name + ' : config.schema.json maximum is ' + field.maximum + ', expected ' + spec.max
    );
  }

  const row = readme.split('\n').find((line) => line.startsWith('| `' + name + '`'));
  if (!row) {
    errors.push(name + ' : missing from the readme.md field table');
  } else if (!row.includes('`' + spec.def + '`')) {
    errors.push(name + ' : readme.md field table does not document the default of ' + spec.def);
  }
}

// every config key index.js reads must be settable from the UI form
const readFromConfig = new Set();
const configRead = /config\['([a-zA-Z0-9_]+)'\]/g;
let match;
while ((match = configRead.exec(indexSource)) !== null) {
  readFromConfig.add(match[1]);
}

for (const name of readFromConfig) {
  if (!SCHEMA[name]) {
    errors.push(name + " : read by index.js (config['" + name + "']) but absent from the UI form");
  }
}

if (errors.length > 0) {
  console.error('Config drift detected (homirisConfigDefaults.js is the source of truth):');
  for (const error of errors) {
    console.error('  - ' + error);
  }
  process.exit(1);
}

console.log(
  'Config schema, defaults table and readme agree (' +
    Object.keys(DEFAULTS).length +
    ' bounded options, ' +
    readFromConfig.size +
    ' config keys).'
);
