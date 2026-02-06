import fs from 'fs';
const FILE_SUFFIX = '_FILE';
/**
 * Load environment variables from *_FILE paths (Docker secrets/Vault agent mounts).
 * If FOO is unset and FOO_FILE is set, the file contents are read into FOO.
 */
export function loadSecretsFromFiles(options = {}) {
    const warnOnMissing = options.warnOnMissing ?? false;
    for (const [key, value] of Object.entries(process.env)) {
        if (!key.endsWith(FILE_SUFFIX)) {
            continue;
        }
        const targetKey = key.slice(0, -FILE_SUFFIX.length);
        if (process.env[targetKey]) {
            continue;
        }
        if (!value) {
            continue;
        }
        try {
            const secretValue = fs.readFileSync(value, 'utf8').trim();
            if (secretValue.length > 0) {
                // eslint-disable-next-line functional/immutable-data
                process.env[targetKey] = secretValue;
            }
        }
        catch (error) {
            if (warnOnMissing) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Secret file missing for ${targetKey}: ${message}`);
            }
        }
    }
}
//# sourceMappingURL=loadSecrets.js.map