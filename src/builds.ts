/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from "path";
import { BUILD_FOLDER, Platform, platform } from "./constants";
import { fileGet, jsonGet } from "./fetch";
import { exists, unzip } from "./files";

export enum Runtime {
    Web = 1,
    Desktop
}

export interface IBuild {
    runtime: Runtime;
    commit: string;
}

class BuildsServer {

    async fetchBuilds(runtime: Runtime): Promise<IBuild[]> {
        const commits = await jsonGet<Array<string>>(this.getBuildsUrl(runtime));

        return commits.map(commit => ({ commit, runtime }));
    }

    private getBuildsUrl(runtime: Runtime): string {
        switch (runtime) {
            case Runtime.Web:
                switch (platform) {
                    case Platform.MacOSX64:
                        return 'https://update.code.visualstudio.com/api/commits/insider/server-darwin-web';
                    case Platform.LinuxX64:
                        return 'https://update.code.visualstudio.com/api/commits/insider/server-linux-x64-web';
                    case Platform.WindowsX64:
                        return 'https://update.code.visualstudio.com/api/commits/insider/server-win32-x64-web';
                }

            case Runtime.Desktop:
                throw new Error('Not yet supported');
        }
    }

    async installBuild({ runtime, commit }: IBuild): Promise<void> {
        const path = join(BUILD_FOLDER, commit, this.getBuildName(runtime));

        if (!await exists(path)) {
            await fileGet(this.getBuildUrl({ runtime, commit }), path);
            await unzip(path);
        }
    }

    private getBuildName(runtime: Runtime): string {
        switch (runtime) {
            case Runtime.Web:
                switch (platform) {
                    case Platform.MacOSX64:
                        return 'vscode-server-darwin-web.zip';
                    case Platform.LinuxX64:
                        return 'vscode-server-linux-x64-web.tar.gz';
                    case Platform.WindowsX64:
                        return 'vscode-server-win32-x64-web.zip';
                }

            case Runtime.Desktop:
                throw new Error('Not yet supported');
        }
    }

    private getBuildUrl({ runtime, commit }: IBuild): string {
        switch (runtime) {
            case Runtime.Web:
                switch (platform) {
                    case Platform.MacOSX64:
                        return `https://az764295.vo.msecnd.net/insider/${commit}/${this.getBuildName(runtime)}`;
                    case Platform.LinuxX64:
                        return `https://az764295.vo.msecnd.net/insider/${commit}/${this.getBuildName(runtime)}`;
                    case Platform.WindowsX64:
                        return `https://az764295.vo.msecnd.net/insider/${commit}/${this.getBuildName(runtime)}`;
                }

            case Runtime.Desktop:
                throw new Error('Not yet supported');
        }
    }
}

export const builds = new BuildsServer();
