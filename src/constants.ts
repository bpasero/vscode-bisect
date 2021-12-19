/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(tmpdir(), 'vscode-bisect');

export const BUILD_FOLDER = join(ROOT, '.builds');

export const DATA_FOLDER = join(ROOT, '.data');
export const USER_DATA_FOLDER = join(DATA_FOLDER, 'data');
export const EXTENSIONS_FOLDER = join(DATA_FOLDER, 'extensions');

export enum Platform {
    MacOSX64 = 1,
    MacOSArm,
    LinuxX64,
    LinuxArm,
    WindowsX64,
    WindowsArm
}

export const platform = (() => {
    if (process.platform === 'win32') {
        return process.arch === 'arm64' ? Platform.WindowsArm : Platform.WindowsX64;
    }

    if (process.platform === 'darwin') {
        return process.arch === 'arm64' ? Platform.MacOSArm : Platform.MacOSX64;
    }

    if (process.platform === 'linux') {
        return process.arch === 'arm64' ? Platform.LinuxArm : Platform.LinuxX64;
    }

    throw new Error('Unsupported platform.');
})();

export enum Runtime {
    Web = 1,
    Desktop
}