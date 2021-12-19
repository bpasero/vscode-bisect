/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { program, Option } from "commander";
import { bisecter } from "./bisect";
import { Runtime } from "./constants";

interface Opts {
    runtime?: 'web' | 'desktop',
    good?: string,
    bad?: string
}

program
    .addOption(new Option('-r, --runtime <runtime>', 'whether to bisect with a browser (default) or electron version').choices(['web', 'desktop']))
    .option('-g, --good <commit>', 'commit hash of a released insiders that does not reproduce the issue')
    .option('-b, --bad <commit>', 'commit hash of a released insiders that reproduces the issue');

program.addHelpText('after', `
Note: if no commit is specified, vscode-bisect will automatically bisect the last 200 released insider builds.
`);

const opts: Opts = program.parse(process.argv).opts();

bisecter.start(opts.runtime === 'desktop' ? Runtime.Desktop : Runtime.Web, opts.good, opts.bad).catch(error => {
    console.error(`${error}`);
    process.exit(1);
});