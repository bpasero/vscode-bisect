/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from "child_process";
import { promises } from "fs";
import { dirname } from "path";

export async function exists(path: string): Promise<boolean> {
    try {
        await promises.stat(path);

        return true;
    } catch (error) {
        return false;
    }
}

export async function unzip(source: string): Promise<void> {
    const destination = dirname(source);

    // *.zip: macOS, Windows
    if (source.endsWith('.zip')) {
        if (process.platform === 'win32') {
            spawnSync('powershell.exe', [
                '-NoProfile',
                '-ExecutionPolicy', 'Bypass',
                '-NonInteractive',
                '-NoLogo',
                '-Command',
                `Microsoft.PowerShell.Archive\\Expand-Archive -Path "${source}" -DestinationPath "${destination}"`
            ]);
        } else {
            spawnSync('unzip', [source, '-d', destination]);
        }
    }

    // *.tar.gz: Linux
    else {
        if (!await exists(destination)) {
            await promises.mkdir(destination); // tar does not create extractDir by default
        }

        spawnSync('tar', ['-xzf', source, '-C', destination]);
    }
}