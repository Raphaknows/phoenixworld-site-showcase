import { edge, type GateContext } from '../src/gate/gate';

export const onRequest = (ctx: GateContext): Promise<Response> => edge(ctx);
