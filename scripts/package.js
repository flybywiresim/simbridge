const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const packageVersion = require('../package.json');

const executeGitCommand = (command) => childProcess.execSync(command)
    .toString('utf8')
    .replace(/[\n\r]+$/, '');

const BASE_DIR = path.resolve(__dirname, '..', 'build');
const MS_FILETIME_EPOCH = 116444736000000000n;
const MANIFEST_PATH = 'manifest.json';
const LAYOUT_PATH = 'layout.json';
const MANIFEST_BASE = require('../manifest-base.json');

const GIT_COMMIT_SHA = process.env.GITHUB_SHA
    ? process.env.GITHUB_SHA.substring(0, 9)
    : executeGitCommand('git rev-parse --short HEAD');

function* readdir(d) {
    for (const dirent of fs.readdirSync(d, { withFileTypes: true })) {
        if (['layout.json', 'manifest.json'].includes(dirent.name)) {
            continue;
        }
        const resolved = path.join(d, dirent.name);
        if (dirent.isDirectory()) {
            yield* readdir(resolved);
        } else {
            yield resolved;
        }
    }
}

const generateContentEntry = (stat, filename) => ({
    path: path.relative(BASE_DIR, filename.replace(path.sep, '/')),
    size: Number(stat.size),
    date: Number((stat.mtimeNs / 100n) + MS_FILETIME_EPOCH),
});

const writePackageFiles = (contentEntries, totalPackageSize) => {
    fs.writeFileSync(path.join(BASE_DIR, LAYOUT_PATH), JSON.stringify({ content: contentEntries }, null, 2));

    fs.writeFileSync(path.join(BASE_DIR, MANIFEST_PATH), JSON.stringify({
        ...MANIFEST_BASE,
        package_version: `${packageVersion.version}-${GIT_COMMIT_SHA}`,
        total_package_size: totalPackageSize.toString().padStart(20, '0'),
    }, null, 2));
};

const buildPackageFiles = () => {
    try {
        console.log('building package files');
        const contentEntries = [];
        let totalPackageSize = 0;

        for (const filename of readdir(BASE_DIR)) {
            const stat = fs.statSync(filename, { bigint: true });
            contentEntries.push(generateContentEntry(stat, filename));
            totalPackageSize += Number(stat.size);
        }

        writePackageFiles(contentEntries, totalPackageSize);
    } catch (error) {
        console.error(error);
    }
};

buildPackageFiles();
