import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { TSGhostAdminAPI } from '@ts-ghost/admin-api';

const api = new TSGhostAdminAPI(
	process.env.GHOST_URL || 'https://makeuoa.nz',
	env.GHOST_API_KEY || '',
	'v5.47.0'
);

export const GET: RequestHandler = async ({ url }) => {
	const members = await api.members.browse({ limit: 5 }).paginate();
	if (members.current.success) {
		const memberCount = members.current.meta.pagination.total;
		return json({
			count: memberCount,
			members: members.current.data.map((m: any) => {
				return m.name.split(' ')[0];
			})
		});
	}
	return error(500, JSON.stringify(members.current.errors));
};
