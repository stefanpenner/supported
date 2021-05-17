'use strict';
//check for node version as first thing
const { checkNodeCompatibility, processDate, handleInput } = require('../lib/util');
checkNodeCompatibility();

// proceed iff the node version is good.
const ora = require('ora');
const { displayResults } = require('../lib/output/cli-output');
const { processPolicies } = require('../lib/project/multiple-projects');
const { DEFAULT_SUPPORT_MESSAGE } = require('./output/messages');
const { generateCsv } = require('../lib/output/csv-output');
const { inputHasGithubPrivate } = require('./util');

async function main(cli, { policyDetails, setupProjectFn }) {
  const projectPaths = handleInput(cli.input, process.cwd());

  if (projectPaths.length === 0) {
    cli.showHelp(1);
  } else {
    const currentDate = processDate(cli.flags.currentDate) || undefined;

    const spinner = ora('working').start();
    let result;
    let processed = false;
    try {
      result = await processPolicies(projectPaths, setupProjectFn, spinner, currentDate, cli.flags);
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
        token: {
          type: 'string',
          alias: 't',
          isRequired: inputHasGithubPrivate,
        },
        hostUrl: {
          type: 'string',
        },
      },
    }),
    { policyDetails, setupProjectFn },
  );
}
