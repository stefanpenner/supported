'use strict';

const chai = require('chai');
const { expect } = chai;
const fs = require('fs');
const {
  supported,
  supportedRanges,
  deprecationDates,
  findNextVersionReleaseDate,
} = require('../lib/time/index');

chai.use(require('chai-datetime'));

function verifyTime(result) {
  if (result.duration) {
    expect(result.duration).to.be.a('number');
    expect(result.deprecationDate).to.be.a('string');
    delete result['duration'];
    delete result['deprecationDate'];
  }
  return result;
}

describe('time based policy: 1 year for major, 6 months for minor, 3 months of patch.', function () {
  let currentDate = new Date(`2021-02-24T22:56:00.185Z`);
  it('supported ranges', function () {
    const origin = new Date('1986-09-16');
    const result = supportedRanges(origin);

    expect(result.map(x => x.name)).to.eql([
      'major version must be within 12 months of latest',
      'minor version must be within 6 months of latest',
      'patch version must be within 3 months of latest',
    ]);

    expect(result[0].date).to.equalDate(new Date('1985-09-16'), 'major expects 1 year range');
    expect(result[1].date).to.equalDate(new Date('1986-03-16'), 'minor expects 6 month range');
    expect(result[2].date).to.equalDate(new Date('1986-06-16'), 'patch expects 3 month range');
  });

  it('returns true in simple case', function () {
    expect(
      supported(
        {
          version: '1.0.0',
          time: {
            '1.0.0': 'never',
          },
          'dist-tags': {
            latest: '1.0.0',
          },
        },
        'example@1.0.0',
        [],
      ),
    ).to.eql({ isSupported: true });
  });

  it('ignores pre-releases when configured', function () {
    expect(
      supported(
        {
          version: '1.0.0',
          time: {
            '1.0.0': 'never',
          },
          'dist-tags': {
            latest: '2.0.0-beta.16',
          },
          versions: {
            '2.0.0-beta.16': {},
            '1.0.0': {},
            '0.5.0': {},
          },
        },
        'example@1.0.0',
        [],
        null,
        null,
        null,
        true,
      ),
    ).to.eql({ isSupported: true });
  });

  it('returns true, when no policies are provide but versions have been published', function () {
    expect(
      supported(
        {
          version: '1.0.0',
          time: {
            '1.0.0': new Date().toJSON(),
          },
          'dist-tags': {
            latest: '1.0.0',
          },
        },
        'example@1.0.0',
        [],
      ),
    ).to.eql({ isSupported: true });
  });

  it('returns false, when a constraint is violated', function () {
    expect(
      supported(
        {
          version: '2.0.0',
          time: {
            '2.0.0': new Date('1986-09-16').toJSON(),
            '1.0.0': new Date('1985-09-15').toJSON(),
          },
          'dist-tags': {
            latest: '2.0.0',
          },
        },
        'example@1.0.0',
        [
          {
            type: 'major',
            name: '1 year window',
            date: new Date('1985-09-16'),
          },
        ],
        currentDate,
      ),
    ).to.eql({
      deprecationDate: `1987-09-16T00:00:00.000Z`,
      duration: 1055458560185,
      isSupported: false,
      message: 'violated: 1 year window',
      type: 'major',
    });
  });

  it('test console-ui', function () {
    const info = JSON.parse(
      fs.readFileSync(`${__dirname}/fixtures/recordings/default/console-ui.json`, 'UTF8'),
    );
    const policies = supportedRanges(info.time[info.version]);

    expect(supported(info, 'console-ui@3.1.2', policies, currentDate)).to.eql({
      isSupported: true,
    });
    let result = supported(info, 'console-ui@3.1.0', policies, currentDate);
    result = verifyTime(result);
    expect(result).to.eql({
      isSupported: false,
      message: 'violated: patch version must be within 3 months of latest',
      type: 'patch',
    });
    result = supported(info, 'console-ui@2.0.0', policies, currentDate);
    result = verifyTime(result);
    expect(result).to.eql({
      isSupported: false,
      message: 'violated: major version must be within 12 months of latest',
      type: 'major',
    });
  });

  it('test ember-cli', function () {
    const info = JSON.parse(
      fs.readFileSync(`${__dirname}/fixtures/recordings/default/ember-cli.json`, 'UTF8'),
    );
    const policies = supportedRanges(info.time[info.version]);

    expect(supported(info, 'ember-cli@3.22.0', policies, currentDate)).to.eql({
      isSupported: true,
    });
    let result = supported(info, 'ember-cli@3.21.0', policies, currentDate);
    verifyTime(result);
    expect(result).to.eql({
      isSupported: true,
      type: 'minor',
    });
    result = supported(info, 'ember-cli@3.20.0', policies, currentDate);
    verifyTime(result);
    expect(result).to.eql({
      isSupported: true,
      type: 'minor',
    });
    result = supported(info, 'ember-cli@3.12.1', policies, currentDate);
    verifyTime(result);
    expect(result).to.eql({
      isSupported: false,
      message: 'violated: minor version must be within 6 months of latest',
      type: 'minor',
    });
    result = supported(info, 'ember-cli@3.13.2', policies, currentDate);
    verifyTime(result);
    expect(result).to.eql({
      isSupported: false,
      message: 'violated: minor version must be within 6 months of latest',
      type: 'minor',
    });
    result = supported(info, 'ember-cli@3.13.1', policies, currentDate);
    verifyTime(result);
    expect(result).to.eql({
      isSupported: false,
      message: 'violated: minor version must be within 6 months of latest',
      type: 'minor',
    });
    result = supported(info, 'ember-cli@3.4.0', policies, currentDate);
    verifyTime(result);
    expect(result).to.eql({
      isSupported: false,
      message: 'violated: minor version must be within 6 months of latest',
      type: 'minor',
    });
  });

  describe(`findNextVersionReleaseDate`, function () {
    const info = JSON.parse(
      fs.readFileSync(`${__dirname}/fixtures/recordings/default/console-ui.json`, 'UTF8'),
    );
    it(`able to find deprecation dates`, function () {
      let date = findNextVersionReleaseDate('2.2.3', info, 'major');
      expect(date.toISOString()).to.eql('2019-01-08T16:30:15.184Z');
    });
  });
  describe(`deprecationDates`, function () {
    it(`returns deprecation dates`, function () {
      let dates = deprecationDates('2019-01-08T16:30:15.184Z');
      expect(dates.major.toDateString()).to.eql('Wed Jan 08 2020');
      expect(dates.minor.toDateString()).to.eql('Mon Jul 08 2019');
      expect(dates.patch.toDateString()).to.eql('Mon Apr 08 2019');
    });
    it(`returns deprecation dates with padding`, function () {
      let dates = deprecationDates('2019-03-25T16:30:15.184Z');
      expect(dates.major.toDateString()).to.eql('Thu Jun 25 2020');
      expect(dates.minor.toDateString()).to.eql('Wed Dec 25 2019');
      expect(dates.patch.toDateString()).to.eql('Wed Sep 25 2019');
    });
  });
});
