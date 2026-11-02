import { BUILD_ID } from '../build-info';

export const GET = () => new Response(BUILD_ID + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
