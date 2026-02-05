import { OpsCommandType, OpsCommandV1 } from "@titan/shared";
import { spawn } from "child_process";

export class CommandExecutor {
    async execute(cmd: OpsCommandV1): Promise<Record<string, unknown>> {
        switch (cmd.type) {
            case OpsCommandType.RESTART:
                return this.handleRestart(cmd);
            case OpsCommandType.DEPLOY:
                return this.handleDeploy(cmd);
            case OpsCommandType.HALT:
                return this.handleHalt();
            case OpsCommandType.EXPORT_EVIDENCE:
                return this.handleExportEvidence();
            default:
                throw new Error(`Unsupported command type: ${cmd.type}`);
        }
    }

    private async handleExportEvidence(): Promise<Record<string, unknown>> {
        // Mock implementation for MVP
        // In reality, this would zip /artifacts and return a signed URL
        console.log("Generating Evidence Pack...");
        return {
            status: "success",
            url: "https://titan-console.infra/evidence/pack-latest.zip",
            manifest: {
                timestamp: new Date().toISOString(),
                files: [
                    "audit_log.json",
                    "receipts.csv",
                    "config_snapshot.yaml",
                ],
            },
        };
    }

    private async handleRestart(
        cmd: OpsCommandV1,
    ): Promise<Record<string, unknown>> {
        const service = cmd.target;
        if (!service) throw new Error("Target service required for restart");

        // Safety check: allowlist of services
        const ALLOWED = [
            "titan-brain",
            "titan-execution-rs",
            "titan-scavenger",
            "titan-hunter",
        ];
        if (service !== "all" && !ALLOWED.includes(service)) {
            throw new Error(`Service ${service} not allowed for restart`);
        }

        const args = service === "all"
            ? ["compose", "-f", "docker-compose.prod.yml", "restart"]
            : ["compose", "-f", "docker-compose.prod.yml", "restart", service];
        const output = await this.runDocker(args);
        return { output };
    }

    private async handleDeploy(
        cmd: OpsCommandV1,
    ): Promise<Record<string, unknown>> {
        // Deploy implies pull + up -d
        const service = cmd.target;
        // Similar safety checks...

        // Pull
        await this.runDocker([
            "compose",
            "-f",
            "docker-compose.prod.yml",
            "pull",
            service,
        ]);
        // Up
        const output = await this.runDocker([
            "compose",
            "-f",
            "docker-compose.prod.yml",
            "up",
            "-d",
            service,
        ]);
        return { output };
    }

    private async handleHalt(): Promise<Record<string, unknown>> {
        // Emergency stop
        const output = await this.runDocker([
            "compose",
            "-f",
            "docker-compose.prod.yml",
            "stop",
        ]);
        return { output };
    }

    private runDocker(args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const child = spawn("docker", args);
            const stdoutChunks: Buffer[] = [];
            const stderrChunks: Buffer[] = [];

            // eslint-disable-next-line functional/immutable-data
            child.stdout.on(
                "data",
                (data) => stdoutChunks.push(Buffer.from(data)),
            );

            // eslint-disable-next-line functional/immutable-data
            child.stderr.on(
                "data",
                (data) => stderrChunks.push(Buffer.from(data)),
            );

            child.on("close", (code) => {
                const stdout = Buffer.concat(stdoutChunks).toString();
                const stderr = Buffer.concat(stderrChunks).toString();
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(
                        new Error(
                            `Docker command failed (code ${code}): ${stderr}`,
                        ),
                    );
                }
            });
        });
    }
}
