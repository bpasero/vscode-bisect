/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { builds, Runtime } from "./builds";
import { launcher } from "./launcher";

async function main(): Promise<void> {

    // Pick a build
    const releasedBuilds = await builds.fetchBuilds(Runtime.Web);
    const build = releasedBuilds[0];

    // Install build
    await builds.installBuild(build);

    // Launch build
    const instance = await launcher.launch(build);

    setTimeout(() => {
        instance.stop();
    }, 10000);
}

main();