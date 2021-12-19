/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { join } from "path";
import open from "open";
import kill from "tree-kill";
import { IBuild, Runtime } from "./builds";
import { BUILD_FOLDER, EXTENSIONS_FOLDER, Platform, platform, USER_DATA_FOLDER } from "./constants";

export interface IInstance {
    stop(): Promise<unknown>;
}

class Launcher {

    private static readonly WEB_AVAILABLE_REGEX = new RegExp('Web UI available at (http://localhost:8000/\\?tkn=.+)');

    async launch(build: IBuild): Promise<IInstance> {
        switch (build.runtime) {
            case Runtime.Web:
                return this.launchBrowser(build);
            case Runtime.Desktop:
                return this.launchElectron(build);
        }
    }

    private launchBrowser(build: IBuild): IInstance {
        const cp = this.spawnBuild(build);

        cp.stdout.on('data', data => {
            const matches = Launcher.WEB_AVAILABLE_REGEX.exec(data.toString());
            const url = matches?.[1];
            if (url) {
                open(url);
            }
        });

        return {
            stop: () => new Promise<void>((resolve, reject) => {
                kill(cp.pid!, error => error ? reject(error) : resolve())
            })
        }
    }

    private launchElectron(build: IBuild): IInstance {
        throw new Error('Unsupported');
    }

    private spawnBuild(build: IBuild): ChildProcessWithoutNullStreams {
        const executable = this.getBuildExecutable(build);
        const args = [
            '--user-data-dir',
            USER_DATA_FOLDER,
            '--extensions-dir',
            EXTENSIONS_FOLDER
        ];

        switch (platform) {
            case Platform.MacOSX64:
            case Platform.LinuxX64:
                return spawn('bash', [executable, ...args]);
            case Platform.WindowsX64:
                throw new Error('Unsupported');
        }
    }

    private getBuildExecutable({ runtime, commit }: IBuild): string {
        switch (runtime) {
            case Runtime.Web:
                switch (platform) {
                    case Platform.MacOSX64:
                    case Platform.LinuxX64:
                        return join(BUILD_FOLDER, commit, this.getBuildName(runtime), 'server.sh')
                    case Platform.WindowsX64:
                        return join(BUILD_FOLDER, commit, this.getBuildName(runtime), 'server.bat')
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
                        return 'vscode-server-darwin-web';
                    case Platform.LinuxX64:
                        return 'vscode-server-linux-x64-web';
                    case Platform.WindowsX64:
                        return 'vscode-server-win32-x64-web';
                }

            case Runtime.Desktop:
                throw new Error('Not yet supported');
        }
    }
}

export const launcher = new Launcher();