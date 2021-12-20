/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import prompts from 'prompts';
import chalk from 'chalk';
import open from 'open';
import { builds, IBuild } from './builds';
import { Runtime } from './constants';
import { launcher } from './launcher';

enum BisectResponse {
    Good = 1,
    Bad,
    Quit
}

interface IBisectState {
    currentChunk: number;
    currentIndex: number;
}

class Bisecter {

    async start(runtime: Runtime = Runtime.Web, goodCommit?: string, badCommit?: string): Promise<void> {

        // Get builds to bisect
        const buildsRange = await builds.fetchBuilds(runtime, goodCommit, badCommit);

        console.log(`Bisecting ${chalk.green(buildsRange.length)} builds (roughly ${chalk.green(Math.round(Math.log2(buildsRange.length)))} steps)`);

        // Start bisecting from the middle of the builds range
        const initialState = Math.round(buildsRange.length / 2);
        const state: IBisectState = {
            currentChunk: initialState,
            currentIndex: initialState
        }

        let goodBuild: IBuild | undefined = undefined;
        let badBuild: IBuild | undefined = undefined;
        let build: IBuild;
        let quit = false;

        // Go over next builds for as long as we are not done...
        while (build = buildsRange[state.currentIndex]) {
            const response = await this.tryBuild(build);
            if (response === BisectResponse.Bad) {
                badBuild = build;
            } else if (response === BisectResponse.Good) {
                goodBuild = build;
            } else {
                quit = true;
                break;
            }

            const finished = this.nextState(state, response);
            if (finished) {
                break;
            }
        }

        if (!quit) {
            return this.finishBisect(badBuild, goodBuild);
        }
    }

    private async finishBisect(badBuild: IBuild | undefined, goodBuild: IBuild | undefined): Promise<void> {
        if (goodBuild && badBuild) {
            console.log(`${chalk.green(badBuild.commit)} is the first bad commit after ${chalk.green(goodBuild.commit)}.`);

            const response = await prompts([
                {
                    type: "confirm",
                    name: 'open',
                    initial: true,
                    message: 'Would you like to open GitHub for the list of changes?',

                }
            ]);

            if (response.open) {
                open(`https://github.com/microsoft/vscode/compare/${goodBuild.commit}...${badBuild.commit}`);
            }

            console.log(`
Run the following commands to continue bisecting via git in a folder where VS Code is checked out to:

${chalk.green(`git bisect start && git bisect bad ${badBuild.commit} && git bisect good ${goodBuild.commit}`)}

`);
        } else if (badBuild) {
            console.log(chalk.red('All builds are bad!'));
        } else {
            console.log(chalk.green('All builds are good!'));
        }
    }

    private nextState(state: IBisectState, response: BisectResponse): boolean {

        // Binary search is done
        if (state.currentChunk === 1) {
            return true;
        }

        // Binary search is not done
        else {
            state.currentChunk = Math.round(state.currentChunk / 2);
            state.currentIndex = response === BisectResponse.Good ? state.currentIndex - state.currentChunk /* try newer */ : state.currentIndex + state.currentChunk /* try older */;

            return false;
        }
    }

    private async tryBuild(build: IBuild): Promise<BisectResponse> {
        const instance = await launcher.launch(build);

        const response = await prompts([
            {
                type: 'select',
                name: 'status',
                message: `Is ${build.commit} good or bad?`,
                choices: [
                    { title: 'Good', value: 'good' },
                    { title: 'Bad', value: 'bad' }
                ]
            }
        ]);

        await instance.stop();

        return response.status === 'good' ? BisectResponse.Good : response.status === 'bad' ? BisectResponse.Bad : BisectResponse.Quit;
    }
}

export const bisecter = new Bisecter();