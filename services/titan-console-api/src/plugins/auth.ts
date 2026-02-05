import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import jwt from "jsonwebtoken";

declare module "fastify" {
    interface FastifyInstance {
        authenticate: (
            request: FastifyRequest,
            reply: FastifyReply,
        ) => Promise<void>;
    }
}

export default fp(async function (fastify: FastifyInstance) {
    fastify.decorate(
        "authenticate",
        async function (request: FastifyRequest, reply: FastifyReply) {
            try {
                const authHeader = request.headers.authorization;
                if (!authHeader) {
                    throw new Error("No authorization header");
                }
                const token = authHeader.replace("Bearer ", "");
                const secret = process.env.JWT_SECRET || "dev-secret";

                const decoded = jwt.verify(token, secret);
                (request as any).user = decoded;
            } catch (err) {
                reply.code(401).send({ error: "Unauthorized" });
            }
        },
    );
});
