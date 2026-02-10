import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import * as crypto from "crypto";
import * as os from "os";

/**
 * Generates a SLSA v1.0 Provenance predicate.
 * https://slsa.dev/spec/v1.0/provenance
 */

const OUTPUT_DIR = ".generated/provenance";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "provenance.json");

interface ProvenancePredicate {
    buildDefinition: {
        buildType: string;
        externalParameters: {
            source: {
                uri: string;
                digest: {
                    sha1: string;
                };
            };
            configSource: {
                uri: string;
                digest: {
                    sha1: string;
                };
                entryPoint: string;
            };
        };
        systemParameters: {
            hostname: string;
            platform: string;
            nodeVersion: string;
        };
    };
    runDetails: {
        builder: {
            id: string;
            version: string;
        };
        metadata: {
            invocationId: string;
            startedOn: string;
            finishedOn: string;
        };
        byproducts: Array<{
            uri: string;
            digest: {
                sha256: string;
            };
        }>;
    };
}

function getGitCommitHash(): string {
    try {
        return execSync("git rev-parse HEAD").toString().trim();
    } catch (e) {
        console.warn("Unable to get git commit hash, using UNKNOWN");
        return "UNKNOWN";
    }
}

function getGitRemote(): string {
    try {
        return execSync("git config --get remote.origin.url").toString().trim();
    } catch (e) {
        return "UNKNOWN";
    }
}

function calculateSha256(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash("sha256");
    hashSum.update(fileBuffer);
    return hashSum.digest("hex");
}

function generateProvenance() {
    const startTime = new Date().toISOString();
    console.log("🛡️  Generating SLSA Provenance...");

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const commitHash = getGitCommitHash();
    const repoUrl = getGitRemote();

    const provenance: ProvenancePredicate = {
        buildDefinition: {
            buildType:
                "https://github.com/peycheff-com/titan-trading-system/build-types/v1",
            externalParameters: {
                source: {
                    uri: repoUrl,
                    digest: {
                        sha1: commitHash, // Using SHA1 for git compat, though sha256 is preferred for verification
                    },
                },
                configSource: {
                    uri: repoUrl,
                    digest: {
                        sha1: commitHash,
                    },
                    entryPoint: "turbo run build",
                },
            },
            systemParameters: {
                hostname: os.hostname(),
                platform: process.platform,
                nodeVersion: process.version,
            },
        },
        runDetails: {
            builder: {
                id: "https://framework.titan-trading.com/builder/titan-sota-builder",
                version: "1.0.0",
            },
            metadata: {
                invocationId: crypto.randomUUID(),
                startedOn: startTime,
                finishedOn: new Date().toISOString(),
            },
            byproducts: [
                // List key build artifacts if we wanted to verify them.
                // For now, we list the package.json as a proxy for the project root.
                {
                    uri: "package.json",
                    digest: {
                        sha256: calculateSha256("package.json"),
                    },
                },
            ],
        },
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(provenance, null, 2));
    console.log(`✅ Provenance generated at: ${OUTPUT_FILE}`);
}

generateProvenance();
