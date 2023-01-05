/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { join } from 'path';
import open from 'open';
import kill from 'tree-kill';
import { builds, IBuild } from './builds';
import { CONFIG, DATA_FOLDER, EXTENSIONS_FOLDER, GIT_VSCODE_FOLDER, LOGGER, PERFORMANCE_FILE, PERFORMANCE_RUNS, Platform, platform, Runtime, USER_DATA_FOLDER } from './constants';
import { mkdirSync, readFileSync, rmSync, unlinkSync } from 'fs';
import { exists } from './files';
import chalk from 'chalk';

export interface IInstance {

    /**
     * Optional ellapsed time in milliseconds.
     * Only available for desktop builds and when
     * running with `--perf` command line flag.
     */
    readonly ellapsed?: number;

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
                console.log(`${chalk.gray('[build]')} starting web build ${chalk.green(build.commit)}...`);
                return this.launchBrowser(build);
            case Runtime.Desktop:
                if (CONFIG.performance) {
                    console.log(`${chalk.gray('[build]')} starting desktop build ${chalk.green(build.commit)} multiple times and measuring performance...`);
                } else {
                    console.log(`${chalk.gray('[build]')} starting desktop build ${chalk.green(build.commit)}...`);
                }
                return this.launchElectron(build);
        }
    }

    private async launchBrowser(build: IBuild): Promise<IInstance> {
        const cp = await this.spawnBuild(build);

        cp.stdout.on('data', data => {
            if (LOGGER.verbose) {
                console.log(`${chalk.gray('[server]')}: ${data.toString()}`);
            }

            const matches = Launcher.WEB_AVAILABLE_REGEX.exec(data.toString());
            const url = matches?.[1];
            if (url) {
                open(url);
            }
        });

        cp.stderr.on('data', data => {
            if (LOGGER.verbose) {
                console.log(`${chalk.red('[server]')}: ${data.toString()}`);
            }
        });

        return {
            stop: () => new Promise<void>((resolve, reject) => {
                const pid = cp.pid!;
                kill(pid, error => {
                    if (error) {
                        try {
                            process.kill(pid, 0);
                        } catch (error) {
                            resolve();      // process doesn't exist anymore... so, all good
                            return;
                        }

                        reject(error);
                    } else {
                        resolve();
                    }
                });
            })
        }
    }

    private async launchElectron(build: IBuild): Promise<IInstance> {
        let smallestEllapsed: number | undefined;

        // Performance run, launch multiple times
        if (CONFIG.performance) {
            for (let i = 0; i < PERFORMANCE_RUNS; i++) {
                console.log(`${chalk.gray('[perf]')} running session ${chalk.green(i + 1)} of ${chalk.green(PERFORMANCE_RUNS)}...`);
                const ellapsed = (await this.doLaunchElectron(build)).ellapsed;
                if (typeof ellapsed === 'number') {
                    console.log(`${chalk.gray('[perf]')} ellapsed: ${chalk.green(`${ellapsed}ms`)}`);

                    if (typeof smallestEllapsed !== 'number') {
                        smallestEllapsed = ellapsed;
                    } else if (smallestEllapsed > ellapsed) {
                        smallestEllapsed = ellapsed;
                    }
                }
            }

            console.log(`${chalk.gray('[perf]')} best ellapsed: ${chalk.green(`${smallestEllapsed}ms`)}`);

            return {
                ellapsed: smallestEllapsed,
                stop: async () => { }
            }
        }

        // Normal run, launch once
        return this.doLaunchElectron(build);
    }

    private async doLaunchElectron(build: IBuild): Promise<IInstance> {
        const cp = await this.spawnBuild(build);

        cp.stdout.on('data', data => {
            if (LOGGER.verbose) {
                console.log(`${chalk.gray('[electron]')}: ${data.toString()}`);
            }
        });

        cp.stderr.on('data', data => {
            if (LOGGER.verbose) {
                console.log(`${chalk.red('[electron]')}: ${data.toString()}`);
            }
        });

        let ellapsed: number | undefined;
        if (CONFIG.performance) {

            // Wait for instance to self-terminate
            await new Promise<void>(resolve => {
                cp.on('exit', () => resolve());
            });

            // Process performance file
            const matches = /^(\d+)/.exec(readFileSync(PERFORMANCE_FILE, 'utf8'));
            if (matches) {
                ellapsed = parseInt(matches[1]);
            }
        }

        return {
            ellapsed,
            stop: async () => cp.kill()
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
                '--disable-telemetry',
                '--skip-welcome',
                '--skip-release-notes',
                '--disable-updates',
                '--user-data-dir',
                USER_DATA_FOLDER
            );

            if (CONFIG.performance) {
                if (await exists(PERFORMANCE_FILE)) {
                    unlinkSync(PERFORMANCE_FILE); // ensure an empty performance file
                }

                args.push(
                    '--disable-extensions',
                    '--disable-workspace-trust',
                    '--disable-features=CalculateNativeWinOcclusion',
                    '--prof-append-timers',
                    PERFORMANCE_FILE,
                    GIT_VSCODE_FOLDER,
                    join(GIT_VSCODE_FOLDER, 'package.json')
                );
            } else {
                args.push(
                    '--no-cached-data'
                );
            }
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