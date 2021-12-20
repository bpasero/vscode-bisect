/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { program, Option } from "commander";
import { rmSync } from "fs";
import { bisecter } from "./bisect";
import { BUILD_FOLDER, LOGGER, Runtime } from "./constants";

module.exports = async function (argv: string[]): Promise<void> {

    interface Opts {
        runtime?: 'web' | 'desktop';
        good?: string;
        bad?: string;
        verbose?: boolean;
        clean?: boolean;
    }

    program
        .addOption(new Option('-r, --runtime <runtime>', 'whether to bisect with a web (default) or desktop version').choices(['web', 'desktop']))
        .option('-g, --good <commit>', 'commit hash of a released insiders that does not reproduce the issue')
        .option('-b, --bad <commit>', 'commit hash of a released insiders that reproduces the issue')
        .option('-c, --clean', 'deletes the cache folder that contains all the builds (use only for troubleshooting)')
        .option('-v, --verbose', 'logs verbose output to the console when errors occur');

    program.addHelpText('after', `
Note: if no commit is specified, vscode-bisect will automatically bisect the last 200 released insider builds.

Builds are stored and cached on disk in ${BUILD_FOLDER}
    `);

    const opts: Opts = program.parse(argv).opts();

    if (opts.verbose) {
        LOGGER.verbose = true;
    }

    if (opts.clean) {
        try {
            rmSync(BUILD_FOLDER, { recursive: true });
        } catch (error) { }
    }

    bisecter.start(opts.runtime === 'desktop' ? Runtime.Desktop : Runtime.Web, opts.good, opts.bad).catch(error => {
        console.error(`${error}`);
        process.exit(1);
    });
}