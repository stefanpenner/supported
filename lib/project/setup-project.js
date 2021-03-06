'use strict';

const semverCoerce = require('semver/functions/coerce');
const YarnLockfile = require('@yarnpkg/lockfile');
const npa = require('npm-package-arg');
const fs = require('fs');
const path = require('path');
const debug = require('debug')('supported:project');

const npmConfig = require('../npm/config');

module.exports = async function setupProject(projectRoot) {
  const config = await npmConfig(projectRoot); // kinda slow, TODO: re-implement as standalone lib
  // const { policies } = options;
  const pkgPath = `${projectRoot}/package.json`;
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`${pkgPath} does not exist, are you sure this is a valid package?`);
  }
  if (!fs.statSync(pkgPath).isFile()) {
    throw new Error(`${pkgPath} is not a file, are you sure this is a valid package?`);
  }
  const file = fs.readFileSync(pkgPath, 'utf-8');
  let pkg;
  try {
    pkg = JSON.parse(file);
  } catch (e) {
    throw new Error(`${pkgPath} is not a valid JSON file, are you sure this is a valid package?`);
  }
  const lockfilePath = path.join(projectRoot, 'yarn.lock');
  // TODO: npm support
  const { object: lockfile } = YarnLockfile.parse(fs.readFileSync(lockfilePath, 'utf-8'));

  const dependenciesToCheck = [];
  if (pkg.dependencies) {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      const key = `${name}@${version}`;

      if (!(key in lockfile)) {
        throw new Error(`could not find: '${key}' in '${lockfilePath}'`);
      }
      if (semverCoerce(version)) {
        dependenciesToCheck.push({
          name,
          version,
          type: 'dependency',
          resolvedVersion: lockfile[key].version,
          url: getURL(name, config),
        });
      } else {
        debug('Invalid version/local link found for %o %o ', name, version);
      }
    }
  }
  if (pkg.devDependencies) {
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      const key = `${name}@${version}`;

      if (!(key in lockfile)) {
        throw new Error(`could not find: '${key}' in '${lockfilePath}'`);
      }

      if (semverCoerce(version)) {
        dependenciesToCheck.push({
          name,
          version,
          type: 'devDependency',
          resolvedVersion: lockfile[key].version,
          url: getURL(name, config),
        });
      } else {
        debug('Invalid version/local link found for %o %o ', name, version);
      }
    }
  }

  dependenciesToCheck.push(getNodeInfo(pkg));

  return {
    dependenciesToCheck,
    config,
    pkg,
  };
};

function getURL(name, config) {
  const spec = npa(name);

  let registry;
  if (spec.scope) {
    registry = config[`${spec.scope}:registry`] || config.registry;
  } else {
    registry = config.registry;
  }

  if (registry.charAt(registry.length - 1) === '/') {
    registry.slice(0, -1);
  }

  const meta = {
    name,
    registry,
  };
  debug('npmFetch[args] %o', meta);

  const url = new URL(registry);
  url.pathname = `${url.pathname}${spec.name}`;
  return url;
}

function getNodeInfo(pkg) {
  let nodeVersion = '0.0.0';
  if (pkg.volta) {
    nodeVersion = pkg.volta.node;
  } else if (pkg.engines) {
    nodeVersion = pkg.engines.node;
  }
  return {
    name: 'node',
    version: nodeVersion,
    type: 'node',
  };
}
