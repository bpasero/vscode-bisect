/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import chalk from "chalk";
import { join } from "path";
import { BUILD_FOLDER, LOGGER, Platform, platform, Runtime } from "./constants";
import { fileGet, jsonGet } from "./fetch";
import { exists, unzip } from "./files";

export interface IBuild {
    runtime: Runtime;
    commit: string;
}

interface IBuildMetadata {
    url: string;
    productVersion: string;
}

class Builds {

    async fetchBuilds(runtime: Runtime): Promise<IBuild[]> {
        const commits = await jsonGet<Array<string>>(`https://update.code.visualstudio.com/api/commits/insider/${this.getBuildApiName(runtime)}`);

        return commits.map(commit => ({ commit, runtime }));
    }

    fetchBuildMeta({ runtime, commit }: IBuild): Promise<IBuildMetadata> {
        return jsonGet<IBuildMetadata>(`https://update.code.visualstudio.com/api/versions/commit:${commit}/${this.getBuildApiName(runtime)}/insider`);
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
        const buildName = await this.getBuildName({ runtime, commit });

        const path = join(BUILD_FOLDER, commit, buildName);

        if (LOGGER.verbose) {
            console.log(`Using ${chalk.green(path)} for the next build to try`);
        }

        if (await exists(path)) {
            return; // assume the build is cached
        }

        // Download
        const url = `https://az764295.vo.msecnd.net/insider/${commit}/${buildName}`;
        if (LOGGER.verbose) {
            console.log(`Downloading build from ${chalk.green(url)}...`);
        }
        await fileGet(url, path);

        // Unzip
        if (LOGGER.verbose) {
            console.log(`Unzipping build to ${chalk.green(path)}...`);
        }
        await unzip(path);
    }

    private async getBuildName({ runtime, commit }: IBuild): Promise<string> {
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
            // - Windows: includes the version (e.g. VSCodeSetup-x64-1.64.0-insider.exe)
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
}

export const builds = new Builds();
