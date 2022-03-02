/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { join } from 'path';
import open from 'open';
import kill from 'tree-kill';
import { builds, IBuild } from './builds';
import { DATA_FOLDER, EXTENSIONS_FOLDER, LOGGER, Platform, platform, Runtime, USER_DATA_FOLDER } from './constants';
import { mkdirSync, rmSync } from 'fs';
import { exists, getBuildPath } from './files';
import chalk from 'chalk';

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
        console.log(`${chalk.gray('[build]')} starting build ${chalk.green(build.commit)}...`);
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
            if (LOGGER.verbose) {
                console.error(`[Server (stdout)]: ${data.toString()}`);
            }

            const matches = Launcher.WEB_AVAILABLE_REGEX.exec(data.toString());
            const url = matches?.[1];
            if (url) {
                open(url);
            }
        });

        cp.stderr.on('data', data => {
            if (LOGGER.verbose) {
                console.error(`[Server (stderr)]: ${data.toString()}`);
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

        cp.stdout.on('data', data => {
            if (LOGGER.verbose) {
                console.error(`[Electron (stdout)]: ${data.toString()}`);
            }
        });

        cp.stderr.on('data', data => {
            if (LOGGER.verbose) {
                console.error(`[Electron (stderr)]: ${data.toString()}`);
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
        const executable = await builds.getBuildExecutable(build);

        const executableExists = await exists(executable);
        if (!executableExists) {
            throw new Error(`[build] unable to find executable ${executable} on disk. Is the archive corrupt?`);
        }

        if (LOGGER.verbose) {
            console.log(`${chalk.gray('[build]')} starting build via ${chalk.green(executable)}...`);
        }

        const args = [
            '--accept-server-license-terms',
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
                return spawn(executable, args);
        }
    }
}

export const launcher = new Launcher();