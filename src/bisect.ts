/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import prompts from "prompts";
import chalk from "chalk";
import { builds, IBuild } from "./builds";
import { Runtime } from "./constants";
import { launcher } from "./launcher";

enum BisectResponse {
    Good = 1,
    Bad
}

class Bisecter {

    async start(runtime: Runtime = Runtime.Web, goodCommit?: string, badCommit?: string): Promise<void> {

        // Get builds to bisect
        const buildsRange = await this.fetchBuilds(runtime, goodCommit, badCommit);

        console.log(`Bisecting ${chalk.green(buildsRange.length)} builds (roughly ${chalk.green(Math.round(Math.log2(buildsRange.length)))} steps)`);

        // Start bisecting

        let goodBuild: IBuild | undefined = undefined;
        let badBuild: IBuild | undefined = undefined;

        let currentChunk = Math.round(buildsRange.length / 2);
        let currentIndex = currentChunk;

        function pickNext(isGood: boolean): boolean {

            // Binary search is done
            if (currentChunk === 1) {
                return true;
            }

            // Binary search is not done
            else {
                currentChunk = Math.round(currentChunk / 2);
                currentIndex = isGood ? currentIndex - currentChunk /* try newer */ : currentIndex + currentChunk /* try older */;

                return false;
            }
        }

        let build: IBuild;
        while (build = buildsRange[currentIndex]) {
            const response = await this.tryBuild(build);
            if (response === BisectResponse.Bad) {
                badBuild = build;
            } else {
                goodBuild = build;
            }

            const finished = pickNext(response === BisectResponse.Good);
            if (finished) {
                break;
            }
        }

        if (goodBuild && badBuild) {
            console.log(`${chalk.green(badBuild.commit)} is the first bad commit: Diff: https://github.com/microsoft/vscode/compare/${goodBuild.commit}...${badBuild.commit}`);
        } else if (badBuild) {
            console.log(chalk.red('All builds are bad!'));
        } else {
            console.log(chalk.green('All builds are good!'));
        }
    }

    private async tryBuild(build: IBuild): Promise<BisectResponse> {
        console.log(`Launching: ${chalk.green(build.commit)} ...`);

        const instance = await launcher.launch(build);

        const response = await prompts([
            {
                type: 'select',
                name: 'status',
                message: `Is ${build.commit} good or bad?`,
                choices: [
                    { title: 'Good', value: 'good' },
                    { title: 'Bad', value: 'bad' }
                ],
            }
        ]);

        await instance.stop();

        return response.status === 'good' ? BisectResponse.Good : BisectResponse.Bad;
    }

    private async fetchBuilds(runtime: Runtime = Runtime.Web, goodCommit?: string, badCommit?: string): Promise<IBuild[]> {
        const allBuilds = await builds.fetchBuilds(runtime);

        let goodCommitIndex = allBuilds.length - 1;  // last build (oldest) by default
        let badCommitIndex = 0;                     // first build (newest) by default

        if (typeof goodCommit === 'string') {
            const candidateGoodCommitIndex = this.indexOf(goodCommit, allBuilds);
            if (typeof candidateGoodCommitIndex !== 'number') {
                throw new Error(`Provided good commit ${goodCommit} is not a released insiders build.`);
            }

            goodCommitIndex = candidateGoodCommitIndex;
        }

        if (typeof badCommit === 'string') {
            const candidateBadCommitIndex = this.indexOf(badCommit, allBuilds);
            if (typeof candidateBadCommitIndex !== 'number') {
                throw new Error(`Provided bad commit ${badCommit} is not a released insiders build.`);
            }

            badCommitIndex = candidateBadCommitIndex;
        }

        if (badCommitIndex >= goodCommitIndex) {
            throw new Error(`Provided bad commit ${badCommit} cannot be older or same as good commit ${goodCommit}.`);
        }

        return allBuilds.slice(badCommitIndex, goodCommitIndex + 1);
    }

    private indexOf(commit: string, builds: IBuild[]): number | undefined {
        for (let i = 0; i < builds.length; i++) {
            const build = builds[i];
            if (build.commit === commit) {
                return i;
            }
        }

        return undefined;
    }
}

export const bisecter = new Bisecter();