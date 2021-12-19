/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { builds, Runtime } from "./builds";
import { unzip } from "./files";

async function main(): Promise<void> {

    // Download build
    const releasedBuilds = await builds.fetchBuilds(Runtime.Web);
    const buildPath = await builds.fetchBuild(releasedBuilds[0]);

    // Unzip build
    await unzip(buildPath);
}

main();