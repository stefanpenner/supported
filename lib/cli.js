'use strict';
//check for node version as first thing
const { checkNodeCompatibility, processDate, handleInput } = require('../lib/util');
checkNodeCompatibility();

// proceed iff the node version is good.
const ora = require('ora');
const fs = require('fs');
const { displayResults } = require('../lib/output/cli-output');
const { processPolicies } = require('../lib/project/multiple-projects');
const { DEFAULT_SUPPORT_MESSAGE } = require('./output/messages');
const { generateCsv } = require('../lib/output/csv-output');
const { DEFAULT_PRIMARY_POLICY } = require('./util');

async function main(cli, { policyDetails, setupProjectFn }) {
  const projectPaths = handleInput(cli.input, process.cwd());

  if (projectPaths.length === 0) {
    cli.showHelp(1);
  } else {
    const currentDate = processDate(cli.flags.currentDate) || undefined;
    const ignoredDependencies = [];
    let policies = {
      primary: DEFAULT_PRIMARY_POLICY,
    };
    if (cli.flags.configFile) {
      let configFile = fs.readFileSync(cli.flags.configFile, 'utf-8');
      let configuredPolicies = JSON.parse(configFile);

      require('./validate-config')(configuredPolicies);
      policies.ignorePrereleases = configuredPolicies.ignorePrereleases;
      if (configuredPolicies.primary) {
        policies.primary = configuredPolicies.primary;
        if (configuredPolicies.primary.ignoredDependencies) {
          ignoredDependencies.push(...configuredPolicies.primary.ignoredDependencies);
        }
      }
      if (configuredPolicies.custom) {
        policies.custom = {};
        configuredPolicies.custom.forEach(policy => {
          policy.dependencies.forEach(dep => {
            if (policies.custom[dep]) {
              throw new Error(
                `The dependency ${dep} was found multiple times in the config file. Please refer Rules section in configuration.md`,
              );
            }
            if (ignoredDependencies.includes(dep)) {
              throw new Error(
                `The dependency ${dep} was found in ignoredDependencies and custom configuration. Please refer Rules section in configuration.md`,
              );
            }
            policies.custom[dep] = {
              upgradeBudget: policy.upgradeBudget,
              effectiveReleaseDate:
                policy.effectiveReleaseDate && new Date(policy.effectiveReleaseDate),
            };
          });
        });
      }
    }

    const spinner = ora('working').start();
    let result;
    let processed = false;
    try {
      result = await processPolicies(
        projectPaths,
        setupProjectFn,
        spinner,
        currentDate,
        policies,
        ignoredDependencies,
      );
      if (result.isInSupportWindow === false) {
        process.exitCode = 1;
      }
      processed = true;
    } finally {
      if (processed) {
        spinner.stopAndPersist({
          symbol: '✨',
        });
      } else {
        spinner.stop({
          symbol: '✨',
        });
      }
    }

    if (cli.flags.json && result) {
      console.log(JSON.stringify(result, null, 2));
    } else if (cli.flags.csv && result) {
      generateCsv(projectPaths, result, policyDetails);
    } else {
      displayResults(result, cli.flags, policyDetails);
    }
  }
}

/**
 *
 * @param {string} policyDetails Custom message that needs to be passed regarding the support audit run
 * @param {*} setupProjectFn if the way project is setup is different then use this method to override.
 */
module.exports = run;
async function run(
  policyDetails = DEFAULT_SUPPORT_MESSAGE(),
  setupProjectFn,
  help = require('./help')(),
) {
  await main(
    require('meow')(help, {
      flags: {
        verbose: {
          type: 'boolean',
          alias: 'd',
        },
        json: {
          type: 'boolean',
          alias: 'j',
        },
        unsupported: {
          type: 'boolean',
          alias: 'u',
        },
        supported: {
          type: 'boolean',
          alias: 's',
        },
        expiring: {
          type: 'boolean',
          alias: 'e',
        },
        currentDate: {
          type: 'string',
          alias: 'c',
        },
        configFile: {
          type: 'string',
          alias: 'f',
        },
      },
    }),
    { policyDetails, setupProjectFn },
  );
}
