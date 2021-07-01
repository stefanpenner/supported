'use strict';

const os = require('os');
const fetch = require('minipass-fetch');
const debug = require('debug')('supported:project');
const allSettled = require('promise.allsettled');

const { default: PQueue } = require('p-queue');
const { supportedRanges, supported } = require('../time/index');
const { isLtsOrLatest } = require('../lts');
const { sortLibraries, getLatest } = require('../util');
const CACHE = {};

module.exports = async function isInSupportWindow(
  dependenciesToCheck,
  projectName,
  { progressLogger, policies },
  today,
) {
  const queue = new PQueue({
    concurrency: os.cpus().length,
  });

  const supportChecks = [];
  const work = [];

  let isSemVerSupported = true;
  let isSemVerExpiring = false;
  for (const moduleMeta of dependenciesToCheck) {
    const { resolvedVersion, name, url } = moduleMeta;
    work.push(
      queue.add(async () => {
        // TODO: likely extract this function for testing
        // TODO: test GH/Repo

        if (name === 'node') {
          let result = isLtsOrLatest(moduleMeta, moduleMeta.version, today);
          supportChecks.push({
            ...result,
            name: name,
          });
          progressLogger.updateSpinner(
            name,
            result.isSupported,
            result.isSupported && (result.duration || result.message),
          );
          return;
        }

        try {
          // TODO: retries
          // make-promise-happen and npmFetch both leaked sockets, and I didn't have time to debug...
          let info = CACHE[url.toString()];
          if (!info) {
            debug('npmFetch[cache miss] %o', url.toString());
            debug('npmFetch[begin] %o', url.toString());
            info = await fetch(url.toString()).then(async request => {
              if (request.status === 200) {
                return request.json();
              } else if (request.status === 404) {
                // try parsing
                const { error } = await request.json();
                const e = new Error(
                  `[${error.code}][http.status=${request.status}] url:${url} ${error.summary}\n${error.details}`,
                );
                e.code = error.code;
                throw e;
              } else {
                throw new Error(`[http.status=${request.status}] url:${url}`);
              }
            });
            debug('npmFetch[end] %o', url.toString());
            CACHE[url.toString()] = info;
          } else {
            debug('npmFetch[cache hit] %o', url.toString());
          }

          let result = '';
          if (name === 'ember-cli') {
            result = isLtsOrLatest(info, resolvedVersion, today);
          } else {
            let { upgradeBudget } = policies.primary;
            let effectiveReleaseDate;
            if (policies.custom && policies.custom[name]) {
              upgradeBudget = policies.custom[name].upgradeBudget || upgradeBudget;
              effectiveReleaseDate = policies.custom[name].effectiveReleaseDate || today;
              debug(
                `name: ${name}, effectiveReleaseDate: ${effectiveReleaseDate}, upgradeBudget: ${upgradeBudget}`,
              );
            }
            result = supported(
              info,
              `${name}@${resolvedVersion}`,
              supportedRanges(
                info.time[getLatest(info, policies.ignorePrereleases)],
                upgradeBudget,
              ),
              today,
              effectiveReleaseDate,
              upgradeBudget,
              policies.ignorePrereleases,
            );
            if (isSemVerSupported && !result.isSupported) {
              isSemVerSupported = false;
            }
            if (!isSemVerExpiring && result.isSupported && result.duration) {
              isSemVerExpiring = true;
            }
          }
          supportChecks.push({
            ...result,
            name,
            resolvedVersion,
            latestVersion: getLatest(info, policies.ignorePrereleases),
          });
          progressLogger.updateSpinner(
            name,
            result.isSupported,
            result.isSupported && (result.duration || result.message),
          );
        } catch (e) {
          debug('npmFetch[fail] %o %o', url.toString(), e);
          throw e;
        }
      }),
    );
  }

  debug('npmFetch[waiting]');
  await queue.onIdle();
  for (const settled of await allSettled(work)) {
    if (settled.status === 'rejected') {
      throw settled.reason;
    }
  }
  progressLogger.updateSpinner('SemVer', isSemVerSupported, isSemVerExpiring);

  debug('npmFetch[complete]');

  supportChecks.sort(sortLibraries);

  return {
    isInSupportWindow: !supportChecks.find(({ isSupported }) => isSupported === false),
    supportChecks,
    projectName,
  };
};
