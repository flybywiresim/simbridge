const buildInfo = require('./git_build_info').getGitBuildInfo();
const packageInfo = require('../package.json');

let version;
if (buildInfo?.tag && /^v\d+\.\d+\.\d+$/.test(buildInfo.tag)) {
  version = buildInfo.tag;
} else {
  const hash = buildInfo?.shortHash;

  if (!hash) {
    console.error('[!] buildInfo.shortHash is falsy');
    process.exit(-1);
  }

  version = buildInfo.shortHash;
}

module.exports = { version };
