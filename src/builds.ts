/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import chalk from 'chalk';
import { dirname, join } from 'path';
import { LOGGER, Platform, platform, Runtime } from './constants';
import { fileGet, jsonGet } from './fetch';
import { exists, getBuildPath, unzip } from './files';

export interface IBuild {
    runtime: Runtime;
    commit: string;
}

interface IBuildMetadata {
    url: string;
    productVersion: string;
}

class Builds {

    async fetchBuilds(runtime = Runtime.Web, goodCommit?: string, badCommit?: string): Promise<IBuild[]> {
        const allBuilds = await this.fetchAllBuilds(runtime);

        let goodCommitIndex = allBuilds.length - 1;  // last build (oldest) by default
        let badCommitIndex = 0;                     // first build (newest) by default

        if (typeof goodCommit === 'string') {
            const candidateGoodCommitIndex = this.indexOf(goodCommit, allBuilds);
            if (typeof candidateGoodCommitIndex !== 'number') {
                throw new Error(`Provided good commit ${goodCommit} is not a released insiders build.`);
            }

            goodCommitIndex = candidateGoodCommitIndex;
        }

        if (typeof badCommit === 'string') {
            const candidateBadCommitIndex = this.indexOf(badCommit, allBuilds);
            if (typeof candidateBadCommitIndex !== 'number') {
                throw new Error(`Provided bad commit ${badCommit} is not a released insiders build.`);
            }

            badCommitIndex = candidateBadCommitIndex;
        }

        if (badCommitIndex >= goodCommitIndex) {
            throw new Error(`Provided bad commit ${badCommit} cannot be older or same as good commit ${goodCommit}.`);
        }

        return allBuilds.slice(badCommitIndex, goodCommitIndex + 1);
    }

    private indexOf(commit: string, builds: IBuild[]): number | undefined {
        for (let i = 0; i < builds.length; i++) {
            const build = builds[i];
            if (build.commit === commit) {
                return i;
            }
        }

        return undefined;
    }

    private async fetchAllBuilds(runtime: Runtime): Promise<IBuild[]> {
        const commits = await jsonGet<Array<string>>(`https://update.code.visualstudio.com/api/commits/insider/${this.getBuildApiName(runtime)}`);

        return commits.map(commit => ({ commit, runtime }));
    }

    private getBuildApiName(runtime: Runtime): string {
        switch (runtime) {
            case Runtime.Web:
                switch (platform) {
                    case Platform.MacOSX64:
                    case Platform.MacOSArm:
                        return 'server-darwin-web';
                    case Platform.LinuxX64:
                    case Platform.LinuxArm:
                        return 'server-linux-x64-web';
                    case Platform.WindowsX64:
                    case Platform.WindowsArm:
                        return 'server-win32-x64-web';
                }

            case Runtime.Desktop:
                switch (platform) {
                    case Platform.MacOSX64:
                        return 'darwin';
                    case Platform.MacOSArm:
                        return 'darwin-arm64';
                    case Platform.LinuxX64:
                        return 'linux-x64';
                    case Platform.LinuxArm:
                        return 'linux-arm64';
                    case Platform.WindowsX64:
                        return 'win32-x64';
                    case Platform.WindowsArm:
                        return 'win32-arm64';
                }
        }
    }

    async installBuild({ runtime, commit }: IBuild): Promise<void> {
        const buildName = await this.getBuildArchiveName({ runtime, commit });

        const path = join(getBuildPath(commit), buildName);

        if (LOGGER.verbose) {
            console.log(`Using ${chalk.green(path)} for the next build to try`);
        }

        if (await exists(path)) {
            return; // assume the build is cached
        }

        // Download
        const url = `https://az764295.vo.msecnd.net/insider/${commit}/${buildName}`;
        console.log(`Downloading build from ${chalk.green(url)}...`);
        await fileGet(url, path);

        // Unzip
        let destination: string;
        if (runtime === Runtime.Desktop && platform === Platform.WindowsX64 || platform === Platform.WindowsArm) {
            // zip does not contain a single top level folder to use...
            destination = path.substring(0, path.lastIndexOf('.zip'));
        } else {
            // zip contains a single top level folder to use
            destination = dirname(path);
        }
        console.log(`Unzipping build to ${chalk.green(destination)}...`);
        await unzip(path, destination);
    }

    private async getBuildArchiveName({ runtime, commit }: IBuild): Promise<string> {
        switch (runtime) {

            // We currently do not have ARM enabled servers
            // so we fallback to x64 until we ship ARM.
            case Runtime.Web:
                switch (platform) {
                    case Platform.MacOSX64:
                    case Platform.MacOSArm:
                        return 'vscode-server-darwin-web.zip';
                    case Platform.LinuxX64:
                    case Platform.LinuxArm:
                        return 'vscode-server-linux-x64-web.tar.gz';
                    case Platform.WindowsX64:
                    case Platform.WindowsArm:
                        return 'vscode-server-win32-x64-web.zip';
                }

            // Every platform has its own name scheme, hilarious right?
            // - macOS: just the name, nice! (e.g. VSCode-darwin.zip)
            // - Linux: includes some unix timestamp (e.g. code-insider-x64-1639979337.tar.gz)
            // - Windows: includes the version (e.g. VSCode-win32-x64-1.64.0-insider.zip)
            case Runtime.Desktop:
                switch (platform) {
                    case Platform.MacOSX64:
                        return 'VSCode-darwin.zip';
                    case Platform.MacOSArm:
                        return 'VSCode-darwin-arm64.zip';
                    case Platform.LinuxX64:
                    case Platform.LinuxArm:
                        return (await this.fetchBuildMeta({ runtime, commit })).url.split('/').pop()!; // e.g. https://az764295.vo.msecnd.net/insider/807bf598bea406dcb272a9fced54697986e87768/code-insider-x64-1639979337.tar.gz
                    case Platform.WindowsX64:
                    case Platform.WindowsArm: {
                        const buildMeta = await this.fetchBuildMeta({ runtime, commit });

                        return platform === Platform.WindowsX64 ? `VSCode-win32-x64-${buildMeta.productVersion}.zip` : `VSCode-win32-arm64-${buildMeta.productVersion}.zip`;
                    }
                }
        }
    }

    async getBuildName({ runtime, commit }: IBuild): Promise<string> {
        switch (runtime) {
            case Runtime.Web:
                switch (platform) {
                    case Platform.MacOSX64:
                    case Platform.MacOSArm:
                        return 'vscode-server-darwin-web';
                    case Platform.LinuxX64:
                    case Platform.LinuxArm:
                        return 'vscode-server-linux-x64-web';
                    case Platform.WindowsX64:
                    case Platform.WindowsArm:
                        return 'vscode-server-win32-x64-web';
                }

            // Here, only Windows does not play by our rules and adds the version number
            // - Windows: includes the version (e.g. VSCode-win32-x64-1.64.0-insider)
            case Runtime.Desktop:
                switch (platform) {
                    case Platform.MacOSX64:
                    case Platform.MacOSArm:
                        return 'Visual Studio Code - Insiders.app';
                    case Platform.LinuxX64:
                        return 'VSCode-linux-x64';
                    case Platform.LinuxArm:
                        return 'VSCode-linux-arm64';
                    case Platform.WindowsX64:
                    case Platform.WindowsArm: {
                        const buildMeta = await this.fetchBuildMeta({ runtime, commit });

                        return platform === Platform.WindowsX64 ? `VSCode-win32-x64-${buildMeta.productVersion}` : `VSCode-win32-arm64-${buildMeta.productVersion}`;
                    }
                }
        }
    }

    private fetchBuildMeta({ runtime, commit }: IBuild): Promise<IBuildMetadata> {
        return jsonGet<IBuildMetadata>(`https://update.code.visualstudio.com/api/versions/commit:${commit}/${this.getBuildApiName(runtime)}/insider`);
    }

    async getBuildExecutable({ runtime, commit }: IBuild): Promise<string> {
        const buildPath = getBuildPath(commit);
        const buildName = await builds.getBuildName({ runtime, commit });

        switch (runtime) {
            case Runtime.Web:
                switch (platform) {
                    case Platform.MacOSX64:
                    case Platform.MacOSArm:
                    case Platform.LinuxX64:
                    case Platform.LinuxArm:
                        return join(buildPath, buildName, 'server.sh')
                    case Platform.WindowsX64:
                        return join(buildPath, buildName, 'server.cmd')
                }

            case Runtime.Desktop:
                switch (platform) {
                    case Platform.MacOSX64:
                    case Platform.MacOSArm:
                        return join(buildPath, buildName, 'Contents', 'MacOS', 'Electron')
                    case Platform.LinuxX64:
                    case Platform.LinuxArm:
                        return join(buildPath, buildName, 'code-insiders')
                    case Platform.WindowsX64:
                    case Platform.WindowsArm:
                        return join(buildPath, buildName, 'Code - Insiders.exe')
                }
        }
    }
}

export const builds = new Builds();
