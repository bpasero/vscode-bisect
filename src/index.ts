/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import chalk from 'chalk';
import { program, Option } from 'commander';
import { rmSync } from 'fs';
import prompts from 'prompts';
import { bisecter } from './bisect';
import { BUILD_FOLDER, CONFIG, LOGGER, ROOT, Runtime } from './constants';

module.exports = async function (argv: string[]): Promise<void> {

    interface Opts {
        runtime?: 'web' | 'desktop';
        good?: string;
        bad?: string;
        verbose?: boolean;
        clean?: boolean;
        verifyMainBranch: boolean;
    }

    program
        .addOption(new Option('-r, --runtime <runtime>', 'whether to bisect with a web or desktop (default) version').choices(['web', 'desktop']))
        .option('-g, --good <commit>', 'commit hash of a released insiders that does not reproduce the issue')
        .option('-b, --bad <commit>', 'commit hash of a released insiders that reproduces the issue')
        .option('--verify-main-branch', 'ensure only commits from "main" branch are tested (very slow on first run!)')
        .option('-c, --clean', 'deletes the cache folder (use only for troubleshooting)')
        .option('-v, --verbose', 'logs verbose output to the console when errors occur');

    program.addHelpText('after', `
Note: if no commit is specified, vscode-bisect will automatically bisect the last 200 released insider builds.

Builds are stored and cached on disk in ${BUILD_FOLDER}
    `);

    const opts: Opts = program.parse(argv).opts();

    if (opts.verbose) {
        LOGGER.verbose = true;
    }

    if (opts.verifyMainBranch) {
        CONFIG.enableGitBranchChecks = true;
    }

    if (opts.clean) {
        try {
            rmSync(ROOT, { recursive: true });
        } catch (error) { }
    }

    let badCommit = opts.bad;
    if (!badCommit) {
        const response = await prompts([
            {
                type: 'text',
                name: 'bad',
                initial: '',
                message: 'Commit of released insiders build that reproduces the issue (leave empty to pick the latest build)',
            }
        ]);

        if (typeof response.bad === 'undefined') {
            process.exit();
        } else if (response.bad) {
            badCommit = response.bad;
        }
    }

    let goodCommit = opts.good;
    if (!goodCommit) {
        const response = await prompts([
            {
                type: 'text',
                name: 'good',
                initial: '',
                message: 'Commit of released insiders build that does not reproduce the issue (leave empty to pick the oldest build)',
            }
        ]);

        if (typeof response.good === 'undefined') {
            process.exit();
        } else if (response.good) {
            goodCommit = response.good;
        }
    }

    bisecter.start(opts.runtime === 'web' ? Runtime.Web : Runtime.Desktop, goodCommit, badCommit).catch(error => {
        console.error(`${error}`);
        console.log(`You can run ${chalk.green('vscode-bisect --verbose')} for more detailed output and ${chalk.green('vscode-bisect --clean')} for a fresh start without caches.`);
        process.exit(1);
    });
}