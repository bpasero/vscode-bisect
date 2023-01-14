/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { join } from 'path';
import { URI } from 'vscode-uri';
import open from 'open';
import playwright from 'playwright';
import kill from 'tree-kill';
import { builds, IBuild } from './builds';
import { CONFIG, DATA_FOLDER, EXTENSIONS_FOLDER, GIT_VSCODE_FOLDER, LOGGER, PERFORMANCE_FILE, PERFORMANCE_RUNS, PERFORMANCE_RUN_TIMEOUT, Platform, platform, Runtime, USER_DATA_FOLDER, VSCODE_DEV_URL } from './constants';
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

    /**
     * Stops the instance.
     */
    stop(): Promise<unknown>;
}

const NOOP_INSTANCE: IInstance & IWebInstance = { stop: async () => { }, url: '' };

const NO_ABORT_SIGNAL = new AbortController().signal;

interface IWebInstance extends IInstance {

    /**
     * URL to the web instance.
     */
    readonly url: string;
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

        // Install (unless web remote)
        if (build.runtime !== Runtime.WebRemote) {
            await builds.installBuild(build);
        }

        // Launch according to runtime
        switch (build.runtime) {

            // Web (local)
            case Runtime.WebLocal:
                if (CONFIG.performance) {
                    console.log(`${chalk.gray('[build]')} starting local web build ${chalk.green(build.commit)} multiple times and measuring performance...`);
                    return this.measure(signal => this.launchWebPerformance(build, signal));
                }

                console.log(`${chalk.gray('[build]')} starting local web build ${chalk.green(build.commit)}...`);
                return this.launchLocalWeb(build, NO_ABORT_SIGNAL);

            // Web (remote)
            case Runtime.WebRemote:
                if (CONFIG.performance) {
                    console.log(`${chalk.gray('[build]')} opening insiders.vscode.dev ${chalk.green(build.commit)} multiple times and measuring performance...`);
                    return this.measure(signal => this.launchWebPerformance(build, signal));
                }

                console.log(`${chalk.gray('[build]')} opening insiders.vscode.dev ${chalk.green(build.commit)}...`);
                return this.launchRemoteWeb(build);

            // Desktop
            case Runtime.DesktopLocal:
                if (CONFIG.performance) {
                    console.log(`${chalk.gray('[build]')} starting desktop build ${chalk.green(build.commit)} multiple times and measuring performance...`);
                    return this.measure(signal => this.launchElectron(build, signal));
                }

                console.log(`${chalk.gray('[build]')} starting desktop build ${chalk.green(build.commit)}...`);
                return this.launchElectron(build, NO_ABORT_SIGNAL);
        }
    }

    private async measure(launcher: (signal: AbortSignal) => Promise<IInstance>): Promise<IInstance> {
        let smallestEllapsed: number | undefined;

        for (let i = 0; i < PERFORMANCE_RUNS; i++) {
            console.log(`${chalk.gray('[perf]')} running session ${chalk.green(i + 1)} of ${chalk.green(PERFORMANCE_RUNS)}...`);

            // Perform a launch but timeout after 10 seconds
            // to make sure these runs never hang

            const abortController = new AbortController();
            let timedOut = false;

            const { ellapsed, stop } = await Promise.race<IInstance>([
                new Promise(resolve => setTimeout(() => {
                    timedOut = true;

                    resolve(NOOP_INSTANCE);
                }, PERFORMANCE_RUN_TIMEOUT)),
                launcher(abortController.signal)
            ]);

            if (timedOut) {
                console.log(`${chalk.red('[perf]')} timeout after ${chalk.green(`${PERFORMANCE_RUN_TIMEOUT}ms`)}`);
                abortController.abort();
            } else {
                if (typeof ellapsed === 'number') {
                    console.log(`${chalk.gray('[perf]')} ellapsed: ${chalk.green(`${ellapsed}ms`)}`);

                    if (typeof smallestEllapsed !== 'number') {
                        smallestEllapsed = ellapsed;
                    } else if (smallestEllapsed > ellapsed) {
                        smallestEllapsed = ellapsed;
                    }
                }
            }

            await stop();
        }

        if (typeof smallestEllapsed === 'number') {
            console.log(`${chalk.gray('[perf]')} best ellapsed: ${chalk.green(`${smallestEllapsed}ms`)}`);
        }

        return {
            ellapsed: smallestEllapsed,
            stop: NOOP_INSTANCE.stop
        }
    }

    private async launchWebPerformance(build: IBuild, signal: AbortSignal): Promise<IInstance> {
        let url: string;
        let server: IWebInstance | undefined;

        // Web local: launch local web server
        if (build.runtime === Runtime.WebLocal) {
            server = await this.launchLocalWebServer(build, signal);
            url = this.buildWebPerformanceUrl(build, server.url);
        }

        // Web remote: use remote URL
        else {
            url = this.buildWebPerformanceUrl(build, VSCODE_DEV_URL(build.commit));
        }

        if (signal.aborted) {
            server?.stop();

            return NOOP_INSTANCE;
        }

        // Use playwright to open the page (either local or remote)
        // and watch out for the desired performance measurement to
        // be printed to the console.

        const browser = await playwright.chromium.launch({ headless: false });

        function stop() {
            return Promise.allSettled([
                browser.close(),
                server?.stop()
            ]);
        }

        signal.addEventListener('abort', () => stop());
        if (signal.aborted) {
            stop();

            return NOOP_INSTANCE;
        }

        const page = await browser.newPage();
        await page.setViewportSize({ width: 1200, height: 800 });

        if (LOGGER.verbose) {
            page.on('pageerror', error => console.error(`Playwright ERROR: page error: ${error}`));
            page.on('crash', () => console.error('Playwright ERROR: page crash'));
            page.on('requestfailed', e => console.error('Playwright ERROR: Request Failed', e.url(), e.failure()?.errorText));
            page.on('response', response => {
                if (response.status() >= 400) {
                    console.error(`Playwright ERROR: HTTP status ${response.status()} for ${response.url()}`);
                }
            });
        }

        return new Promise<IInstance>(resolve => {
            page.on('console', async msg => {

                // Watch out for a console log message such as "[perf] from 'code/timeOrigin' to 'code/didStartWorkbench': 1888ms"
                // and extract the time

                const matches = /\[prof-timers\] (\d+)/.exec(msg.text());
                const ellapsed = matches?.[1] ? parseInt(matches[1]) : undefined;
                if (typeof ellapsed === 'number') {
                    resolve({ ellapsed, stop });
                }
            });

            page.goto(url);
        });
    }

    private buildWebPerformanceUrl(build: IBuild, baseUrl: string, startMark = 'code/timeOrigin', endMark = 'code/didStartWorkbench'): string {
        const url = new URL(baseUrl);

        // folder=<path to VS Code>
        if (build.runtime === Runtime.WebLocal) {
            url.searchParams.set('folder', GIT_VSCODE_FOLDER);
        }

        const payload: string[][] = [];

        // payload: profDurationMarkers
        payload.push(['profDurationMarkers', `${startMark},${endMark}`]);

        // payload: openFile (web local only)
        if (build.runtime === Runtime.WebLocal) {
            payload.push(['openFile', URI.file(join(GIT_VSCODE_FOLDER, 'package.json')).with({ scheme: 'vscode-remote', authority: 'localhost:9888' }).toString(true)]);
        }

        // payload: disable annoyers
        payload.push(['skipWelcome', 'true']);
        payload.push(['skipReleaseNotes', 'true']);

        url.searchParams.set('payload', JSON.stringify(payload));

        return url.href;
    }


    private async launchLocalWeb(build: IBuild, signal: AbortSignal): Promise<IInstance> {
        const instance = await this.launchLocalWebServer(build, signal);
        if (instance.url && !signal.aborted) {
            open(instance.url);
        }

        return instance;
    }

    private async launchLocalWebServer(build: IBuild, signal: AbortSignal): Promise<IWebInstance> {
        const cp = await this.spawnBuild(build);

        async function stop() {
            return new Promise<void>((resolve, reject) => {
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
            });
        }

        signal.addEventListener('abort', () => stop(), { once: true });
        if (signal.aborted) {
            stop();

            return NOOP_INSTANCE;
        }

        return new Promise<IWebInstance>(resolve => {
            cp.stdout.on('data', data => {
                if (LOGGER.verbose) {
                    console.log(`${chalk.gray('[server]')}: ${data.toString()}`);
                }

                const matches = Launcher.WEB_AVAILABLE_REGEX.exec(data.toString());
                const url = matches?.[1];
                if (url) {
                    resolve({ url, stop });
                }
            });

            cp.stderr.on('data', data => {
                if (LOGGER.verbose) {
                    console.log(`${chalk.red('[server]')}: ${data.toString()}`);
                }
            });
        });
    }

    private async launchRemoteWeb(build: IBuild): Promise<IInstance> {
        open(VSCODE_DEV_URL(build.commit));

        return NOOP_INSTANCE;
    }

    private async launchElectron(build: IBuild, signal: AbortSignal): Promise<IInstance> {
        const cp = await this.spawnBuild(build);

        async function stop() {
            cp.kill();
        }

        signal.addEventListener('abort', () => stop(), { once: true });
        if (signal.aborted) {
            stop();

            return NOOP_INSTANCE;
        }

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

        return { ellapsed, stop }
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
            EXTENSIONS_FOLDER,
            '--disable-workspace-trust',
            '--skip-welcome',
            '--skip-release-notes'
        ];

        if (build.runtime === Runtime.DesktopLocal) {
            args.push(

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
                    '--disable-features=CalculateNativeWinOcclusion',
                    '--prof-append-timers',
                    PERFORMANCE_FILE,
                    GIT_VSCODE_FOLDER,
                    join(GIT_VSCODE_FOLDER, 'package.json')
                );
            } else {
                args.push(
                    '--no-cached-data',
                    '--disable-telemetry' // only disable telemetry when not running performance tests to be able to look at perf marks
                );
            }
        }

        switch (build.runtime) {
            case Runtime.WebLocal:
            case Runtime.WebRemote:
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


            case Runtime.DesktopLocal:
                return spawn(executable, args);
        }
    }
}

export const launcher = new Launcher();