/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RELEASED_INSIDER_BUILDS_URL } from "./constants";
import { jsonGet } from "./fetch";

async function main(): Promise<void> {

    const commits = await jsonGet(RELEASED_INSIDER_BUILDS_URL.darwin);

    console.log(commits);
}

main();