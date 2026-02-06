export type LoadSecretsOptions = {
    /**
     * When true, logs warnings for missing files.
     */
    warnOnMissing?: boolean;
};
/**
 * Load environment variables from *_FILE paths (Docker secrets/Vault agent mounts).
 * If FOO is unset and FOO_FILE is set, the file contents are read into FOO.
 */
export declare function loadSecretsFromFiles(options?: LoadSecretsOptions): void;
//# sourceMappingURL=loadSecrets.d.ts.map