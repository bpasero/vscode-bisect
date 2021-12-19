/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname, join } from "path";

const ROOT = join(dirname(__dirname));

export const BUILD_FOLDER = join(ROOT, '.builds');

const DATA_FOLDER = join(ROOT, '.data');
export const USER_DATA_FOLDER = join(DATA_FOLDER, 'data');
export const EXTENSIONS_FOLDER = join(DATA_FOLDER, 'extensions');

export enum Platform {
    MacOSX64 = 1,
    LinuxX64 = 2,
    WindowsX64 = 3
}

export const platform: Platform = process.platform === 'win32' ? Platform.WindowsX64 : process.platform === 'darwin' ? Platform.MacOSX64 : Platform.LinuxX64;