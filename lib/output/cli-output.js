'use strict';

const chalk = require('chalk');
const Table = require('cli-table');
const { isExpiringSoon } = require('../util');
const {
  LOG_TITLE,
  LOG_SEMVER_VIOLATION,
  LOG_LTS_VIOLATION,
  LOG_SEMVER_TITLE,
  LOG_POLICY_TITLE,
  DEFAULT_SUPPORT_MESSAGE,
  LOG_TITLE_MULTIPLE,
  LOG_PROJECT_TITLE,
} = require('./messages');

// CONSTANTS
const SEMVER_LIST = ['major', 'minor', 'patch'];

/**
 *
 * @param {string} type : type of semver from SEMVER_LIST / `node` / `ember-cli`
 * @returns {boolean} true/false
 */
function isSemVersion(type) {
  return SEMVER_LIST.includes(type);
}

/**
 * creates a table of content for display
 * @param {list} results : result of support check run
 * @param {flags} flags input from terminal
 * @returns {string} formatted output table in string
 */
module.exports.getBodyContent = getBodyContent;
function getBodyContent(results, flags) {
  const chars = {
    top: '',
    'top-mid': '',
    'top-left': '',
    'top-right': '',
    bottom: '',
    'bottom-mid': '',
    'bottom-left': '',
    'bottom-right': '',
    left: '',
    'left-mid': '',
    mid: '',
    'mid-mid': '',
    right: '',
    'right-mid': '',
    middle: '',
  };
  const headings = [
    chalk` {underline {bold {white Name}}}`,
    chalk`{underline {bold {white Resolved}}}`,
    chalk`{underline {bold {white Latest}}}`,
    chalk`{underline {bold {white Violation Type}}}`,
    chalk`{underline {bold {white End of Support}}}`,
  ];
  const unSupportedTable = [];
  const expiringSoonTable = [];
  const supportedTable = [];
  results.forEach(
    ({ name, resolvedVersion, latestVersion, duration, type, isSupported, deprecationDate }) => {
      if (!isSupported) {
        unSupportedTable.push([
          chalk` {red ${name}}`,
          chalk`{red ${resolvedVersion}}`,
          chalk`{red ${latestVersion}}`,
          chalk`{red ${type ? type : 'LTS'}}`,
          chalk`{red ${new Date(deprecationDate).toDateString()}}`,
        ]);
      } else {
        let expiresSoon = duration && isExpiringSoon(duration);
        if (expiresSoon) {
          expiringSoonTable.push([
            chalk` {yellow ${name}}`,
            chalk`{yellow ${resolvedVersion}}`,
            chalk`{yellow ${latestVersion}}`,
            chalk`{yellow ${type ? type : 'LTS'}}`,
            expiresSoon && chalk`{yellow ${new Date(deprecationDate).toDateString()}}`,
          ]);
        } else {
          supportedTable.push([
            chalk` {dim ${name}}`,
            chalk`{dim ${resolvedVersion}}`,
            chalk`{dim ${latestVersion}}`,
          ]);
        }
      }
    },
  );
  let table = new Table({
    chars,
    head: [...headings],
  });
  const showUnsupported = flags.verbose || flags.unsupported;
  const showExpiring = flags.verbose || flags.expiring;
  const showSupported = flags.verbose || flags.supported;
  if (unSupportedTable.length && showUnsupported) {
    table.push(...unSupportedTable);
  }
  if (expiringSoonTable.length && showExpiring) {
    table.push(...expiringSoonTable);
  }
  if (supportedTable.length && showSupported) {
    table.push(...supportedTable);
  }

  return showUnsupported || showExpiring || showSupported ? table : '';
}

/**
 *
 * @param {object} packageInfo: support check result for LTS pakcages (node & ember-cli)
 * @returns {string} if there is LTS violation, retruns formatted violation message.
 */
function getLtsViolation(packageInfo) {
  if (packageInfo) {
    return LOG_LTS_VIOLATION(
      packageInfo.name,
      packageInfo.isSupported,
      packageInfo.duration,
      packageInfo.message,
      packageInfo.resolvedVersion,
    );
  }
  return '';
}

/**
 *
 * @param {list} violatingPackages : list of all dependencies violating the semVer
 * @param {int} totalSemVerViolation: total number of semVer violation
 * @param {int} totalPackages: total number of packages in the project
 * @param {boolean | undefined} isWarning: is it only warning not violation
 * @returns {string} formatted package semver violation title string
 */
function getPackageViolationTitle(
  violatingPackages,
  totalSemVerViolation,
  totalPackages,
  isWarning,
) {
  if (violatingPackages.length) {
    return LOG_SEMVER_TITLE(totalSemVerViolation, totalPackages, isWarning);
  }
  return '';
}

/**
 *
 * @param {list} violatingPackages : list of all dependencies violating the semVer
 * @param {number} totalPackagesCount: total number of dependencies
 * @param {boolean | undefined} isWarning: is it only warning not violation
 * @returns {string} formatted package semver violation title + body string
 */
function getPackageViolation(violatingPackages, totalPackagesCount, isWarning) {
  let message = '';
  if (violatingPackages.length) {
    let { violations, violationInfo } = getViolationsDetail(violatingPackages);
    let totalSemVerViolation = violations['total'];
    delete violations['total'];
    message += getPackageViolationTitle(
      violatingPackages,
      totalSemVerViolation,
      totalPackagesCount,
      isWarning,
    );
    Object.keys(violations).forEach(type => {
      let dataObject = isWarning ? violationInfo : violations;
      if (dataObject[type]) {
        message += LOG_SEMVER_VIOLATION(type, violations[type], violationInfo[type], isWarning);
      }
    });
  }
  return message;
}

/**
 *
 * @param {int} violatingPackageCount number of violating node moduels packages
 * @param {list} ltsPackages list of all LTS pakcages (node and ember-cli)
 * @returns {int} total number of expiring and violating packages
 */
function violatedOrSoonExpiringPackagesCount(violatingPackageCount, ltsPackages) {
  let count = ltsPackages.reduce((count, pkg) => {
    if (pkg) {
      let { isSupported, duration, message } = pkg;
      if (!isSupported || (isSupported && (duration || message))) {
        count++;
      }
    }
    return count;
  }, 0);
  return violatingPackageCount + count;
}
/**
 *
 * @param {*} isInSupportWindow
 */
module.exports.isProjectExpiringSoon = isProjectExpiringSoon;
function isProjectExpiringSoon(result) {
  const { expiresSoon, emberPackage, nodePackage } = getCategorisedList(result.supportChecks);
  let violatedOrSoonExpiringCount = violatedOrSoonExpiringPackagesCount(expiresSoon.length, [
    emberPackage,
    nodePackage,
  ]);
  return violatedOrSoonExpiringCount > 0;
}
/**
 *
 * @param {boolean} isInSupportWindow is the project in support window or not
 * @param {list} expiresSoon list of expiring soon packages
 * @param {object} flags: flags passed in command line
 * @param {object} nodePackage support check info of package node
 * @param {object} emberPackage support check info of package ember
 *
 * @returns {string} foramtted title for the support check run
 */
module.exports.getTitle = getTitle;
function getTitle(isInSupportWindow, expiresSoon, flags, nodePackage, emberPackage) {
  let violatedOrSoonExpiringCount = violatedOrSoonExpiringPackagesCount(expiresSoon.length, [
    emberPackage,
    nodePackage,
  ]);
  return chalk`${LOG_TITLE(isInSupportWindow, violatedOrSoonExpiringCount, flags.verbose)}`;
}

/**
 *
 * @param {boolean} isInSupportWindow is the project in support window or not
 * @param {list} unsupportedPackages list of unsupported packages
 * @param {list} supportedPackages list of supported packages
 * @param {list} expiresSoon list of expiring soon packages
 * @param {object} nodePackage support check info of package node
 * @param {object} emberPackage support check info of package ember
 * @param {string} currentPolicy current support policy detail
 *
 * @returns {string} head for the support check run
 */
module.exports.getHead = getHead;
function getHead(
  isInSupportWindow,
  unsupportedPackages,
  supportedPackages,
  expiresSoon,
  nodePackage,
  emberPackage,
  currentPolicy,
) {
  let head = '';
  let violatedOrSoonExpiringCount = violatedOrSoonExpiringPackagesCount(expiresSoon.length, [
    emberPackage,
    nodePackage,
  ]);
  if (!isInSupportWindow) {
    let policyCount = 1 + (emberPackage ? 1 : 0) + (nodePackage ? 1 : 0);
    let violationCount = unsupportedPackages.length ? 1 : 0;
    violationCount +=
      (emberPackage && !emberPackage.isSupported ? 1 : 0) +
      (nodePackage && !nodePackage.isSupported ? 1 : 0);
    head += chalk`
      ${LOG_POLICY_TITLE(violationCount, policyCount)}`;
  }
  let totalPackagesCount =
    unsupportedPackages.length + supportedPackages.length + expiresSoon.length;
  if (violatedOrSoonExpiringCount || !isInSupportWindow) {
    let nodeViolation = getLtsViolation(nodePackage);
    let emberViolation = getLtsViolation(emberPackage);
    let packageViolation = getPackageViolation(unsupportedPackages, totalPackagesCount);
    if (!packageViolation) {
      packageViolation = getPackageViolation(expiresSoon, totalPackagesCount, true);
    }

    head += chalk`
    ${nodeViolation}
    ${emberViolation ? `${emberViolation}\n    ` : ''}${packageViolation}
    ${currentPolicy}`;
  }
  return head;
}

/**
 *
 * @param {object} supportResult : support check result
 *
 */
module.exports.makeConsoleReport = makeConsoleReport;
function makeConsoleReport(supportResult, flags, supportMessage) {
  const isInSupportWindow = supportResult.isInSupportWindow;
  const currentPolicy = supportMessage ? supportMessage : DEFAULT_SUPPORT_MESSAGE();
  let {
    expiresSoon,
    unsupportedPackages,
    nodePackage,
    emberPackage,
    supportedPackages,
  } = getCategorisedList(supportResult.supportChecks);

  const title = getTitle(isInSupportWindow, expiresSoon, flags, nodePackage, emberPackage);

  const head = getHead(
    isInSupportWindow,
    unsupportedPackages,
    supportedPackages,
    expiresSoon,
    nodePackage,
    emberPackage,
    currentPolicy,
  );

  const body = getBodyContent(supportResult.supportChecks, flags);

  return {
    title,
    head,
    body,
  };
}

/**
 * This function will generate each semver violation count and duration
 * @param {list} supportChecks resulting list from support check run for packages
 * @returns {object} violations: counts the number of violation for each semVers
 * violationInfo: max number of duration for each semVer violation or message for the violation
 */
function getViolationsDetail(supportChecks) {
  let violations = {
    major: 0,
    minor: 0,
    patch: 0,
    total: 0,
  };
  let violationInfo = {
    major: 0,
    minor: 0,
    patch: 0,
  };

  supportChecks.forEach(({ type, isSupported, duration, message }) => {
    let isSemVer = isSemVersion(type);
    let isDeprecatingSoon = isSupported && (duration || message);
    if (!isSupported || isDeprecatingSoon) {
      if (isSemVer) {
        violations[type] += 1;
      }
      violations['total'] += 1;
    }
    if (!isSupported || isDeprecatingSoon) {
      // store the largest voliation for a type
      if (violationInfo[type] < duration || (isDeprecatingSoon && isSemVer)) {
        violationInfo[type] = duration || message;
      } else if (!isSemVer) {
        // for node and ember display the message about LTS
        violationInfo[type] = message;
      }
    }
  });
  return {
    violations,
    violationInfo,
  };
}

/**
 * Categorises entire list into separate list based on type of violation
 * @param {list} pkgList : list of all packages processed by support check
 * @returns {object} object contains expiresSoon
    unsupportedPackages,
    nodePackage,
    emberPackage,
    supportedPackages
 */
module.exports.getCategorisedList = getCategorisedList;
function getCategorisedList(pkgList) {
  let expiresSoon = [];
  let unsupportedPackages = [];
  let nodePackage = [];
  let emberPackage;
  let supportedPackages = [];
  pkgList.forEach(pkg => {
    let { isSupported, duration, name } = pkg;
    if (name === 'node') {
      nodePackage = pkg;
    } else if (name === 'ember-cli') {
      emberPackage = pkg;
    } else if (isSupported && duration) {
      expiresSoon.push(pkg);
    } else if (isSupported) {
      supportedPackages.push(pkg);
    } else if (!isSupported) {
      unsupportedPackages.push(pkg);
    }
  });
  return {
    expiresSoon,
    unsupportedPackages,
    nodePackage,
    emberPackage,
    supportedPackages,
  };
}

/**
 * Outputs the result of support run on terminal
 * @param {object} supportResult: result from support check run
 * @param {object} flags: flags passed in command line
 * @param {string} supportMessage: custom support policy message
 *
 */
module.exports.displayResult = displayResult;
function displayResult(supportResult, flags, supportMessage) {
  const { title, head, body } = makeConsoleReport(supportResult, flags, supportMessage);
  let readjustedBody = body;
  if (body) {
    readjustedBody = `\n${readjustedBody}`;
  }
  console.log(`${title}${head}${readjustedBody}`);
}

module.exports.displayResults = displayResults;
function displayResults(results, flags, policyDetails) {
  if (results.projects.length == 1) {
    return displayResult(results.projects[0], flags, policyDetails);
  }
  let finalOutput = `${LOG_TITLE_MULTIPLE(
    results.isInSupportWindow,
    results.expiringSoonCount,
  )}\n\n`;
  if (results.projects.length > 1 && (flags.unsupported || flags.supported || flags.expiring)) {
    let tempList = [];
    if (flags.unsupported) {
      tempList.push.apply(
        tempList,
        results.projects.filter(result => !result.isInSupportWindow),
      );
    }
    if (flags.supported) {
      tempList.push.apply(
        tempList,
        results.projects.filter(result => result.isInSupportWindow),
      );
    }
    if (flags.expiring) {
      tempList.push.apply(
        tempList,
        results.projects.filter(result => result.isExpiringSoon),
      );
    }
    results.projects = tempList;
  }
  results.projects.forEach(result => {
    const { head } = makeConsoleReport(result, {}, '  ');
    finalOutput += LOG_PROJECT_TITLE(
      result.isInSupportWindow,
      result.projectName,
      result.isExpiringSoon,
    );
    if (head && flags.verbose) {
      // remove the newlines in both the ends of head so that we can place the
      // head with right amount of tabs
      let trimmedHead = head.replace(/^\s+|\s+$/g, '');
      finalOutput += `\n    ${trimmedHead}`;
    }
    finalOutput += '\n';
  });
  finalOutput += `  ${policyDetails}`;
  console.log(finalOutput);
}
