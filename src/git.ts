/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import chalk from 'chalk';
import { mkdirSync } from 'fs';
import simpleGit from 'simple-git';
import { GIT_FOLDER, GIT_REPO, GIT_VSCODE_FOLDER, LOGGER } from './constants';
import { exists } from './files';
import { storage } from './storage';

interface IBranchInfos {
    [commit: string]: string[] | undefined;
}

class Git {

    static {
        mkdirSync(GIT_FOLDER, { recursive: true });
    }

    private static readonly MAIN_BRANCH = 'main';

    private static readonly BRANCH_INFOS_STORAGE_KEY = 'git-branch-infos';

    private _whenReady: Promise<void> | undefined = undefined;
    get whenReady(): Promise<void> {
        if (!this._whenReady) {
            this._whenReady = this.init();
        }

        return this._whenReady;
    }

    private async init(): Promise<void> {

        // Bring up to date otherwise
        if (await exists(GIT_VSCODE_FOLDER)) {
            console.log(`${chalk.gray('[git]')} pulling VS Code changes into ${chalk.green(GIT_FOLDER)}...`);

            const git = simpleGit({ baseDir: GIT_VSCODE_FOLDER });
            await git.checkout('main');
            await git.pull();
        }

        // Clone repo if it does not exist
        else {
            console.log(`${chalk.gray('[git]')} cloning VS Code into ${chalk.green(GIT_VSCODE_FOLDER)} (this is only done once and can take a while)...`);

            const git = simpleGit();
            await git.clone(GIT_REPO, GIT_VSCODE_FOLDER);
        }
    }

    async isOnMainBranch(commit: string): Promise<boolean> {

        // Wait for init
        await this.whenReady;

        // Check storage for cached value
        let cachedBranchInfos = await storage.getValue<IBranchInfos>(Git.BRANCH_INFOS_STORAGE_KEY);
        if (!cachedBranchInfos) {
            cachedBranchInfos = {};
        }

        // Store in cache after resolving if not found
        if (!cachedBranchInfos[commit]) {
            try {
                const git = simpleGit({ baseDir: GIT_VSCODE_FOLDER });
                cachedBranchInfos[commit] = (await git.branch(['-a', '--contains', commit])).all;
                await storage.store(Git.BRANCH_INFOS_STORAGE_KEY, cachedBranchInfos);
            } catch (error) {
                if (LOGGER.verbose) {
                    console.log(`${chalk.gray('[git]')} checking ${commit} for being on branch "main" failed: ${error}`);
                }
            }
        }

        const found = cachedBranchInfos[commit]?.some(branch => branch === Git.MAIN_BRANCH);

        return !!found;
    }
}

export const git = new Git();