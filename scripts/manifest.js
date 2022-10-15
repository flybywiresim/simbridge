const fs = require('fs')
const path = require('path')
const child_process = require('child_process')

const executeGitCommand = (command) => {
    return child_process.execSync(command)
    .toString('utf8')
    .replace(/[\n\r]+$/, '');
}

const BASE_DIR = './build';
const MANIFEST_PATH = 'manifest.json';
const MANIFEST_BASE = require('../manifest-base.json')
const GIT_COMMIT_SHA = process.env.GITHUB_SHA
    ? process.env.GITHUB_SHA.substring(0, 9)
    : executeGitCommand('git rev-parse --short HEAD');

const generatePackageSize = () => {
    console.log("Generating Package Size")
    let totalPackageSize = 0;

    for (const filename of fs.readdirSync(BASE_DIR)) {
        const stat = fs.statSync(path.join(BASE_DIR,filename), { bigint: true });
        totalPackageSize += Number(stat.size);
    }

    return totalPackageSize
}

const build_manifest = () => {
    try {
        console.log('Building manifest')
        fs.writeFileSync(path.join(BASE_DIR, MANIFEST_PATH), JSON.stringify({
            ...MANIFEST_BASE,
            package_version: require('../package.json').version + `-${GIT_COMMIT_SHA}`,
            total_package_size: generatePackageSize().toString().padStart(20, '0'),
        }, null, 2))
    } catch (error) {
        console.error(error)
    }
}

build_manifest()
