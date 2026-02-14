import fs from "fs";
import os from "os";
import path from "path";

import { loadSecretsFromFiles } from "../../../src/config/loadSecrets";

describe("loadSecretsFromFiles", () => {
  const keys = ["TEST_SECRET", "TEST_SECRET_FILE", "TEST_SECRET_2", "TEST_SECRET_2_FILE"];

  const cleanupEnv = () => {
    for (const k of keys) {
      // eslint-disable-next-line functional/immutable-data
      delete process.env[k];
    }
  };

  beforeEach(() => {
    cleanupEnv();
  });

  afterEach(() => {
    cleanupEnv();
    jest.restoreAllMocks();
  });

  it("loads *_FILE values into env when the target var is missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "titan-shared-secrets-"));
    try {
      const secretPath = path.join(tmpDir, "secret.txt");
      fs.writeFileSync(secretPath, "supersecret\n", "utf8");

      // eslint-disable-next-line functional/immutable-data
      process.env.TEST_SECRET_FILE = secretPath;
      expect(process.env.TEST_SECRET).toBeUndefined();

      loadSecretsFromFiles();
      expect(process.env.TEST_SECRET).toBe("supersecret");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("does not override existing env vars", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "titan-shared-secrets-"));
    try {
      const secretPath = path.join(tmpDir, "secret.txt");
      fs.writeFileSync(secretPath, "newvalue\n", "utf8");

      // eslint-disable-next-line functional/immutable-data
      process.env.TEST_SECRET = "existing";
      // eslint-disable-next-line functional/immutable-data
      process.env.TEST_SECRET_FILE = secretPath;

      loadSecretsFromFiles();
      expect(process.env.TEST_SECRET).toBe("existing");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("warns when a secret file is missing and warnOnMissing=true", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    // eslint-disable-next-line functional/immutable-data
    process.env.TEST_SECRET_2_FILE = "/definitely/does/not/exist";

    loadSecretsFromFiles({ warnOnMissing: true });
    expect(warn).toHaveBeenCalled();
  });
});

