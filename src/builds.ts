/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from "path";
import { BUILD_FOLDER, Platform, platform, Runtime } from "./constants";
import { fileGet, jsonGet } from "./fetch";
import { exists, unzip } from "./files";

export interface IBuild {
    runtime: Runtime;
    commit: string;
}

class Builds {

    async fetchBuilds(runtime: Runtime): Promise<IBuild[]> {
        const commits = await jsonGet<Array<string>>(this.getBuildsUrl(runtime));

        return commits.map(commit => ({ commit, runtime }));
    }

    private getBuildsUrl(runtime: Runtime): string {
        switch (runtime) {
            case Runtime.Web:
                switch (platform) {
                    case Platform.MacOSX64:
                    case Platform.MacOSArm:
                        return 'https://update.code.visualstudio.com/api/commits/insider/server-darwin-web';
                    case Platform.LinuxX64:
                    case Platform.LinuxArm:
                        return 'https://update.code.visualstudio.com/api/commits/insider/server-linux-x64-web';
                    case Platform.WindowsX64:
                    case Platform.WindowsArm:
                        return 'https://update.code.visualstudio.com/api/commits/insider/server-win32-x64-web';
                }

            case Runtime.Desktop:
                switch (platform) {
                    case Platform.MacOSX64:
                        return 'https://update.code.visualstudio.com/api/commits/insider/darwin';
                    case Platform.MacOSArm:
                        return 'https://update.code.visualstudio.com/api/commits/insider/darwin-arm64';
                    case Platform.LinuxX64:
                        return 'https://update.code.visualstudio.com/api/commits/insider/linux-x64';
                    case Platform.LinuxArm:
                        return 'https://update.code.visualstudio.com/api/commits/insider/linux-arm64';
                    case Platform.WindowsX64:
                        return 'https://update.code.visualstudio.com/api/commits/insider/win32-x64';
                    case Platform.WindowsArm:
                        return 'https://update.code.visualstudio.com/api/commits/insider/win32-arm64';
                }
        }
    }

    async installBuild({ runtime, commit }: IBuild): Promise<void> {
        const path = join(BUILD_FOLDER, commit, this.getBuildName(runtime));
        if (await exists(path)) {
            return; // assume the build is cached
        }

        // Download
        const url = `https://az764295.vo.msecnd.net/insider/${commit}/${this.getBuildName(runtime)}`;
        await fileGet(url, path);

        // Unzip
        await unzip(path);
    }

    private getBuildName(runtime: Runtime): string {
        switch (runtime) {
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

            case Runtime.Desktop:
                switch (platform) {
                    case Platform.MacOSX64:
                        return 'VSCode-darwin.zip';
                    case Platform.MacOSArm:
                        return 'VSCode-darwin-arm64.zip';
                    case Platform.LinuxX64:
                    case Platform.LinuxArm:
                    case Platform.WindowsX64:
                    case Platform.WindowsArm:
                        throw new Error('Not yet implemented');
                }
        }
    }
}

export const builds = new Builds();
