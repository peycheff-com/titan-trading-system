import { FastifyInstance } from 'fastify';
import {
  calculateOpsSignature,
  getNatsClient,
  OpsCommandSchemaV1,
  TITAN_SUBJECTS,
} from '@titan/shared';
import { v4 as uuidv4 } from 'uuid';

export default async function opsRoutes(fastify: FastifyInstance) {
  fastify.post('/ops/command', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = (request as any).user;
    console.log(`[titan-console-api] Command initiated by ${user?.id}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = request.body as any;

    // Construct Command
    const unsignedCmd = {
      v: 1,
      id: uuidv4(),
      ts: new Date().toISOString(),
      type: body.type, // e.g. RESTART
      target: body.target,
      params: body.params || {},
      meta: {
        initiator_id: user.id,
        reason: body.reason || 'Console API Action',
        signature: '',
      },
    };

    // calculate signature
    const secret = process.env.OPS_SECRET;
    if (!secret) {
      throw new Error('OPS_SECRET not configured');
    }
    const cmd = {
      ...unsignedCmd,
      meta: {
        ...unsignedCmd.meta,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signature: calculateOpsSignature(unsignedCmd as any, secret),
      },
    };

    // Validate
    const parse = OpsCommandSchemaV1.safeParse(cmd);
    if (!parse.success) {
      return reply.code(400).send(parse.error);
    }

    // Publish to NATS
    const nats = getNatsClient();
    await nats.publish(TITAN_SUBJECTS.OPS.COMMAND, cmd);

    return { status: 'dispatched', command_id: cmd.id };
  });
}
