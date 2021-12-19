"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonGet = void 0;
const https_1 = __importDefault(require("https"));
function jsonGet(url) {
    return new Promise((resolve, reject) => {
        https_1.default.get(url, res => {
            if (res.statusCode === 204) {
                return resolve(undefined); // no update available
            }
            if (res.statusCode !== 200) {
                reject(`Failed to get response from update server (code: ${res.statusCode}, message: ${res.statusMessage})`);
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
            res.on('error', err => reject(err));
        });
    });
}
exports.jsonGet = jsonGet;
//# sourceMappingURL=fetch.js.map