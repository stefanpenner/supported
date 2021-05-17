'use strict';

const { expect, Assertion } = require('chai');
const execa = require('execa');
const { getBinPath } = require('get-bin-path');
const fs = require('fs');
const registries = require('./test-helpers/registries');
const { join } = require('path');

Assertion.addMethod('exitGracefully', function () {
  const { exitCode } = this._obj;
  this.assert(
    exitCode === 0,
    `expected command to exit gracefully, but got: '${exitCode}'\noutput: \n\n #{act}`,
    `expected command to not exit gracefully, but got: '${exitCode}'\noutput: \n\n #{act}`,
  );
});

async function runSupportedCmd(inputArgs, options = {}) {
  let args = [await getBinPath()];

  if (Array.isArray(inputArgs)) {
    args = [...args, ...inputArgs];
  }

  return execa('node', args, {
    shell: true,
    reject: false,
    cwd: `${__dirname}/../`,
    ...options,
  });
}

describe('CLI', function () {
  // TODO: Check if we can remove this timeout increase and fix the npm config logic to be fast
  // Test in windows are failing
  // Issue may be caused by npmconfig command we have in the code base. For now we are increasing the timeout.
  this.timeout(4000);
  let FILE_SERVER_PORT_1 = 3005;
  beforeEach(function () {
    registries.startAll([
      {
        name: 'supported-project',
        recordingRoot: `./tests/fixtures/supported-project`,
        port: FILE_SERVER_PORT_1,
      },
    ]);
  });

  afterEach(function () {
    registries.stopAll();
  });

  it('exits with status code 0 if no arguments are passed, but cwd is in a valid project', async function () {
    const child = await runSupportedCmd([], {
      cwd: `${__dirname}/fixtures/supported-project`,
    });

    expect(child).to.exitGracefully();
    expect(child.stderr).to.includes('✓ SemVer Policy');
    expect(child.stdout).to.includes('Congrats!');
  });

  it('exits with status code 1 if no arguments are passed, but cwd is NOT in a valid project (invalid project-folder)', async function () {
    const child = await runSupportedCmd([], {
      cwd: `${__dirname}/fixtures/invalid-project-folder`,
    });

    expect(child).to.not.exitGracefully();
    expect(child.stderr).to.not.includes('✓ SemVer Policy');
    expect(child.stdout).to.includes('supported');
  });

  it('exits with status code 1 if no arguments are passed, but cwd is NOT in a valid project (package.json is a folder)', async function () {
    const child = await runSupportedCmd([], {
      cwd: `${__dirname}/fixtures/package-is-folder`,
    });

    expect(child).to.not.exitGracefully();
  });

  describe('default output', function () {
    it('works against a fully supported project', async function () {
      const child = await runSupportedCmd([`${__dirname}/fixtures/supported-project`]);

      expect(child).to.exitGracefully();
      expect(child.stderr).to.includes('✓ SemVer Policy');
      expect(child.stdout).to.includes('Congrats!');
    });

    it('works against a unsupported project', async function () {
      const child = await runSupportedCmd([`${__dirname}/fixtures/unsupported-project`]);

      expect(child).to.not.exitGracefully();
      expect(child.stderr).to.includes('✗ SemVer Policy');
      expect(child.stdout).to.includes('Support Policy Problem Detected!');
      expect(child.stdout).to.includes(
        '✗ SemVer Policy (3 violations in 4 dependencies)\n      ✗ major version [3 dependencies up-to',
      );
    });

    it('works against a version expires soon project', async function () {
      const child = await runSupportedCmd([
        `${__dirname}/fixtures/version-expire-soon`,
        '--current-date="March 31, 2021"',
      ]);

      expect(child).to.exitGracefully();
      expect(child.stderr).to.includes('⚠ SemVer Policy');
      expect(child.stdout).to.includes('⚠ Warning!');
      expect(child.stdout).to.includes(
        '⚠ node LTS Policy\n      ⚠ version/version-range 10.0.0 will be deprecated within 1 qtr',
      );
      expect(child.stdout).to.includes(
        '⚠ SemVer Policy (1 in 4 dependencies will expire soon) \n      ⚠ major [1 dependency will expire within',
      );
    });

    it('works against a no node version project', async function () {
      const child = await runSupportedCmd([`${__dirname}/fixtures/no-node-version`]);

      expect(child).to.exitGracefully();
      expect(child.stderr).to.includes('⚠ node LTS Policy');
      expect(child.stdout).to.includes('⚠ Warning!');
      expect(child.stdout).to.includes(
        '⚠ node LTS Policy\n      ⚠ No node version mentioned in the package.json. Please add engines/volta',
      );
    });

    it('works against multiple project', async function () {
      const child = await runSupportedCmd([
        `${__dirname}/fixtures/supported-project`,
        `${__dirname}/fixtures/unsupported-project`,
      ]);

      expect(child).to.not.exitGracefully();
      expect(child.stderr).to.includes('✓ supported-project');
      expect(child.stderr).to.includes('✗ unsupported-project');
      expect(child.stdout).to.includes('Support Policy Problem Detected!');
      expect(child.stdout).to.includes('✗ unsupported-project');
      expect(child.stdout).to.includes('✓ supported-project');
    });

    it('works against a fully supported project with hosturl', async function () {
      const child = await runSupportedCmd([
        `supported-project`,
        '--hostUrl',
        `http://localhost:${FILE_SERVER_PORT_1}/`,
      ]);
      expect(child.exitCode).to.eql(0);
      expect(child.stderr).to.includes('✓ SemVer Policy');
      expect(child.stdout).to.includes('Congrats!');
    });

    it('error out when token not passed for github private instance', async function () {
      const child = await runSupportedCmd([
        `https://test.githubprivate.com/stefanpenner/supported`,
      ]);
      expect(child.exitCode).to.eql(2);
      expect(child.stderr).to.includes('Missing required flag\n\t--token, -t');
      expect(child.stdout).to.includes(
        `Private instances of github needs token. To generate token follow https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token`,
      );
    });

    it('error out with clear message when url is not reachable', async function () {
      const child = await runSupportedCmd([
        `https://test.githubprivate.com/stefanpenner/supported`,
        '-t',
        'abac',
      ]);
      expect(child.exitCode).to.eql(1);
      expect(child.stderr).to.includes(`Couldn't reach server, please check the URL provided`);
    });
  });

  describe('--verbose', function () {
    it('works against a unsupported project', async function () {
      const child = await runSupportedCmd([
        `${__dirname}/fixtures/unsupported-project`,
        '--verbose',
      ]);

      expect(child).to.not.exitGracefully();
      expect(child.stderr).to.includes('✗ SemVer Policy');
      expect(child.stdout).to.includes('Support Policy Problem Detected!');
      expect(child.stdout).to.includes(
        '@eslint-ast/eslint-plugin-graphql  1.0.4                          1.0.4',
      );
      expect(child.stdout).to.includes(
        '@stefanpenner/a                    1.0.3                          2.0.0   major',
      );
    });

    it('works against a supported project', async function () {
      const child = await runSupportedCmd([`${__dirname}/fixtures/supported-project`, '-d']);

      expect(child).to.exitGracefully();
      expect(child.stderr).to.includes('✓ SemVer Policy');
      expect(child.stdout).to.includes('Congrats!');
      expect(child.stdout).to.includes('es6-promise');
      expect(child.stdout).to.includes('@eslint-ast/eslint-plugin-graphql');
    });

    it('works against a version expires soon project', async function () {
      const child = await runSupportedCmd([
        `${__dirname}/fixtures/version-expire-soon`,
        '--verbose',
        '--current-date="March 31, 2021"',
      ]);

      expect(child).to.exitGracefully();
      expect(child.stderr).to.includes('⚠ SemVer Policy');
      expect(child.stdout).to.includes('⚠ Warning!');
      expect(child.stdout).to.includes(
        `@stefanpenner/b                    1.0.3     2.0.0   major`,
      );
      expect(child.stdout).to.includes(`node                               10.0.0    >=14.*  LTS`);
    });
  });

  describe('Filter options like --unsupported/expiring/supported', function () {
    it('works against a unsupported project with --unsupported option', async function () {
      const child = await runSupportedCmd([
        `${__dirname}/fixtures/unsupported-project`,
        '--unsupported',
      ]);

      expect(child).to.not.exitGracefully();
      expect(child.stderr).to.includes('✗ SemVer Policy');
      expect(child.stdout).to.includes('Support Policy Problem Detected!');
      expect(child.stdout).to.includes('es6-promise      3.3.1     4.2.8   major');
    });

    it('works against a unsupported project with --supported option', async function () {
      const child = await runSupportedCmd([
        `${__dirname}/fixtures/unsupported-project`,
        '--supported',
      ]);

      expect(child).to.not.exitGracefully();
      expect(child.stderr).to.includes('✗ SemVer Policy');
      expect(child.stdout).to.includes('Support Policy Problem Detected!');
      expect(child.stdout).to.includes('@eslint-ast/eslint-plugin-graphql  1.0.4     1.0.4');
    });

    it('works against a unsupported project with --expiring option', async function () {
      const child = await runSupportedCmd([
        `${__dirname}/fixtures/version-expire-soon`,
        '--expiring',
        '--current-date="March 31, 2021"',
      ]);

      expect(child).to.exitGracefully();
      expect(child.stderr).to.includes('- working');
      expect(child.stdout).to.includes('⚠ Warning!');
      expect(child.stdout).to.includes('@stefanpenner/b  1.0.3     2.0.0   major');
    });
  });

  describe('--csv', function () {
    afterEach(function () {
      let filePath = `${__dirname}/fixtures/unsupported-project/unsupported-project-support-audit.csv`;
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

    it('works against a unsupported project', async function () {
      const child = await runSupportedCmd([
        `${__dirname}/fixtures/unsupported-project`,
        '--csv',
        '--current-date="March 31, 2021"',
      ]);

      expect(child).to.not.exitGracefully();
      expect(child.stderr).to.includes('✗ SemVer Policy');
      expect(child.stdout).to.includes(
        `Report for unsupported-project created at ${join(
          __dirname,
          `/fixtures/unsupported-project/`,
        )}`,
      );
    });
  });

  describe('--json', function () {
    it('works against a fully supported project', async function () {
      const child = await runSupportedCmd([`${__dirname}/fixtures/supported-project`, '--json']);

      expect(child).to.exitGracefully();
      expect(child.stderr).to.includes('✓ SemVer Policy');
      let result = JSON.parse(child.stdout);
      expect(result).to.eql({
        expiringSoonCount: 0,
        isInSupportWindow: true,
        projects: [
          {
            isExpiringSoon: false,
            isInSupportWindow: true,
            projectName: 'supported-project',
            projectPath: `${__dirname}/fixtures/supported-project`,
            supportChecks: [
              {
                isSupported: true,
                name: '@eslint-ast/eslint-plugin-graphql',
                resolvedVersion: '1.0.4',
                latestVersion: '1.0.4',
              },
              {
                isSupported: true,
                name: '@stefanpenner/a',
                resolvedVersion: '2.0.0',
                latestVersion: '2.0.0',
              },
              {
                isSupported: true,
                name: 'es6-promise',
                resolvedVersion: '4.2.8',
                latestVersion: '4.2.8',
              },
              {
                isSupported: true,
                resolvedVersion: '15.3.0',
                latestVersion: '>=14.*',
                name: 'node',
              },
              {
                isSupported: true,
                name: 'rsvp',
                resolvedVersion: '4.8.5',
                latestVersion: '4.8.5',
              },
            ],
          },
        ],
      });
    });

    it('works against a unsupported project', async function () {
      const child = await runSupportedCmd([`${__dirname}/fixtures/unsupported-project`, '--json']);

      expect(child).to.not.exitGracefully();
      expect(child.stderr).to.includes('✗ SemVer Policy');
      let jsonOut = JSON.parse(child.stdout);
      // purge out the duration from node entry from out
      // because we use `new Date` to calculate the duration
      jsonOut.projects[0].supportChecks.forEach(pkg => {
        if (pkg.duration) {
          expect(pkg.duration).to.be.a('number');
          expect(pkg.deprecationDate).to.be.a('string');
          delete pkg['duration'];
          delete pkg['deprecationDate'];
        }
      });
      expect(jsonOut).to.eql({
        isInSupportWindow: false,
        expiringSoonCount: 0,
        projects: [
          {
            isInSupportWindow: false,
            supportChecks: [
              {
                isSupported: false,
                message: 'violated: major version must be within 1 year of latest',
                type: 'major',
                name: 'es6-promise',
                resolvedVersion: '3.3.1',
                latestVersion: '4.2.8',
              },
              {
                isSupported: false,
                message: 'violated: major version must be within 1 year of latest',
                type: 'major',
                name: '@stefanpenner/a',
                resolvedVersion: '1.0.3',
                latestVersion: '2.0.0',
              },
              {
                isSupported: false,
                message: 'violated: major version must be within 1 year of latest',
                type: 'major',
                name: 'rsvp',
                resolvedVersion: '3.6.2',
                latestVersion: '4.8.5',
              },
              {
                isSupported: true,
                resolvedVersion: '10.* || 12.* || 14.* || >= 15',
                latestVersion: '>=14.*',
                message: 'Using maintenance LTS. Update to latest LTS',
                name: 'node',
              },
              {
                isSupported: true,
                name: '@eslint-ast/eslint-plugin-graphql',
                resolvedVersion: '1.0.4',
                latestVersion: '1.0.4',
              },
            ],
            projectName: 'unsupported-project',
            projectPath: `${__dirname}/fixtures/unsupported-project`,
          },
        ],
      });
    });
  });
});
