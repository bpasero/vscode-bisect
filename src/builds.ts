/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from "path";
import { BUILD_FOLDER } from "./constants";
import { fileGet, jsonGet } from "./fetch";
import { exists } from "./files";

export enum Runtime {
    Web = 1,
    Desktop
}

export interface IBuild {
    name: string;
    runtime: Runtime;
    commit: string;
}

enum Platform {
    MacOSX64 = 1,
    LinuxX64 = 2,
    WindowsX64 = 3
}

const platform: Platform = process.platform === 'win32' ? Platform.WindowsX64 : process.platform === 'darwin' ? Platform.MacOSX64 : Platform.LinuxX64;

class BuildsServer {

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

    private getBuildUrl({ runtime, commit, name }: IBuild): string {
        switch (runtime) {
            case Runtime.Web:
                switch (platform) {
                    case Platform.MacOSX64:
                        return `https://az764295.vo.msecnd.net/insider/${commit}/${name}`;
                    case Platform.LinuxX64:
                        return `https://az764295.vo.msecnd.net/insider/${commit}/${name}`;
                    case Platform.WindowsX64:
                        return `https://az764295.vo.msecnd.net/insider/${commit}/${name}`;
                }

            case Runtime.Desktop:
                throw new Error('Not yet supported');
        }
    }

    async fetchBuilds(runtime: Runtime): Promise<IBuild[]> {
        const commits = await jsonGet<Array<string>>(this.getBuildsUrl(runtime));
        if (!commits) {
            throw new Error(`Failed to fetch builds for runtime ${runtime}`);
        }

        return commits.map(commit => ({ commit, runtime, name: this.getBuildName(runtime) }));
    }

    async fetchBuild(build: IBuild): Promise<string> {
        const path = join(BUILD_FOLDER, build.commit, build.name);

        if (!await exists(path)) {
            await fileGet(this.getBuildUrl(build), path);
        }

        return path;
    }
}

export const builds = new BuildsServer();
