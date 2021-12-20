/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { join } from "path";
import open from "open";
import kill from "tree-kill";
import { builds, IBuild } from "./builds";
import { BUILD_FOLDER, DATA_FOLDER, EXTENSIONS_FOLDER, LOGGER, Platform, platform, Runtime, USER_DATA_FOLDER } from "./constants";
import { mkdirSync, rmSync } from "fs";
import { exists } from "./files";
import chalk from "chalk";

export interface IInstance {
    stop(): Promise<unknown>;
}

class Launcher {

    private static readonly WEB_AVAILABLE_REGEX = new RegExp('Web UI available at (http://localhost:8000/\\?tkn=.+)');

    static {

        // Recreate user data & extension folder
        try {
            rmSync(DATA_FOLDER, { recursive: true });
        } catch (error) { }
        mkdirSync(DATA_FOLDER, { recursive: true });
    }

    async launch(build: IBuild): Promise<IInstance> {

        // Install
        await builds.installBuild(build);

        // Launch according to runtime
        switch (build.runtime) {
            case Runtime.Web:
                return this.launchBrowser(build);
            case Runtime.Desktop:
                return this.launchElectron(build);
        }
    }

    private async launchBrowser(build: IBuild): Promise<IInstance> {
        const cp = await this.spawnBuild(build);

        cp.stdout.on('data', data => {
            const matches = Launcher.WEB_AVAILABLE_REGEX.exec(data.toString());
            const url = matches?.[1];
            if (url) {
                open(url);
            }
        });

        cp.stderr.on('data', data => {
            if (LOGGER.verbose) {
                console.error(`[Server]: ${data.toString()}`);
            }
        });

        return {
            stop: () => new Promise<void>((resolve, reject) => {
                kill(cp.pid!, error => error ? reject(error) : resolve())
            })
        }
    }

    private async launchElectron(build: IBuild): Promise<IInstance> {
        const cp = await this.spawnBuild(build);

        cp.stderr.on('data', data => {
            if (LOGGER.verbose) {
                console.error(`[Electron]: ${data.toString()}`);
            }
        });

        return {
            stop: () => new Promise<void>(resolve => {
                cp.kill();
                resolve();
            })
        }
    }

    private async spawnBuild(build: IBuild): Promise<ChildProcessWithoutNullStreams> {
        const executable = this.getBuildExecutable(build);

        const executableExists = await exists(executable);
        if (!executableExists) {
            throw new Error(`Unable to find executable ${executable} on disk. Is the archive corrupt?`);
        }

        if (LOGGER.verbose) {
            console.log(`Starting build via ${chalk.green(executable)}...`);
        }

        const args = [
            '--extensions-dir',
            EXTENSIONS_FOLDER
        ];

        if (build.runtime === Runtime.Desktop) {
            args.push(
                '--user-data-dir',
                USER_DATA_FOLDER
            );
        }

        switch (build.runtime) {
            case Runtime.Web:
                switch (platform) {
                    case Platform.MacOSX64:
                    case Platform.MacOSArm:
                    case Platform.LinuxX64:
                    case Platform.LinuxArm:
                        return spawn('bash', [executable, ...args]);
                    case Platform.WindowsX64:
                    case Platform.WindowsArm:
                        return spawn(executable, args);
                }


            case Runtime.Desktop:
                switch (platform) {
                    case Platform.MacOSX64:
                    case Platform.MacOSArm:
                        return spawn(executable, args);
                    case Platform.LinuxX64:
                    case Platform.LinuxArm:
                    case Platform.WindowsX64:
                    case Platform.WindowsArm:
                        throw new Error('Not yet implemented');
                }
        }
    }

    private getBuildExecutable({ runtime, commit }: IBuild): string {
        switch (runtime) {
            case Runtime.Web:
                switch (platform) {
                    case Platform.MacOSX64:
                    case Platform.MacOSArm:
                    case Platform.LinuxX64:
                    case Platform.LinuxArm:
                        return join(BUILD_FOLDER, commit, this.getBuildName(runtime), 'server.sh')
                    case Platform.WindowsX64:
                        return join(BUILD_FOLDER, commit, this.getBuildName(runtime), 'server.cmd')
                }

            case Runtime.Desktop:
                switch (platform) {
                    case Platform.MacOSX64:
                    case Platform.MacOSArm:
                        return join(BUILD_FOLDER, commit, this.getBuildName(runtime), 'Contents', 'MacOS', 'Electron')
                    case Platform.LinuxX64:
                    case Platform.LinuxArm:
                    case Platform.WindowsX64:
                    case Platform.WindowsArm:
                        throw new Error('Not yet implemented');
                }
        }
    }

    private getBuildName(runtime: Runtime): string {
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

            case Runtime.Desktop:
                switch (platform) {
                    case Platform.MacOSX64:
                        return 'Visual Studio Code - Insiders.app';
                    case Platform.MacOSArm:
                        return 'Visual Studio Code - Insiders.app';
                    case Platform.LinuxX64:
                    case Platform.LinuxArm:
                    case Platform.WindowsX64:
                    case Platform.WindowsArm:
                        throw new Error('Not yet implemented');
                }
        }
    }
}

export const launcher = new Launcher();