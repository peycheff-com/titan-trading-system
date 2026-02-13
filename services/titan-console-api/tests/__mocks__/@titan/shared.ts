import { jest } from '@jest/globals';

export const Logger = {
  getInstance: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  })),
};

export const getNatsClient = jest.fn(() => ({
  connect: jest.fn().mockImplementation(() => Promise.resolve()),
  publish: jest.fn().mockImplementation(() => Promise.resolve()),
  subscribe: jest.fn(),
  headers: jest.fn(),
}));

export const calculateOpsSignature = jest.fn(() => 'mock-signature');

export const OpsCommandSchemaV1 = {
  safeParse: jest.fn(() => ({ success: true })),
};

export const TITAN_SUBJECTS = {
  OPS: { COMMAND: 'titan.cmd.ops.command.v1' },
};

export const CredentialVault = {
  getInstance: jest.fn(),
};

export const getCredentialVault = jest.fn();
