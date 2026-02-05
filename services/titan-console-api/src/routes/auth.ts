import { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

export default async function authRoutes(fastify: FastifyInstance) {
    fastify.post("/auth/login", async (request, reply) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { operatorId, password } = request.body as any;

        // TODO: Verify against secure storage/hash or NATS request to Brain
        // For MVP Phase 2, we use a master password form env or default
        const MASTER_PASSWORD = process.env.TITAN_MASTER_PASSWORD ||
            "titan-admin";
        const VALID_OPERATORS = ["admin", "operator", "viewer"];

        if (
            VALID_OPERATORS.includes(operatorId) && password === MASTER_PASSWORD
        ) {
            const secret = process.env.JWT_SECRET || "dev-secret";
            const token = jwt.sign(
                {
                    id: operatorId,
                    role: operatorId === "admin" ? "admin" : "operator",
                },
                secret,
                { expiresIn: "8h" },
            );
            return { token };
        }

        return reply.code(401).send({ error: "Invalid credentials" });
    });
}
