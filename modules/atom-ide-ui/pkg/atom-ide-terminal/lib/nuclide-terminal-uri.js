/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow strict
 * @format
 */

import type {Command} from './pty-service/rpc-types';
import type {TerminalInfo} from './types';

import crypto from 'crypto';
import invariant from 'assert';
import url from 'url';
import uuid from 'uuid';
import isEmpty from 'lodash/isEmpty';

// Generate a unique random token that is included in every URI we generate.
// We use this to check that URIs containing shell commands and similarly
// sensitive data were generated by this instance of Nuclide.  The goal is
// to prevent externally generated URIs from ever resulting in command
// execution.
const trustToken = crypto.randomBytes(256).toString('hex');

// The external interface TerminalInfo leaves everything optional.
// When we open a terminal we will instantiate missing fields with defaults.
export type InstantiatedTerminalInfo = {
  title: string,
  key: string,
  remainOnCleanExit: boolean,
  defaultLocation: atom$PaneLocation | 'pane',
  icon: string,
  trustToken: string,
  command?: Command,
  cwd: string,
  environmentVariables?: Map<string, string>,
  preservedCommands: Array<string>,
  initialInput: string,
};

export const URI_PREFIX = 'atom://nuclide-terminal-view';
export const TERMINAL_DEFAULT_LOCATION = 'pane';
export const TERMINAL_DEFAULT_ICON = 'terminal';
export const TERMINAL_DEFAULT_INFO = {
  remainOnCleanExit: false,
  defaultLocation: TERMINAL_DEFAULT_LOCATION,
  icon: TERMINAL_DEFAULT_ICON,
  initialInput: '',
  title: '',
  cwd: '',
  preservedCommands: [],
  trustToken,
};

export function uriFromInfo(
  info: TerminalInfo | InstantiatedTerminalInfo,
): string {
  const uri = url.format({
    protocol: 'atom',
    host: 'nuclide-terminal-view',
    slashes: true,
    query: {
      cwd: info.cwd == null ? '' : info.cwd,
      command: info.command == null ? '' : JSON.stringify(info.command),
      title: info.title == null ? '' : info.title,
      key: info.key != null && info.key !== '' ? info.key : uuid.v4(),
      remainOnCleanExit: info.remainOnCleanExit,
      defaultLocation: info.defaultLocation,
      icon: info.icon,
      environmentVariables:
        info.environmentVariables != null
          ? JSON.stringify([...info.environmentVariables])
          : '',
      preservedCommands: JSON.stringify(info.preservedCommands || []),
      initialInput: info.initialInput != null ? info.initialInput : '',
      trustToken,
    },
  });
  invariant(uri.startsWith(URI_PREFIX));
  return uri;
}

export function infoFromUri(
  paneUri: string,
  uriFromTrustedSource: boolean = false,
): InstantiatedTerminalInfo {
  const {query} = url.parse(paneUri, true);

  if (isEmpty(query)) {
    // query can be null, '', or {}
    return {...TERMINAL_DEFAULT_INFO, key: uuid.v4()};
  } else {
    invariant(query != null);
    const cwd = query.cwd ? {cwd: query.cwd} : {};
    const command = query.command ? {command: JSON.parse(query.command)} : {};
    const title = query.title ? {title: query.title} : {};
    const remainOnCleanExit = query.remainOnCleanExit === 'true';
    const key = query.key;
    const defaultLocation = query.defaultLocation || TERMINAL_DEFAULT_LOCATION;
    const icon = query.icon || TERMINAL_DEFAULT_ICON;
    const environmentVariables = query.environmentVariables
      ? new Map(JSON.parse(query.environmentVariables))
      : new Map();
    const preservedCommands = JSON.parse(query.preservedCommands || '[]');
    const initialInput = query.initialInput || '';

    // Information that can affect the commands executed by the terminal,
    // and that therefore must come from a trusted source.
    //
    // If we detect that the URL did not come from this instance of Nuclide,
    // we just omit these fields so the user gets a default shell.
    const trustedFields = {
      ...cwd,
      ...command,
      environmentVariables,
      preservedCommands,
      initialInput,
    };

    // Everything here is cosmetic information that does not affect
    // processes running in the resulting terminal.
    const untrustedFields = {
      ...title,
      remainOnCleanExit,
      defaultLocation,
      icon,
      key,
    };

    const isTrusted = uriFromTrustedSource || query.trustToken === trustToken;
    return {
      ...untrustedFields,
      ...(isTrusted ? trustedFields : TERMINAL_DEFAULT_INFO),
    };
  }
}
